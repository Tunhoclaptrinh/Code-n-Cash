import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Repository } from "../common/repository";
import { BaseService } from "../common/services/base.service";
import type { Actor, RecordEntity } from "../common/types";
import { repoRoot } from "../common/paths";
import { exactDecimal } from "../common/field-validation";
import { TABLE, COLUMNS } from "../domain/records";
import { entity } from "../domain/factory";
import { loadDataPack, dataPackDir } from "../domain/datapack";
import { readRecords } from "../domain/csv";
import { runEngine } from "../domain/engine";
import { toCents } from "../domain/templates";
import { BUSINESS_EVENTS } from "../domain/vocabulary";
import { versionHash, versionRuleSet } from "../domain/rule-versions";

const mutableRuleKeys = new Set([
  "condition_expression",
  "payable_amount_formula",
  "penalty_amount_formula",
  "rule_name",
  "rule_description_vi",
]);
const requireText = (value: unknown, max: number) => {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new BadRequestException("RULE_VERSION_INVALID");
  return value.trim();
};
const checkState = (
  record: RecordEntity,
  expected: unknown,
  status: string,
) => {
  if (record.version !== expected)
    throw new ConflictException("VERSION_CONFLICT");
  if (record.status !== status)
    throw new BadRequestException("RULE_VERSION_LOCKED");
};
@Injectable()
export class RulesService {
  constructor(
    @Inject(Repository) private repo: Repository,
    @Inject(BaseService) private base: BaseService,
  ) {}
  async list() {
    return (await this.repo.list("rule-versions"))
      .map((version) => ({
        ...version,
        intact: version.hash === versionHash(version),
      }))
      .reverse();
  }
  private async get(id: string) {
    const record = (await this.repo.list("rule-versions")).find(
      (version) => version.id === id,
    );
    if (!record) throw new NotFoundException("RECORD_NOT_FOUND");
    return record;
  }
  async create(body: { name?: unknown; reason?: unknown }, actor: Actor) {
    const name = requireText(body?.name, 120),
      reason = requireText(body?.reason, 2000);
    return this.repo.transact(
      ["rule-versions", TABLE.rules, "milestone-templates"],
      (tables) => {
        const active = tables["rule-versions"].find(
          (version) => version.status === "PUBLISHED",
        );
        const rules =
          active?.rules ??
          tables[TABLE.rules]
            .filter((rule) => rule.origin === "DATA_PACK")
            .map((rule) =>
              Object.fromEntries(
                COLUMNS.payment_rules.map((key) => [key, rule[key]]),
              ),
            );
        const templates =
          active?.templates ??
          tables["milestone-templates"].filter(
            (template) => template.origin === "DATA_PACK",
          );
        const version = entity(randomUUID(), {
          name,
          reason,
          status: "DRAFT",
          createdBy: actor.id,
          submittedBy: null,
          reviewedBy: null,
          publishedAt: null,
          rules: structuredClone(rules),
          templates: structuredClone(templates),
          validation: null,
          organizationId: "OPS",
        });
        Object.assign(version, { hash: versionHash(version) });
        tables["rule-versions"].push(version);
        return version;
      },
      (version) => [
        this.base.auditRecord(
          "RULE_VERSION_CREATE",
          "rule-versions",
          version.id,
          actor,
        ),
      ],
    );
  }
  private async validateContent(rules: unknown, templates: unknown) {
    if (
      !Array.isArray(rules) ||
      !Array.isArray(templates) ||
      [...rules, ...templates].some(
        (row) => !row || typeof row !== "object" || Array.isArray(row),
      )
    )
      throw new BadRequestException("RULE_VERSION_INVALID");
    const originals = (await loadDataPack()).payment_rules;
    if (
      rules.length !== originals.length ||
      new Set(rules.map((rule) => rule.rule_id)).size !== originals.length
    )
      throw new BadRequestException("RULE_VERSION_INVALID");
    for (const rule of rules) {
      const original = originals.find((row) => row.rule_id === rule.rule_id);
      if (
        !original ||
        Object.keys(rule).some(
          (key) => !COLUMNS.payment_rules.includes(key as never),
        )
      )
        throw new BadRequestException("RULE_VERSION_INVALID");
      for (const key of COLUMNS.payment_rules) {
        requireText(rule[key], 2000);
        if (!mutableRuleKeys.has(key) && rule[key] !== original[key])
          throw new BadRequestException("RULE_VERSION_INVALID");
      }
    }
    const base = (await this.repo.list("milestone-templates")).filter(
      (template) => template.origin === "DATA_PACK",
    );
    if (
      templates.length !== base.length ||
      new Set(templates.map((template) => template.id)).size !== base.length
    )
      throw new BadRequestException("RULE_VERSION_INVALID");
    const totals = new Map<string, bigint>();
    for (const template of templates) {
      const original = base.find((row) => row.id === template.id);
      if (
        !original ||
        Object.keys(template).some((key) => !(key in original)) ||
        Object.keys(original).some(
          (key) =>
            ![
              "paymentPercent",
              "offsetDays",
              "latePenalty",
              "requiredEvents",
            ].includes(key) && template[key] !== original[key],
        ) ||
        !exactDecimal(template.paymentPercent, "100") ||
        !Number.isInteger(template.offsetDays) ||
        template.offsetDays < 0 ||
        template.offsetDays > 36500 ||
        typeof template.latePenalty !== "boolean" ||
        typeof template.requiredEvents !== "string" ||
        !template.requiredEvents ||
        template.requiredEvents
          .split(";")
          .some((event: string) => !BUSINESS_EVENTS.includes(event as never))
      )
        throw new BadRequestException("RULE_VERSION_INVALID");
      totals.set(
        template.workflowTemplate,
        (totals.get(template.workflowTemplate) ?? 0n) +
          toCents(template.paymentPercent),
      );
    }
    if ([...totals.values()].some((total) => total !== 10000n))
      throw new BadRequestException("RULE_VERSION_INVALID");
  }
  async save(
    id: string,
    body: { version?: unknown; rules?: unknown; templates?: unknown },
    actor: Actor,
  ) {
    await this.validateContent(body.rules, body.templates);
    return this.repo.transact(
      ["rule-versions"],
      (tables) => {
        const record = tables["rule-versions"].find((row) => row.id === id);
        if (!record) throw new NotFoundException("RECORD_NOT_FOUND");
        checkState(record, body.version, "DRAFT");
        if (record.createdBy !== actor.id)
          throw new ForbiddenException("RULE_VERSION_AUTHOR_REQUIRED");
        Object.assign(record, {
          rules: body.rules,
          templates: body.templates,
          version: record.version + 1,
          updatedAt: new Date().toISOString(),
        });
        record.hash = versionHash(record);
        return record;
      },
      () => [
        this.base.auditRecord("RULE_VERSION_SAVE", "rule-versions", id, actor),
      ],
    );
  }
  private validateExpressions(rules: unknown): Promise<void> {
    return new Promise((resolveOk, reject) => {
      const process = spawn(
        processEnvPython(),
        ["apps/engine/validate_rules.py"],
        { cwd: repoRoot(), stdio: ["pipe", "ignore", "ignore"] },
      );
      const timer = setTimeout(() => {
        process.kill();
        reject(new BadRequestException("RULE_VERSION_INVALID"));
      }, 5000);
      process.on("error", () => {
        clearTimeout(timer);
        reject(new BadRequestException("RULE_VERSION_INVALID"));
      });
      process.on("close", (code) => {
        clearTimeout(timer);
        code === 0
          ? resolveOk()
          : reject(new BadRequestException("RULE_VERSION_INVALID"));
      });
      process.stdin.on("error", () => {});
      process.stdin.end(JSON.stringify(rules));
    });
  }
  async submit(id: string, expected: unknown, actor: Actor) {
    const snapshot = await this.get(id);
    checkState(snapshot, expected, "DRAFT");
    if (snapshot.createdBy !== actor.id)
      throw new ForbiddenException("RULE_VERSION_AUTHOR_REQUIRED");
    await this.validateContent(snapshot.rules, snapshot.templates);
    await this.validateExpressions(snapshot.rules);
    const pack = await loadDataPack();
    const result = await runEngine({
      [TABLE.contracts]: pack.contracts as never,
      [TABLE.parties]: pack.parties as never,
      [TABLE.milestones]: pack.milestones as never,
      [TABLE.events]: pack.events as never,
      [TABLE.rules]: snapshot.rules as never,
      [TABLE.exceptions]: [],
    });
    const labels = readRecords(
      await readFile(
        resolve(dataPackDir(), "03_labels_sample/decision_sample.csv"),
        "utf8",
      ),
    ).rows;
    const matched = labels.filter((label) => {
      const evaluation = result.evaluations.get(label.milestone_id);
      return (
        evaluation?.decision === label.expected_decision &&
        evaluation.reasonCode === label.reason_code &&
        toCents(evaluation.payableMillion) ===
          toCents(label.payable_amount_vnd_mn) &&
        toCents(evaluation.penaltyMillion) ===
          toCents(label.penalty_amount_vnd_mn)
      );
    }).length;
    if (matched !== labels.length || result.violations.length)
      throw new BadRequestException("RULE_VERSION_REGRESSION");
    return this.repo.transact(
      ["rule-versions"],
      (tables) => {
        const current = tables["rule-versions"].find((row) => row.id === id)!;
        checkState(current, expected, "DRAFT");
        if (versionHash(current) !== snapshot.hash)
          throw new BadRequestException("RULE_VERSION_INVALID");
        Object.assign(current, {
          status: "REVIEW",
          submittedBy: actor.id,
          validation: {
            matched,
            samples: labels.length,
            evaluated: result.evaluations.size,
            invariantViolations: result.violations.length,
            fingerprint: result.fingerprint,
          },
          version: current.version + 1,
          updatedAt: new Date().toISOString(),
        });
        return current;
      },
      () => [
        this.base.auditRecord(
          "RULE_VERSION_SUBMIT",
          "rule-versions",
          id,
          actor,
        ),
      ],
    );
  }
  async publish(id: string, expected: unknown, actor: Actor) {
    return this.repo.transact(
      ["rule-versions", TABLE.rules],
      (tables) => {
        const current = tables["rule-versions"].find((row) => row.id === id);
        if (!current) throw new NotFoundException("RECORD_NOT_FOUND");
        checkState(current, expected, "REVIEW");
        if (current.submittedBy === actor.id || current.createdBy === actor.id)
          throw new ForbiddenException("SECOND_REVIEWER_REQUIRED");
        if (versionHash(current) !== current.hash)
          throw new BadRequestException("RULE_VERSION_INVALID");
        for (const prior of tables["rule-versions"].filter(
          (row) => row.status === "PUBLISHED",
        )) {
          prior.status = "RETIRED";
          prior.version++;
        }
        for (const rule of current.rules as Record<string, string>[]) {
          const ruleSet = versionRuleSet(rule.rule_set_id, id);
          const ruleId = `${id}:${rule.rule_id}`;
          tables[TABLE.rules].push(
            entity(ruleId, {
              ...rule,
              rule_id: ruleId,
              rule_set_id: ruleSet,
              release_rule_code: rule.release_rule_code.replace(
                rule.rule_set_id,
                ruleSet,
              ),
              origin: "APP",
            }),
          );
        }
        Object.assign(current, {
          status: "PUBLISHED",
          reviewedBy: actor.id,
          publishedAt: new Date().toISOString(),
          version: current.version + 1,
        });
        return current;
      },
      () => [
        this.base.auditRecord(
          "RULE_VERSION_PUBLISH",
          "rule-versions",
          id,
          actor,
        ),
      ],
    );
  }
}
const processEnvPython = () => process.env.PYTHON ?? "python3";
