import type { Evaluation, MilestoneStatus, ReasonCode } from "./types";
import { UnprocessableEntityException } from "@nestjs/common";
import { enginePolicy, paysOut } from "./policy";

/** Integration contract v1: decimal amounts are strings, never JavaScript floats. */
export const ENGINE_OUTPUT_COLUMNS = [
  "contract_id",
  "milestone_id",
  "contract_type",
  "milestone_sequence",
  "milestone_type",
  "planned_payment_vnd_mn",
  "predicted_decision",
  "predicted_milestone_status",
  "conditions_met",
  "missing_conditions",
  "payable_amount_vnd_mn",
  "penalty_amount_vnd_mn",
  "reason_code",
  "decision_reason",
  "evidence_event_ids",
  "rule_id_applied",
  "confidence_score",
  "processing_time_ms",
  "evaluated_at",
  "engine_name",
  "audit_trace_id",
  "notes",
] as const;

export interface EngineResult {
  milestone_id: string;
  contract_id: string;
  decision: Evaluation["decision"];
  reason_code: ReasonCode;
  rule_id: string;
  status: MilestoneStatus;
  payable: string;
  penalty: string;
  raw_penalty: string;
  evidence: string[];
  missing: Evaluation["missing"];
  unauthorized: string[];
  duplicates: Array<[string, string]>;
  unrelated: string[];
  voided: string[];
  open_dispute_ids: string[];
  valid_rejection_count: number;
  approval_required: boolean;
  valid_approval_count: number;
  quorum: number;
  days_late: number;
  completion_ts: string | null;
  conditions_met: string[];
  missing_conditions: string[];
  issues: string[];
  notes: string[];
  /** Sequence warnings; optional so an external candidate engine without them still validates. */
  warnings?: string[];
  /** How the engine chose the applied rule; optional for the same reason. */
  selection?: Evaluation["selection"];
}

export interface EngineOutput {
  runId: string;
  inputFingerprint: string;
  rows: Record<string, string>[];
  traces: Array<{
    id: string;
    inputFingerprint: string;
    specVersion: string;
    evaluatedAt: string;
    result: EngineResult;
    [key: string]: unknown;
  }>;
  summary: {
    milestones: number;
    contracts: number;
    source: { profile: "BTC_SUBMISSION" | "WORKFLOW"; [key: string]: unknown };
    decisions: Partial<Record<Evaluation["decision"], number>>;
    invariantViolations: string[];
    payableMillion: string;
    penaltyMillion: string;
    [key: string]: unknown;
  };
}

export class EngineOutputError extends UnprocessableEntityException {
  readonly code = "ENGINE_OUTPUT_INVALID";
  constructor(readonly location: string) {
    super("ENGINE_OUTPUT_INVALID");
  }
}
function requireValue(ok: unknown, location: string): asserts ok {
  if (!ok) throw new EngineOutputError(location);
}
const object = (value: unknown, location: string): Record<string, unknown> => {
  requireValue(
    value && typeof value === "object" && !Array.isArray(value),
    location,
  );
  return value as Record<string, unknown>;
};
const strings = (value: unknown) =>
  Array.isArray(value) && value.every((s) => typeof s === "string");
const integer = (value: unknown) =>
  Number.isSafeInteger(value) && (value as number) >= 0;
const money = (value: unknown) =>
  typeof value === "string" && /^\d+\.\d{2}$/.test(value);
const cents = (value: string) => BigInt(value.replace(".", ""));
// The engine policy defines the decisions, statuses and reasons an output row may carry.
const decisions = Object.keys(enginePolicy.decisions);
const statuses = enginePolicy.statuses;
const reasons = Object.keys(enginePolicy.reasons);

