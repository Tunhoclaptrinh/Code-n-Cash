/**
 * Workflows a rule version adds for contracts drafted in the app (docs/NGHIEP_VU.md §6.3).
 *
 * The organiser's 16 rule scopes and 4 workflows decide the 405 Data Pack milestones, so a version
 * may only restate them. A version may also carry its own workflows, coded `APP_…`: their stages
 * and rule scopes are free to differ, because no Data Pack milestone ever uses them. They must
 * still be complete (every stage has a scope with the eight reasons and one final ELSE) and pass
 * the engine's safety proof before the version can be published.
 *
 * Shared by the API (validation) and the browser (live feedback); kept identical by a test.
 */

export const APP_PREFIX = "APP_";
export const FALLBACK_CONDITION = "ELSE";
export const RULE_DECISIONS = ["RELEASE", "PENALTY", "HOLD", "REJECT"] as const;
/** Every scope must give each of these reasons (engine policy `rule_scope.required_reason_codes`). */
export const RULE_REASONS = [
  "OPEN_DISPUTE",
  "REJECTION_PRESENT",
  "UNAUTHORIZED_EVENT",
  "MISSING_REQUIRED_EVENT",
  "APPROVAL_QUORUM_NOT_MET",
  "LATE_COMPLETION",
  "ALL_CONDITIONS_MET",
  "UNRESOLVED_CONDITION",
] as const;
export const STAGE_TYPES = [
  "SIGNING",
  "DELIVERY",
  "ACCEPTANCE",
  "WARRANTY",
  "KICKOFF",
  "INTERIM_DELIVERY",
  "FINAL_ACCEPTANCE",
  "WARRANTY_CLOSE",
  "REQUIREMENTS_APPROVAL",
  "UAT_PASS",
  "GO_LIVE_ACCEPTANCE",
  "ACTIVATION",
  "SERVICE_COMPLETION",
] as const;
export const EVIDENCE_EVENTS = [
  "CONTRACT_SIGNED",
  "KICKOFF_CONFIRMED",
  "REQUIREMENTS_APPROVED",
  "UAT_PASSED",
  "ACCEPTANCE",
  "DELIVERY",
  "INVOICE",
  "GO_LIVE",
  "SERVICE_ACTIVATED",
  "SERVICE_COMPLETED",
  "WARRANTY_COMPLETED",
] as const;
export const WORKFLOW_CONTRACT_TYPES = [
  "GOODS_SUPPLY",
  "SERVICES",
  "SOFTWARE_IMPLEMENTATION",
  "MAINTENANCE",
] as const;
/** CONTRACT: the stage needs the approvals of the contract's policy; NONE: no approval. */
export const STAGE_APPROVALS = ["CONTRACT", "NONE"] as const;
export const RULE_COLUMNS = [
  "rule_id",
  "rule_set_id",
  "release_rule_code",
  "workflow_template",
  "contract_type",
  "applies_to_milestone_type",
  "priority",
  "evaluation_order",
  "rule_name",
  "rule_group",
  "condition_expression",
  "decision",
  "reason_code",
  "stop_processing",
  "payable_amount_formula",
  "penalty_amount_formula",
  "parameter_source",
  "rule_description_vi",
  "active",
  "data_is_synthetic",
] as const;
export const MAX_APP_WORKFLOWS = 8;
export const MAX_APP_STAGES = 8;
export const MAX_SCOPE_RULES = 30;
/** The organiser's 128 rules plus the most a version's own workflows can hold. */
export const MAX_VERSION_RULES =
  128 + MAX_APP_WORKFLOWS * MAX_APP_STAGES * MAX_SCOPE_RULES;

export type VersionRule = Record<string, string>;
export interface VersionTemplate {
  id: string;
  name: string;
  workflowTemplate: string;
  sequence: number;
  milestoneType: string;
  requiredEvents: string;
  paymentPercent: string;
  latePenalty: boolean;
  offsetDays: number;
  /** App workflows only: the contract type, the workflow's display name and its approval rule. */
  contractType?: string;
  workflowName?: string;
  approval?: string;
  [key: string]: unknown;
}

