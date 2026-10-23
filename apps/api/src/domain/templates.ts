import type { StageTemplate } from "./records";
import type {
  BusinessEventType,
  ContractType,
  WorkflowTemplate,
} from "./types";
import { WORKFLOW_BY_TYPE } from "./vocabulary";

/**
 * Stages of each Data Pack workflow, read from milestones.csv: type, name, payment share,
 * required events, penalty flag and the median distance from the contract start to the due date.
 * New contracts are cut into milestones from these, so they meet the same rules as the Data Pack.
 */
export function deriveStages(
  contracts: Record<string, string>[],
  milestones: Record<string, string>[],
): Record<WorkflowTemplate, StageTemplate[]> {
  const byId = new Map(contracts.map((c) => [c.contract_id, c]));
  const groups = new Map<
    string,
    { rows: Record<string, string>[]; offsets: number[] }
  >();
  for (const m of milestones) {
    const contract = byId.get(m.contract_id);
    if (!contract) continue;
    const key = `${contract.workflow_template}|${m.milestone_sequence}`;
    const group = groups.get(key) ?? { rows: [], offsets: [] };
    group.rows.push(m);
    group.offsets.push(
      (Date.parse(m.due_date) - Date.parse(contract.start_date)) / 86_400_000,
    );
    groups.set(key, group);
  }
  const result = {} as Record<WorkflowTemplate, StageTemplate[]>;
  for (const [key, { rows, offsets }] of groups) {
    const [template, sequence] = key.split("|") as [WorkflowTemplate, string];
    const first = rows[0];
    const sorted = [...offsets].sort((a, b) => a - b);
    const percents = new Map<string, number>();
    for (const row of rows)
      percents.set(
        row.payment_percent,
        (percents.get(row.payment_percent) ?? 0) + 1,
      );
    (result[template] ??= []).push({
      sequence: Number(sequence),
      type: first.milestone_type,
      name: first.milestone_name,
      paymentPercent: [...percents].sort((a, b) => b[1] - a[1])[0][0],
      eventTypes: first.required_event_types.split(";") as BusinessEventType[],
      latePenalty: first.late_penalty_applicable === "TRUE",
      offsetDays: Math.round(sorted[Math.floor(sorted.length / 2)]),
    });
  }
  for (const stages of Object.values(result))
    stages.sort((a, b) => a.sequence - b.sequence);
  return result;
}

export const stagesFor = (
  stages: Record<WorkflowTemplate, StageTemplate[]>,
  type: ContractType,
) => stages[WORKFLOW_BY_TYPE[type].template] ?? [];

/** Adds whole days to an ISO date. */
export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Two-decimal share of a decimal amount, computed in hundredths (no floats). */
export function shareOf(totalMillion: string, percent: string): string {
  const cents = toCents(totalMillion);
  const basis = toCents(percent); // percent with two decimals → hundredths of a percent
  const value = (cents * BigInt(basis)) / 10000n;
  return fromCents(value);
}

export function toCents(value: string): bigint {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) throw new Error(`INVALID_AMOUNT ${value}`);
  const cents =
    BigInt(match[2]) * 100n + BigInt((match[3] ?? "").padEnd(2, "0"));
  return match[1] ? -cents : cents;
}

export function fromCents(cents: bigint): string {
  const sign = cents < 0n ? "-" : "";
  const abs = cents < 0n ? -cents : cents;
  return `${sign}${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`;
}

export const sumMillion = (values: string[]) =>
  fromCents(values.reduce((sum, value) => sum + toCents(value), 0n));

/** Required condition text in the Data Pack DSL (spec 14.3). */
export function requiredCondition(
  eventTypes: string[],
  approvalRequired: boolean,
  quorum: number,
): string {
  return [
    ...eventTypes.map((type) => `EVENT:${type}`),
    ...(approvalRequired ? [`APPROVAL_QUORUM:${quorum}`] : []),
    "NO_OPEN_DISPUTE",
  ].join(" AND ");
}