/** Structural/consistency gate, not a replacement for the Python business evaluator. */
export function parseEngineOutput(
  raw: unknown,
  expected?: {
    profile?: EngineOutput["summary"]["source"]["profile"];
    rows?: Array<Record<string, string>>;
    /** Diagnostics may inspect reported business violations; applyRun/dryRun still reject them. */
    diagnostic?: boolean;
  },
): EngineOutput {
  const output = object(raw, "output");
  requireValue(
    typeof output.runId === "string" && output.runId.length,
    "runId",
  );
  requireValue(
    typeof output.inputFingerprint === "string" &&
      /^[a-f0-9]{64}$/.test(output.inputFingerprint),
    "inputFingerprint",
  );
  requireValue(
    Array.isArray(output.rows) && Array.isArray(output.traces),
    "rows/traces",
  );
  const summary = object(output.summary, "summary");
  const source = object(summary.source, "summary.source");
  requireValue(
    ["BTC_SUBMISSION", "WORKFLOW"].includes(String(source.profile)),
    "summary.source.profile",
  );
  requireValue(
    !expected?.profile || source.profile === expected.profile,
    "profileMismatch",
  );
  requireValue(
    summary.milestones === output.rows.length && integer(summary.contracts),
    "summary.counts",
  );
  requireValue(
    strings(summary.invariantViolations),
    "summary.invariantViolations",
  );
  const diagnostic =
    expected?.diagnostic &&
    (summary.invariantViolations as string[]).length > 0;
  const amount = (value: unknown) =>
    money(value) ||
    (diagnostic && typeof value === "string" && /^-\d+\.\d{2}$/.test(value));
  requireValue(
    amount(summary.payableMillion) && amount(summary.penaltyMillion),
    "summary.amounts",
  );
  const counts = object(summary.decisions, "summary.decisions");
  requireValue(
    Object.keys(counts).every(
      (key) => decisions.includes(key) && integer(counts[key]),
    ),
    "summary.decisions",
  );
  const traces = new Map<string, Record<string, unknown>>();
  for (const rawTrace of output.traces) {
    const trace = object(rawTrace, "trace");
    requireValue(
      typeof trace.id === "string" && !traces.has(trace.id),
      "trace.id",
    );
    requireValue(
      trace.inputFingerprint === output.inputFingerprint &&
        typeof trace.specVersion === "string" &&
        trace.specVersion.length,
      "trace.provenance",
    );
    requireValue(
      typeof trace.evaluatedAt === "string" &&
        Number.isFinite(Date.parse(trace.evaluatedAt)),
      "trace.evaluatedAt",
    );
    const result = object(trace.result, "trace.result");
    for (const key of [
      "evidence",
      "missing",
      "unauthorized",
      "unrelated",
      "voided",
      "open_dispute_ids",
      "conditions_met",
      "missing_conditions",
      "issues",
      "notes",
    ])
      requireValue(strings(result[key]), `trace.result.${key}`);
    requireValue(
      result.warnings === undefined || strings(result.warnings),
      "trace.result.warnings",
    );
    requireValue(
      Array.isArray(result.duplicates) &&
        result.duplicates.every(
          (pair) => strings(pair) && (pair as string[]).length === 2,
        ),
      "trace.result.duplicates",
    );
    for (const key of [
      "valid_rejection_count",
      "valid_approval_count",
      "quorum",
      "days_late",
    ])
      requireValue(integer(result[key]), `trace.result.${key}`);
    requireValue(
      typeof result.approval_required === "boolean",
      "trace.result.approval_required",
    );
    requireValue(
      result.completion_ts === null ||
        (typeof result.completion_ts === "string" &&
          Number.isFinite(Date.parse(result.completion_ts))),
      "trace.result.completion_ts",
    );
    requireValue(
      typeof result.raw_penalty === "string" &&
        /^\d+(?:\.\d+)?$/.test(result.raw_penalty),
      "trace.result.raw_penalty",
    );
    requireValue(
      result.selection === undefined || typeof result.selection === "string",
      "trace.result.selection",
    );
    traces.set(trace.id, result);
  }
  const ids = new Set<string>(),
    usedTraces = new Set<string>();
  const actualCounts: Record<string, number> = {};
  let payable = 0n,
    penalty = 0n;
  for (const rawRow of output.rows) {
    const row = object(rawRow, "row");
    requireValue(
      Object.keys(row).length === ENGINE_OUTPUT_COLUMNS.length &&
        ENGINE_OUTPUT_COLUMNS.every((key) => typeof row[key] === "string"),
      "row.columns",
    );
    const r = row as Record<string, string>;
    requireValue(
      r.milestone_id && r.contract_id && !ids.has(r.milestone_id),
      "row.milestone_id",
    );
    ids.add(r.milestone_id);
    requireValue(
      decisions.includes(r.predicted_decision) &&
        statuses.includes(r.predicted_milestone_status) &&
        reasons.includes(r.reason_code),
      "row.decision/status/reason",
    );
    requireValue(
      /^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(r.confidence_score),
      "row.confidence_score",
    );
    requireValue(
      /^\d+(?:\.\d+)?$/.test(r.processing_time_ms) &&
        Number.isFinite(Date.parse(r.evaluated_at)),
      "row.time",
    );
    requireValue(
      money(r.planned_payment_vnd_mn) &&
        amount(r.payable_amount_vnd_mn) &&
        amount(r.penalty_amount_vnd_mn),
      "row.amounts",
    );
    const pay = cents(r.payable_amount_vnd_mn),
      fine = cents(r.penalty_amount_vnd_mn),
      planned = cents(r.planned_payment_vnd_mn);
    requireValue(
      diagnostic || pay + fine <= planned,
      "row.amountExceedsPlanned",
    );
    requireValue(
      diagnostic ||
        paysOut(r.predicted_decision) ||
        (pay === 0n && fine === 0n),
      "row.blockedPayment",
    );
    requireValue(
      diagnostic || !paysOut(r.predicted_decision) || pay + fine === planned,
      "row.paymentConservation",
    );
    const trace = traces.get(r.audit_trace_id);
    requireValue(
      trace && !usedTraces.has(r.audit_trace_id),
      "row.audit_trace_id",
    );
    usedTraces.add(r.audit_trace_id);
    for (const [key, field] of [
      ["milestone_id", "milestone_id"],
      ["contract_id", "contract_id"],
      ["decision", "predicted_decision"],
      ["status", "predicted_milestone_status"],
      ["reason_code", "reason_code"],
      ["rule_id", "rule_id_applied"],
      ["payable", "payable_amount_vnd_mn"],
      ["penalty", "penalty_amount_vnd_mn"],
    ])
      requireValue(trace[key] === r[field], `trace.row.${key}`);
    for (const [key, field] of [
      ["evidence", "evidence_event_ids"],
      ["conditions_met", "conditions_met"],
      ["missing_conditions", "missing_conditions"],
    ])
      requireValue(
        (trace[key] as string[]).join(";") === r[field],
        `trace.row.${key}`,
      );
    payable += pay;
    penalty += fine;
    actualCounts[r.predicted_decision] =
      (actualCounts[r.predicted_decision] ?? 0) + 1;
  }
  requireValue(usedTraces.size === traces.size, "orphanTraces");
  requireValue(
    decisions.every((key) => (actualCounts[key] ?? 0) === (counts[key] ?? 0)),
    "summary.decisionCounts",
  );
  requireValue(
    payable === cents(summary.payableMillion as string) &&
      penalty === cents(summary.penaltyMillion as string),
    "summary.amountTotals",
  );
  if (expected?.rows) {
    requireValue(
      expected.rows.length === output.rows.length,
      "template.coverage",
    );
    const rows = new Map(
      (output.rows as Record<string, string>[]).map((row) => [
        row.milestone_id,
        row,
      ]),
    );
    for (const original of expected.rows) {
      const row = rows.get(original.milestone_id);
      requireValue(
        row &&
          ENGINE_OUTPUT_COLUMNS.slice(0, 6).every(
            (key) => row[key] === original[key],
          ),
        "template.metadata",
      );
    }
  }
  return output as unknown as EngineOutput;
}