export interface WorkflowProblem {
  code:
    | "APP_WORKFLOW_CODE"
    | "APP_WORKFLOW_COUNT"
    | "APP_WORKFLOW_TYPE"
    | "APP_WORKFLOW_NAME"
    | "APP_STAGE_COUNT"
    | "APP_STAGE_SEQUENCE"
    | "APP_STAGE_NAME"
    | "APP_STAGE_TYPE"
    | "APP_STAGE_EVENTS"
    | "APP_STAGE_PERCENT"
    | "APP_PERCENT_TOTAL"
    | "APP_STAGE_OFFSET"
    | "APP_STAGE_APPROVAL"
    | "APP_SCOPE_MISSING"
    | "APP_RULE_FIELDS"
    | "APP_RULE_SCOPE"
    | "APP_RULE_DECISION"
    | "APP_SCOPE_PRIORITY"
    | "APP_SCOPE_FALLBACK"
    | "APP_SCOPE_REASONS"
    | "APP_SCOPE_SIZE";
  workflow?: string;
  scope?: string;
  ruleId?: string;
  templateId?: string;
}

export const isAppCode = (code: unknown): code is string =>
  typeof code === "string" && /^APP_[A-Z0-9_]{2,30}$/.test(code);
export const isAppRule = (rule: VersionRule) =>
  typeof rule.rule_set_id === "string" &&
  rule.rule_set_id.startsWith(APP_PREFIX);
export const isAppTemplate = (row: VersionTemplate) =>
  typeof row.workflowTemplate === "string" &&
  row.workflowTemplate.startsWith(APP_PREFIX);
export const scopeCode = (workflow: string, stageType: string) =>
  `${workflow}:${stageType}`;

const text = (value: unknown, max: number) =>
  typeof value === "string" && !!value.trim() && value.length <= max;
/** Hundredths of a percentage, or null when it is not 0.00–100.00 with two decimals at most. */
const hundredths = (value: unknown): bigint | null => {
  if (typeof value !== "string") return null;
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const total =
    BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
  return total <= 10000n ? total : null;
};
const includes = <T extends string>(list: readonly T[], value: unknown) =>
  typeof value === "string" && (list as readonly string[]).includes(value);

