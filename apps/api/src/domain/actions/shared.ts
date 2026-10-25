import { BadRequestException } from "@nestjs/common";
import type { Ctx } from "../context";
import { businessNow, eventRecord, nextId } from "../factory";
import type { EventRecord, MilestoneRecord } from "../records";
import type {
  ActivityAction,
  ActivityCategory,
  EventStatus,
  EventType,
  Trigger,
} from "../types";
import { TERMINAL } from "../vocabulary";

export interface Outcome<T = unknown> {
  result: T;
  events: EventRecord[];
  /** Re-run the engine after the change (new events, exception decisions, new milestones). */
  evaluate: boolean;
  trigger: Trigger;
  milestoneId: string | null;
  audit: Array<{
    category: ActivityCategory;
    contractId: string;
    milestoneId: string | null;
    detail: ActivityAction;
  }>;
}

export const outcome = <T>(
  ctx: Ctx,
  result: T,
  part: Partial<Outcome<T>> = {},
): Outcome<T> => ({
  result,
  events: [],
  evaluate: false,
  trigger: { kind: "CONTRACT", actorName: ctx.actor.displayName },
  milestoneId: null,
  audit: [],
  ...part,
});

const DOCUMENT_PREFIX: Record<EventType, string> = {
  CONTRACT_SIGNED: "CTR",
  KICKOFF_CONFIRMED: "KO",
  REQUIREMENTS_APPROVED: "REQ",
  UAT_PASSED: "UAT",
  ACCEPTANCE: "ACC",
  DELIVERY: "DN",
  INVOICE: "INV",
  GO_LIVE: "GL",
  SERVICE_ACTIVATED: "ACT",
  SERVICE_COMPLETED: "SVC",
  WARRANTY_COMPLETED: "WAR",
  APPROVAL: "APR",
  REJECTION: "REJ",
  DISPUTE_OPENED: "DSP",
  DISPUTE_RESOLVED: "DSR",
};

export const text = (value: unknown, max = 1000) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

/** A new event recorded by the signed-in user, in the Data Pack schema (origin APP). */
export function newEvent(
  ctx: Ctx,
  m: MilestoneRecord,
  type: EventType,
  status: EventStatus,
  actorPartyId: string,
  opts: {
    note?: string;
    amount?: string;
    reference?: string;
    fileName?: string | null;
    at?: string;
  } = {},
): EventRecord {
  const actor = ctx.party(actorPartyId);
  if (!actor) throw new BadRequestException("UNKNOWN_PARTY");
  const id = nextId(
    "AP-EV",
    ctx.events.map((e) => e.event_id),
  );
  const sequence =
    Math.max(
      0,
      ...ctx.events
        .filter((e) => e.contract_id === m.contract_id)
        .map((e) => Number(e.contract_event_sequence) || 0),
    ) + 1;
  const record = eventRecord({
    id,
    milestone: m,
    type,
    status,
    actor,
    at: opts.at ?? businessNow(),
    sequence,
    documentId: `${DOCUMENT_PREFIX[type]}-${m.contract_id}-${String(m.milestone_sequence).padStart(2, "0")}-${id.slice(-4)}`,
    amount: opts.amount,
    referenceEventId: opts.reference,
    note: opts.note || "Recorded in CodeCash.",
    origin: "APP",
    recordedBy: ctx.actor.displayName,
    recordedByUserId: ctx.actor.id,
    fileName: opts.fileName ?? null,
  });
  ctx.events.push(record);
  return record;
}

/** Events may only be added to a signed contract and a milestone that is not final (spec 9.4). */
export function assertOpen(ctx: Ctx, m: MilestoneRecord) {
  const contract = ctx.contract(m.contract_id);
  if (contract.lifecycle !== "ACTIVE")
    throw new BadRequestException("CONTRACT_NOT_SIGNED");
  if (TERMINAL.includes(ctx.status(m)))
    throw new BadRequestException("MILESTONE_CLOSED");
  return contract;
}
