import { BadRequestException } from "@nestjs/common";
import { spawn } from "node:child_process";
import { pythonEnv, repoRoot } from "../common/paths";
import {
  RULE_TEMPLATES,
  templateFields,
  templatePriority,
  templateValueValid,
  type RuleTemplate,
  type RuleTemplateKey,
} from "../trust/rule-workflows";
import type { RuleSafety } from "../trust/types";
import { entity } from "./factory";
import type { RuleRecord, StageTemplate } from "./records";
import type { ContractRule } from "./types";

/**
 * A contract's own rules (idea from Contract Smart): sentence templates the buyer adds to one
 * contract, for example "waive delays of at most 5 days" for a trusted supplier, without changing
 * the shared rule version. The draft keeps the sentences; locking the terms copies the scopes of
 * the pinned rule set into a rule set of the contract (`<rule set>#<contract>`) with the sentences
 * placed in their priority windows, so both parties sign exactly the rules the engine applies.
 */
const MAX_CONTRACT_RULES = 12;

/** The rule set of a contract with its own rules. */
export const contractRuleSet = (base: string, code: string) =>
  `${base}#${code}`;

/** The pinned rule set a contract's own rule set was copied from. */
export const baseRuleSet = (ruleSet: string) => ruleSet.split("#")[0];

const templateOf = (key: unknown): RuleTemplate | undefined =>
  RULE_TEMPLATES.find((template) => template.key === key);

/**
 * Checks a person's sentences against the contract's stages: a known template, a milestone type
 * of the contract, a value in the template's range, each sentence once per scope.
 */
export function checkContractRules(
  stages: StageTemplate[],
  value: unknown,
): ContractRule[] {
  if (!Array.isArray(value) || value.length > MAX_CONTRACT_RULES)
    throw new BadRequestException("CONTRACT_RULES_INVALID");
  const types = new Set(stages.map((stage) => stage.type));
  const seen = new Set<string>();
  return value.map((row, index): ContractRule => {
    const template = templateOf(row?.template);
    const parameter =
      row?.value === undefined || row?.value === null ? null : row.value;
    if (
      !row ||
      typeof row !== "object" ||
      !template ||
      typeof row.milestoneType !== "string" ||
      !types.has(row.milestoneType) ||
      !templateValueValid(template, parameter ?? undefined)
    )
      throw new BadRequestException("CONTRACT_RULES_INVALID");
    const key = `${template.key}:${row.milestoneType}`;
    if (seen.has(key)) throw new BadRequestException("CONTRACT_RULES_INVALID");
    seen.add(key);
    return {
      id: `C${index + 1}`,
      template: template.key as ContractRule["template"],
      milestoneType: row.milestoneType,
      value: template.parameter ? parameter : null,
    };
  });
}

const NAMES: Record<RuleTemplateKey, (n: number | null) => [string, string]> = {
  LATE_REVIEW: (n) => [
    `Contract rule: review when more than ${n} days late`,
    `Luật riêng của hợp đồng: trễ quá ${n} ngày sau ân hạn thì giữ tiền để xem xét.`,
  ],
  MIN_APPROVALS: (n) => [
    `Contract rule: at least ${n} approvals`,
    `Luật riêng của hợp đồng: chưa đủ ${n} phê duyệt hợp lệ thì giữ tiền.`,
  ],
  LARGE_REVIEW: (n) => [
    `Contract rule: review milestones above ${n} million VND`,
    `Luật riêng của hợp đồng: mốc trên ${n} triệu đồng thì giữ tiền để xem xét.`,
  ],
  WAIVE_SHORT_DELAY: (n) => [
    `Contract rule: waive delays of at most ${n} days`,
    `Luật riêng của hợp đồng: trễ không quá ${n} ngày sau ân hạn thì vẫn trả đủ, không phạt.`,
  ],
  HALF_PENALTY: () => [
    "Contract rule: half the late penalty",
    "Luật riêng của hợp đồng: trễ hạn thì phạt một nửa mức của hợp đồng, vẫn trong mức trần.",
  ],
};