/** Problems of the app workflows and app rule scopes of a version, in a stable order. */
export function appWorkflowProblems(
  rules: VersionRule[],
  templates: VersionTemplate[],
): WorkflowProblem[] {
  const problems: WorkflowProblem[] = [];
  const stagesBy = new Map<string, VersionTemplate[]>();
  for (const row of templates.filter(isAppTemplate)) {
    const list = stagesBy.get(row.workflowTemplate) ?? [];
    list.push(row);
    stagesBy.set(row.workflowTemplate, list);
  }
  if (stagesBy.size > MAX_APP_WORKFLOWS)
    problems.push({ code: "APP_WORKFLOW_COUNT" });
  for (const [workflow, stages] of stagesBy) {
    if (!isAppCode(workflow)) {
      problems.push({ code: "APP_WORKFLOW_CODE", workflow });
      continue;
    }
    const [first] = stages;
    if (
      !includes(WORKFLOW_CONTRACT_TYPES, first.contractType) ||
      stages.some((s) => s.contractType !== first.contractType)
    )
      problems.push({ code: "APP_WORKFLOW_TYPE", workflow });
    if (
      !text(first.workflowName, 120) ||
      stages.some((s) => s.workflowName !== first.workflowName)
    )
      problems.push({ code: "APP_WORKFLOW_NAME", workflow });
    if (stages.length < 1 || stages.length > MAX_APP_STAGES)
      problems.push({ code: "APP_STAGE_COUNT", workflow });
    const ordered = [...stages].sort((a, b) => a.sequence - b.sequence);
    if (ordered.some((s, i) => s.sequence !== i + 1))
      problems.push({ code: "APP_STAGE_SEQUENCE", workflow });
    const types = new Set<string>();
    let total = 0n;
    let previousOffset = -1;
    for (const stage of ordered) {
      const at = { workflow, templateId: stage.id };
      if (!text(stage.name, 120))
        problems.push({ code: "APP_STAGE_NAME", ...at });
      if (
        !includes(STAGE_TYPES, stage.milestoneType) ||
        types.has(stage.milestoneType)
      )
        problems.push({ code: "APP_STAGE_TYPE", ...at });
      types.add(stage.milestoneType);
      const events =
        typeof stage.requiredEvents === "string"
          ? stage.requiredEvents.split(";")
          : [];
      if (
        !events.length ||
        events.some((event) => !includes(EVIDENCE_EVENTS, event)) ||
        new Set(events).size !== events.length
      )
        problems.push({ code: "APP_STAGE_EVENTS", ...at });
      const share = hundredths(stage.paymentPercent);
      if (share === null) problems.push({ code: "APP_STAGE_PERCENT", ...at });
      else total += share;
      if (
        !Number.isInteger(stage.offsetDays) ||
        stage.offsetDays < 0 ||
        stage.offsetDays > 36500 ||
        stage.offsetDays < previousOffset
      )
        problems.push({ code: "APP_STAGE_OFFSET", ...at });
      previousOffset = Number.isInteger(stage.offsetDays)
        ? stage.offsetDays
        : previousOffset;
      if (
        typeof stage.latePenalty !== "boolean" ||
        !includes(STAGE_APPROVALS, stage.approval)
      )
        problems.push({ code: "APP_STAGE_APPROVAL", ...at });
    }
    if (total !== 10000n)
      problems.push({ code: "APP_PERCENT_TOTAL", workflow });
  }

  const scopes = new Map<string, VersionRule[]>();
  const ids = new Set<string>();
  for (const rule of rules.filter(isAppRule)) {
    const at = { ruleId: rule.rule_id, scope: rule.release_rule_code };
    const columns = Object.keys(rule);
    if (
      columns.length !== RULE_COLUMNS.length ||
      RULE_COLUMNS.some((key) => typeof rule[key] !== "string") ||
      !/^APP_[A-Z0-9_]{2,30}-\d{1,4}$/.test(rule.rule_id) ||
      ids.has(rule.rule_id) ||
      ![
        "rule_name",
        "rule_group",
        "condition_expression",
        "payable_amount_formula",
        "penalty_amount_formula",
        "parameter_source",
        "rule_description_vi",
      ].every((key) => text(rule[key], 2000)) ||
      rule.stop_processing !== "TRUE" ||
      !["TRUE", "FALSE"].includes(rule.active) ||
      rule.data_is_synthetic !== "FALSE"
    ) {
      problems.push({ code: "APP_RULE_FIELDS", ...at });
      ids.add(rule.rule_id);
      continue;
    }
    ids.add(rule.rule_id);
    const stages = stagesBy.get(rule.rule_set_id) ?? [];
    if (
      !stages.length ||
      rule.workflow_template !== rule.rule_set_id ||
      rule.contract_type !== stages[0].contractType ||
      !stages.some((s) => s.milestoneType === rule.applies_to_milestone_type) ||
      rule.release_rule_code !==
        scopeCode(rule.rule_set_id, rule.applies_to_milestone_type)
    ) {
      problems.push({ code: "APP_RULE_SCOPE", ...at });
      continue;
    }
    if (
      !includes(RULE_DECISIONS, rule.decision) ||
      !includes(RULE_REASONS, rule.reason_code)
    )
      problems.push({ code: "APP_RULE_DECISION", ...at });
    if (rule.active !== "TRUE") continue;
    const list = scopes.get(rule.release_rule_code) ?? [];
    list.push(rule);
    scopes.set(rule.release_rule_code, list);
  }
  for (const [workflow, stages] of stagesBy)
    for (const stage of stages) {
      const scope = scopeCode(workflow, stage.milestoneType);
      if (!scopes.has(scope))
        problems.push({
          code: "APP_SCOPE_MISSING",
          workflow,
          scope,
          templateId: stage.id,
        });
    }
  for (const [scope, list] of scopes) {
    if (list.length > MAX_SCOPE_RULES)
      problems.push({ code: "APP_SCOPE_SIZE", scope });
    const priorities = list.map((rule) => rule.priority);
    if (
      priorities.some(
        (p, i) =>
          !/^[1-9]\d{0,2}$/.test(p) ||
          priorities.indexOf(p) !== i ||
          list[i].evaluation_order !== "ASCENDING_PRIORITY",
      )
    ) {
      problems.push({ code: "APP_SCOPE_PRIORITY", scope });
      continue;
    }
    const ordered = [...list].sort(
      (a, b) => Number(a.priority) - Number(b.priority),
    );
    const fallbacks = ordered.filter(
      (rule) => rule.condition_expression.trim() === FALLBACK_CONDITION,
    );
    if (
      fallbacks.length !== 1 ||
      ordered[ordered.length - 1].condition_expression.trim() !==
        FALLBACK_CONDITION
    )
      problems.push({ code: "APP_SCOPE_FALLBACK", scope });
    const given = new Set(list.map((rule) => rule.reason_code));
    if (RULE_REASONS.some((reason) => !given.has(reason)))
      problems.push({ code: "APP_SCOPE_REASONS", scope });
  }
  return problems;
}

