import { canonical, sha256 } from "../common/audit-chain";
import type { RecordEntity } from "../common/types";
import { RULE_COLUMNS, isAppCode, scopeCode } from "./rule-workflows";
import type { MilestoneLibraryEntry, MilestoneLibraryVersion } from "./types";

/** The rule fields that decide what a milestone pays; names and ids do not. */
const DECIDING = [
  "priority",
  "condition_expression",
  "decision",
  "reason_code",
  "stop_processing",
  "payable_amount_formula",
  "penalty_amount_formula",
  "active",
] as const;

interface Source {
  key: string;
  ruleVersionId: string | null;
  ruleVersionName: string | null;
  status: MilestoneLibraryVersion["usedBy"][number]["status"];
  at: string | null;
  rules: RecordEntity[] | Record<string, unknown>[];
  templates: RecordEntity[] | Record<string, unknown>[];
}

interface Definition {
  milestoneType: string;
  hash: string;
  requiredEvents: string[];
  latePenalty: boolean;
  approval: "CONTRACT" | "NONE";
  rules: Record<string, string>[];
}

const text = (value: unknown) => String(value ?? "");

/** One stage of a source's workflow as a definition: its template row plus the rules of its scope. */
function definitionOf(
  source: Source,
  template: Record<string, unknown>,
): Definition {
  const workflow = text(template.workflowTemplate);
  const type = text(template.milestoneType);
  const rules = (source.rules as Record<string, unknown>[])
    .filter((rule) =>
      isAppCode(workflow)
        ? rule.release_rule_code === scopeCode(workflow, type)
        : !isAppCode(rule.rule_set_id) &&
          rule.workflow_template === workflow &&
          rule.applies_to_milestone_type === type,
    )
    .sort((a, b) => Number(a.priority) - Number(b.priority))
    // Exactly the rule columns, so a stage taken from the library is a valid app rule.
    .map(
      (rule) =>
        Object.fromEntries(
          RULE_COLUMNS.map((key) => [key, text(rule[key])]),
        ) as Record<string, string>,
    );
  const requiredEvents = text(template.requiredEvents)
    .split(";")
    .filter(Boolean);
  const latePenalty = template.latePenalty === true;
  const approval = template.approval === "NONE" ? "NONE" : "CONTRACT";
  return {
    milestoneType: type,
    requiredEvents,
    latePenalty,
    approval,
    rules,
    hash: sha256(
      canonical({
        type,
        requiredEvents,
        latePenalty,
        approval,
        rules: rules.map((rule) =>
          Object.fromEntries(DECIDING.map((key) => [key, rule[key] ?? ""])),
        ),
      }),
    ),
  };
}

/** What a definition changes from the one before it. */
function changesFrom(
  previous: Definition | undefined,
  next: Definition,
): MilestoneLibraryVersion["changes"] {
  if (!previous) return [];
  const deciding = (d: Definition) =>
    canonical(
      d.rules.map((rule) =>
        Object.fromEntries(DECIDING.map((key) => [key, rule[key] ?? ""])),
      ),
    );
  const changes: MilestoneLibraryVersion["changes"] = [];
  if (previous.requiredEvents.join(";") !== next.requiredEvents.join(";"))
    changes.push("EVIDENCE");
  if (previous.latePenalty !== next.latePenalty) changes.push("PENALTY");
  if (previous.approval !== next.approval) changes.push("APPROVAL");
  if (deciding(previous) !== deciding(next)) changes.push("RULES");
  return changes;
}

/** The earlier version a new definition differs least from (the latest one on a tie). */
function closest(
  versions: Array<{ definition: Definition; version: MilestoneLibraryVersion }>,
  definition: Definition,
): Pick<MilestoneLibraryVersion, "basedOn" | "changes"> {
  let best: Pick<MilestoneLibraryVersion, "basedOn" | "changes"> = {
    basedOn: null,
    changes: [],
  };
  for (const { definition: earlier, version } of versions) {
    const changes = changesFrom(earlier, definition);
    if (best.basedOn === null || changes.length <= best.changes.length)
      best = { basedOn: version.number, changes };
  }
  return best;
}