/**
 * The rules of a contract with its own sentences: every scope of `ruleSet` the contract's stages
 * use, copied under the contract's rule set, plus each sentence in its scope. Throws when a scope
 * has no free priority left for a sentence.
 */
export function composeContractRules(
  allRules: RuleRecord[],
  ruleSet: string,
  code: string,
  stages: StageTemplate[],
  custom: ContractRule[],
): RuleRecord[] {
  const own = contractRuleSet(ruleSet, code);
  const out: RuleRecord[] = [];
  for (const type of [...new Set(stages.map((stage) => stage.type))]) {
    const scope = `${ruleSet}:${type}`;
    const base = allRules.filter(
      (rule) => rule.release_rule_code === scope && rule.active === "TRUE",
    );
    if (!base.length) throw new BadRequestException("RULE_SCOPE_MISSING");
    const copies = base.map(
      (rule) =>
        entity(`${code}:${rule.rule_id}`, {
          ...Object.fromEntries(
            Object.entries(rule).filter(
              ([key]) =>
                !["id", "version", "createdAt", "updatedAt"].includes(key),
            ),
          ),
          rule_id: `${code}:${rule.rule_id}`,
          rule_set_id: own,
          release_rule_code: `${own}:${type}`,
          origin: "APP",
        }) as RuleRecord,
    );
    const fallback = base.find(
      (rule) => rule.condition_expression.trim() === "ELSE",
    );
    const used = new Set(base.map((rule) => Number(rule.priority)));
    const model = fallback ?? base[0];
    for (const rule of custom.filter((row) => row.milestoneType === type)) {
      const template = templateOf(rule.template)!;
      const priority = templatePriority(
        template,
        used,
        Number(fallback?.priority ?? 1000),
      );
      if (priority === null)
        throw new BadRequestException("CONTRACT_RULES_FULL");
      used.add(priority);
      const [name, description] = NAMES[template.key](rule.value);
      const id = `${code}:${rule.id}`;
      copies.push(
        entity(id, {
          ...Object.fromEntries(
            Object.entries(model).filter(
              ([key]) =>
                !["id", "version", "createdAt", "updatedAt"].includes(key),
            ),
          ),
          rule_id: id,
          rule_set_id: own,
          release_rule_code: `${own}:${type}`,
          priority: String(priority),
          rule_name: name,
          rule_group: "CONTRACT",
          ...templateFields(template, rule.value ?? undefined),
          stop_processing: "TRUE",
          rule_description_vi: description,
          active: "TRUE",
          data_is_synthetic: "TRUE",
          origin: "APP",
        }) as RuleRecord,
      );
    }
    out.push(...copies.sort((a, b) => Number(a.priority) - Number(b.priority)));
  }
  return out;
}

/**
 * The static safety proof of the engine (apps/engine/codecash_engine/safety.py) on a rule set: no
 * payment while a blocker holds, amounts within the planned payment, a fallback in every scope.
 */
export function proveSafety(rules: unknown[]): Promise<RuleSafety> {
  return new Promise((ok, reject) => {
    const child = spawn(
      process.env.PYTHON ?? "python3",
      ["apps/engine/validate_rules.py", "--safety"],
      { cwd: repoRoot(), env: pythonEnv(), stdio: ["pipe", "pipe", "ignore"] },
    );
    let output = "";
    const fail = () => reject(new BadRequestException("RULE_VERSION_INVALID"));
    const timer = setTimeout(() => {
      child.kill();
      fail();
    }, 15000);
    child.stdout.on("data", (chunk) => (output += chunk.toString()));
    child.on("error", () => {
      clearTimeout(timer);
      fail();
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return fail();
      try {
        ok(JSON.parse(output) as RuleSafety);
      } catch {
        fail();
      }
    });
    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify(rules));
  });
}