/**
 * A new app workflow for a contract type, started as a copy of that type's organiser workflow:
 * the same stages and, for each stage, a copy of the organiser's rule scope. The author then
 * changes what the app needs; the copy alone already passes every check.
 */
export function scaffoldAppWorkflow(input: {
  code: string;
  name: string;
  contractType: string;
  rules: VersionRule[];
  templates: VersionTemplate[];
}): { rules: VersionRule[]; templates: VersionTemplate[] } {
  const base = input.templates
    .filter((row) => !isAppTemplate(row))
    .filter((row) =>
      input.rules.some(
        (rule) =>
          !isAppRule(rule) &&
          rule.workflow_template === row.workflowTemplate &&
          rule.contract_type === input.contractType,
      ),
    )
    .sort((a, b) => a.sequence - b.sequence);
  const templates = base.map((row) => ({
    id: `tpl-${input.code}-${row.sequence}`,
    name: row.name,
    workflowTemplate: input.code,
    sequence: row.sequence,
    milestoneType: row.milestoneType,
    requiredEvents: row.requiredEvents,
    paymentPercent: row.paymentPercent,
    latePenalty: row.latePenalty,
    offsetDays: row.offsetDays,
    contractType: input.contractType,
    workflowName: input.name,
    approval: "CONTRACT",
    origin: "APP",
  }));
  let next = 1;
  const rules = templates.flatMap((stage) =>
    copyScope(
      input.rules,
      input.code,
      input.contractType,
      stage.milestoneType,
      () => next++,
    ),
  );
  return { rules, templates };
}

/**
 * The rules of a new stage: a copy of the organiser's scope for the same milestone type when one
 * exists, otherwise of the first organiser scope (all organiser scopes give the same eight rules).
 */
export function copyScope(
  rules: VersionRule[],
  workflow: string,
  contractType: string,
  stageType: string,
  nextNumber: () => number,
): VersionRule[] {
  const organiser = rules.filter((rule) => !isAppRule(rule));
  const sourceScope =
    organiser.find(
      (rule) =>
        rule.contract_type === contractType &&
        rule.applies_to_milestone_type === stageType,
    )?.release_rule_code ??
    organiser.find((rule) => rule.applies_to_milestone_type === stageType)
      ?.release_rule_code ??
    organiser[0]?.release_rule_code;
  return organiser
    .filter((rule) => rule.release_rule_code === sourceScope)
    .sort((a, b) => Number(a.priority) - Number(b.priority))
    .map((rule) => ({
      ...rule,
      rule_id: `${workflow}-${nextNumber()}`,
      rule_set_id: workflow,
      release_rule_code: scopeCode(workflow, stageType),
      workflow_template: workflow,
      contract_type: contractType,
      applies_to_milestone_type: stageType,
      data_is_synthetic: "FALSE",
    }));
}

/** The next free rule number of an app workflow (`APP_X-12` → 13). */
export const nextRuleNumber = (rules: VersionRule[], workflow: string) =>
  Math.max(
    0,
    ...rules
      .filter((rule) => rule.rule_set_id === workflow)
      .map((rule) => Number(rule.rule_id.slice(workflow.length + 1)) || 0),
  ) + 1;

/**
 * The organiser rules that belong to the same family as `ruleId`: same priority and reason in
 * every organiser scope. The 128 organiser rules are 8 families of 16 identical copies, so an
 * edit meant for one family is applied to all of its scopes in one step.
 */
export function ruleFamily(
  rules: VersionRule[],
  ruleId: string,
): VersionRule[] {
  const rule = rules.find((row) => row.rule_id === ruleId);
  if (!rule || isAppRule(rule)) return [];
  return rules.filter(
    (row) =>
      !isAppRule(row) &&
      row.priority === rule.priority &&
      row.reason_code === rule.reason_code,
  );
}

/** Organiser families whose copies no longer say the same thing, by priority. */
export function divergedFamilies(rules: VersionRule[]): string[] {
  const seen = new Map<string, string>();
  const diverged = new Set<string>();
  for (const rule of rules.filter((row) => !isAppRule(row))) {
    const body = [
      rule.condition_expression,
      rule.payable_amount_formula,
      rule.penalty_amount_formula,
    ].join("\u0000");
    const key = `${rule.priority}:${rule.reason_code}`;
    if (!seen.has(key)) seen.set(key, body);
    else if (seen.get(key) !== body) diverged.add(rule.priority);
  }
  return [...diverged].sort((a, b) => Number(a) - Number(b));
}