/**
 * Builds the library from the Data Pack workflows, every rule version (oldest first) and the
 * contracts' milestones. Nothing is stored: a new definition only ever comes from a rule version,
 * which goes through preview, the safety proof and a second person's publication (SoD-4).
 */
export function milestoneLibrary(input: {
  dataPackRules: RecordEntity[];
  dataPackTemplates: RecordEntity[];
  versions: RecordEntity[];
  contracts: RecordEntity[];
  milestones: RecordEntity[];
}): MilestoneLibraryEntry[] {
  const sources: Source[] = [
    {
      key: "DATA_PACK",
      ruleVersionId: null,
      ruleVersionName: null,
      status: "DATA_PACK",
      at: null,
      rules: input.dataPackRules,
      templates: input.dataPackTemplates,
    },
    ...[...input.versions]
      .sort((a, b) => text(a.createdAt).localeCompare(text(b.createdAt)))
      .map((version) => ({
        key: text(version.id).replaceAll("-", ""),
        ruleVersionId: text(version.id),
        ruleVersionName: text(version.name),
        status: version.status as Source["status"],
        at: text(version.publishedAt ?? version.createdAt) || null,
        rules: (version.rules ?? []) as Record<string, unknown>[],
        templates: (version.templates ?? []) as Record<string, unknown>[],
      })),
  ];
  // Definitions by type, in order of first appearance; and which one each stage of a source uses.
  const byType = new Map<
    string,
    Array<{ definition: Definition; version: MilestoneLibraryVersion }>
  >();
  const stageHash = new Map<string, string>();
  for (const source of sources)
    for (const template of source.templates as Record<string, unknown>[]) {
      const definition = definitionOf(source, template);
      const type = definition.milestoneType;
      stageHash.set(
        `${source.key}|${text(template.workflowTemplate)}|${type}`,
        definition.hash,
      );
      const versions = byType.get(type) ?? [];
      byType.set(type, versions);
      let entry = versions.find((v) => v.definition.hash === definition.hash);
      if (!entry) {
        entry = {
          definition,
          version: {
            number: versions.length + 1,
            hash: definition.hash,
            requiredEvents: definition.requiredEvents,
            latePenalty: definition.latePenalty,
            approval: definition.approval,
            rules: definition.rules,
            firstSeen: {
              ruleVersionId: source.ruleVersionId,
              ruleVersionName: source.ruleVersionName,
              at: source.at,
            },
            usedBy: [],
            contracts: 0,
            ...closest(versions, definition),
          },
        };
        versions.push(entry);
      }
      entry.version.usedBy.push({
        ruleVersionId: source.ruleVersionId,
        ruleVersionName: source.ruleVersionName,
        status: source.status,
        workflowTemplate: text(template.workflowTemplate),
        workflowName: template.workflowName
          ? text(template.workflowName)
          : null,
        sequence: Number(template.sequence),
      });
    }
  // A milestone's scope names its rule set: `<set>[~<version>][#<contract>]:<type>`.
  const contractsOf = new Map<string, Set<string>>();
  const contracts = new Map(
    input.contracts.map((c) => [text(c.contract_id), c]),
  );
  for (const milestone of input.milestones) {
    const contract = contracts.get(text(milestone.contract_id));
    if (!contract) continue;
    const ruleSet = text(milestone.release_rule_code)
      .split(":")[0]
      .split("#")[0];
    const source = ruleSet.includes("~") ? ruleSet.split("~")[1] : "DATA_PACK";
    const type = text(milestone.milestone_type);
    const hash = stageHash.get(
      `${source}|${text(contract.workflow_template)}|${type}`,
    );
    if (!hash) continue;
    const key = `${type}|${hash}`;
    const set = contractsOf.get(key) ?? new Set<string>();
    set.add(text(contract.contract_id));
    contractsOf.set(key, set);
  }
  return [...byType]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([milestoneType, versions]) => ({
      milestoneType,
      versions: versions.map(({ version }) => ({
        ...version,
        contracts:
          contractsOf.get(`${milestoneType}|${version.hash}`)?.size ?? 0,
      })),
    }));
}
