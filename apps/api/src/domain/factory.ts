import type { RecordEntity } from "../common/types";
import type {
  ContractRecord,
  EventRecord,
  MilestoneRecord,
  PartyRecord,
  StageTemplate,
} from "./records";
import { APPROVAL_ROLES_BY_POLICY } from "./records";
import {
  addDays,
  fromCents,
  requiredCondition,
  shareOf,
  toCents,
} from "./templates";
import type { EventStatus, EventType, Origin } from "./types";

const stamp = () => new Date().toISOString();

export function entity<T extends object>(
  id: string,
  fields: T,
): RecordEntity & T {
  const now = stamp();
  return { id, version: 1, createdAt: now, updatedAt: now, ...fields };
}

/** Next identifier with a fixed prefix and width: CT0104 → CT0105, AP-EV0007 → AP-EV0008. */
export function nextId(prefix: string, ids: string[], width = 4): string {
  const pattern = new RegExp(`^${prefix.replace(/[-]/g, "\\-")}(\\d+)$`);
  const max = ids.reduce((highest, id) => {
    const match = pattern.exec(id);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  return `${prefix}${String(max + 1).padStart(width, "0")}`;
}

/** Vietnam business time as the Data Pack writes it: YYYY-MM-DDTHH:MM:SS, no zone. */
export function businessNow(at = Date.now()): string {
  return new Date(at + 7 * 3_600_000).toISOString().slice(0, 19);
}

/**
 * Cuts a contract into milestones from its workflow stages. Amounts are shares of the contract
 * value; the last stage takes the remainder so the milestones always add up to the contract.
 */
export function milestonesFor(
  contract: ContractRecord,
  stages: StageTemplate[],
  firstNumber: number,
  dueDates: Record<number, string> = {},
  origin: Origin = "APP",
): MilestoneRecord[] {
  const roles = APPROVAL_ROLES_BY_POLICY[contract.approval_policy] ?? [];
  const approvalRequired = roles.length > 0;
  let allocated = 0n;
  return stages.map((stage, index) => {
    const last = index === stages.length - 1;
    const planned = last
      ? fromCents(toCents(contract.contract_value_vnd_mn) - allocated)
      : shareOf(contract.contract_value_vnd_mn, stage.paymentPercent);
    allocated += toCents(planned);
    const id = `MS${String(firstNumber + index).padStart(4, "0")}`;
    return entity(id, {
      milestone_id: id,
      contract_id: contract.contract_id,
      milestone_sequence: String(stage.sequence),
      milestone_type: stage.type,
      milestone_name: stage.name,
      due_date:
        dueDates[stage.sequence] ??
        addDays(contract.start_date, stage.offsetDays),
      payment_percent: stage.paymentPercent,
      planned_payment_vnd_mn: planned,
      condition_logic: "ALL",
      required_event_types: stage.eventTypes.join(";"),
      required_condition: requiredCondition(
        stage.eventTypes,
        approvalRequired,
        roles.length,
      ),
      invoice_required: stage.eventTypes.includes("INVOICE") ? "TRUE" : "FALSE",
      approval_required: approvalRequired ? "TRUE" : "FALSE",
      required_approval_quorum: String(roles.length),
      required_approval_roles: roles.join(";"),
      hold_on_open_dispute: "TRUE",
      late_penalty_applicable: stage.latePenalty ? "TRUE" : "FALSE",
      grace_period_days: contract.grace_period_days,
      penalty_rate_pct_per_day: stage.latePenalty
        ? contract.penalty_rate_pct_per_day
        : "0.00",
      max_penalty_pct: stage.latePenalty ? contract.max_penalty_pct : "0.00",
      release_rule_code: `${contract.rule_set_id}:${stage.type}`,
      initial_milestone_status: "PLANNED",
      data_is_synthetic: "TRUE",
      origin,
    });
  });
}

export interface EventInput {
  id: string;
  milestone: MilestoneRecord;
  type: EventType;
  status: EventStatus;
  actor: PartyRecord;
  at: string;
  sequence: number;
  documentId: string;
  amount?: string;
  referenceEventId?: string;
  note: string;
  origin: Origin;
  recordedBy?: string | null;
  recordedByUserId?: string | null;
  fileName?: string | null;
}

/** An event row in the Data Pack schema; the actor's type and role come from the parties table. */
export function eventRecord(input: EventInput): EventRecord {
  return entity(input.id, {
    event_id: input.id,
    contract_id: input.milestone.contract_id,
    milestone_id: input.milestone.milestone_id,
    contract_event_sequence: String(input.sequence),
    event_timestamp: input.at,
    event_type: input.type,
    event_status: input.status,
    actor_party_id: input.actor.party_id,
    actor_party_type: input.actor.party_type,
    actor_role:
      input.actor.party_type === "APPROVER"
        ? input.actor.approval_role
        : input.actor.party_type,
    event_source: "PORTAL",
    document_id: input.documentId,
    amount_vnd_mn: input.amount ?? "",
    reference_event_id: input.referenceEventId ?? "",
    event_note: input.note,
    data_is_synthetic: "TRUE",
    origin: input.origin,
    recordedBy: input.recordedBy ?? null,
    recordedByUserId: input.recordedByUserId ?? null,
    fileName: input.fileName ?? null,
  });
}
