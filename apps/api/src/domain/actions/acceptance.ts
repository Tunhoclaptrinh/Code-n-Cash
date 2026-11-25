import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import type { Ctx } from "../context";
import { businessNow, entity, nextId } from "../factory";
import {
  type AcceptanceRequestRecord,
  type ContractRecord,
  type MilestoneRecord,
  TABLE,
} from "../records";
import { addDays } from "../templates";
import type {
  AcceptanceRequest,
  AcceptanceRequestState,
  BusinessEventType,
} from "../types";
import { AUTHORITY, TERMINAL } from "../vocabulary";
import { type Outcome, assertOpen, outcome, text } from "./shared";

/**
 * Acceptance requests (đề nghị nghiệm thu). The completion date of a milestone is the latest of its
 * required documents (BR-11), and some of them are the buyer's (ACCEPTANCE, UAT_PASSED, ...). A buyer
 * who files late would make the supplier pay the late penalty. So the supplier, once its own
 * documents are in, asks the buyer to confirm; the server stamps the request. When the buyer then
 * files its documents they are recorded at the time of the request, and the real filing time is
 * kept on the request, the event and the audit log. A buyer who finds the work not ready declines
 * with a reason and the supplier asks again, which gives a new time. The engine is not changed: it
 * still reads event timestamps.
 */

/** Days the buyer has to answer before the buyer's controller is told. */
export const ACCEPTANCE_RESPONSE_DAYS = 5;

const all = (ctx: Ctx) =>
  (ctx.t[TABLE.acceptanceRequests] ?? []) as AcceptanceRequestRecord[];

export const acceptanceRequestsOf = (ctx: Ctx, milestoneId: string) =>
  all(ctx)
    .filter((r) => r.milestoneId === milestoneId)
    .sort((a, b) => b.id.localeCompare(a.id))
    .map(plain);

export const openAcceptanceRequest = (ctx: Ctx, milestoneId: string) =>
  all(ctx).find((r) => r.milestoneId === milestoneId && r.state === "OPEN") ??
  null;

/**
 * The buyer's documents a request can cover. The signing of the contract is not the supplier's
 * work to hand over, so CONTRACT_SIGNED is left out.
 */
function pendingBuyerTypes(ctx: Ctx, m: MilestoneRecord): BusinessEventType[] {
  return ctx
    .requirements(m)
    .filter(
      (r) =>
        r.state !== "VALID" &&
        AUTHORITY[r.eventType] === "BUYER" &&
        r.eventType !== "CONTRACT_SIGNED",
    )
    .map((r) => r.eventType);
}

const supplierDone = (ctx: Ctx, m: MilestoneRecord) =>
  ctx
    .requirements(m)
    .every((r) => AUTHORITY[r.eventType] !== "SUPPLIER" || r.state === "VALID");

/** The organiser's Data Pack rows are sealed as given (risk R08). */
const eligible = (ctx: Ctx, contract: ContractRecord, m: MilestoneRecord) =>
  contract.lifecycle === "ACTIVE" &&
  contract.origin !== "DATA_PACK" &&
  ctx.hasEvaluation(m.milestone_id) &&
  !TERMINAL.includes(ctx.status(m));

export const mayRequestAcceptance = (ctx: Ctx, m: MilestoneRecord) => {
  const contract = ctx.contract(m.contract_id);
  return (
    eligible(ctx, contract, m) &&
    ctx.actor.role === "SUPPLIER" &&
    contract.supplier_id === ctx.actor.organizationId &&
    pendingBuyerTypes(ctx, m).length > 0 &&
    supplierDone(ctx, m) &&
    !openAcceptanceRequest(ctx, m.milestone_id)
  );
};

/** The buyer's contract officer files the buyer's documents (spec 17), so answers the request too. */
export const mayDeclineAcceptance = (ctx: Ctx, m: MilestoneRecord) => {
  const contract = ctx.contract(m.contract_id);
  return (
    eligible(ctx, contract, m) &&
    ctx.actor.role === "LEGAL_REVIEWER" &&
    contract.buyer_id === ctx.actor.organizationId &&
    !!openAcceptanceRequest(ctx, m.milestone_id)
  );
};

export function requestAcceptance(
  ctx: Ctx,
  input: { contractId: string; sequence: number; note?: string },
): Outcome<AcceptanceRequest> {
  const m = ctx.milestoneAt(String(input?.contractId), Number(input.sequence));
  const contract = assertOpen(ctx, m);
  if (contract.origin === "DATA_PACK")
    throw new ForbiddenException("DATA_PACK_LOCKED");
  if (
    ctx.actor.role !== "SUPPLIER" ||
    contract.supplier_id !== ctx.actor.organizationId
  )
    throw new ForbiddenException("CANNOT_REQUEST_ACCEPTANCE");
  const eventTypes = pendingBuyerTypes(ctx, m);
  if (!eventTypes.length) throw new BadRequestException("NOTHING_TO_ACCEPT");
  if (!supplierDone(ctx, m))
    throw new BadRequestException("EVIDENCE_INCOMPLETE");
  if (openAcceptanceRequest(ctx, m.milestone_id))
    throw new ConflictException("ACCEPTANCE_REQUEST_PENDING");
  const requestedAt = businessNow();
  const record = entity(
    nextId(
      "ACR-",
      all(ctx).map((r) => r.id),
      5,
    ),
    {
      contractId: m.contract_id,
      milestoneId: m.milestone_id,
      sequence: Number(m.milestone_sequence),
      state: "OPEN" as AcceptanceRequestState,
      eventTypes,
      note: text(input.note, 2000) || null,
      requestedBy: { id: ctx.actor.id, name: ctx.actor.displayName },
      requestedAt,
      respondBy: addDays(requestedAt.slice(0, 10), ACCEPTANCE_RESPONSE_DAYS),
      decidedBy: null,
      decidedAt: null,
      decisionNote: null,
      eventIds: [] as string[],
      organizationId: contract.buyer_id,
    },
  ) as AcceptanceRequestRecord;
  (ctx.t[TABLE.acceptanceRequests] ??= []).push(record);
  return outcome(ctx, plain(record), {
    milestoneId: m.milestone_id,
    audit: [auditOf(record)],
  });
}

export function declineAcceptance(
  ctx: Ctx,
  input: { contractId: string; sequence: number; note: string },
): Outcome<AcceptanceRequest> {
  const m = ctx.milestoneAt(String(input?.contractId), Number(input.sequence));
  assertOpen(ctx, m);
  const record = openAcceptanceRequest(ctx, m.milestone_id);
  if (!record) throw new NotFoundException("ACCEPTANCE_REQUEST_NOT_FOUND");
  if (!mayDeclineAcceptance(ctx, m))
    throw new ForbiddenException("CANNOT_DECLINE_ACCEPTANCE");
  const note = text(input.note, 2000);
  if (!note) throw new BadRequestException("NOTE_REQUIRED");
  return close(ctx, record, "DECLINED", note, []);
}

/**
 * The time the buyer's document of this type is recorded at: the open request's, when it covers
 * the type. Read by the evidence actions, for the dry run and the real submission alike.
 */
export function acceptanceTime(
  ctx: Ctx,
  m: MilestoneRecord,
  type: BusinessEventType,
): { at: string; requestId: string } | null {
  const record = openAcceptanceRequest(ctx, m.milestone_id);
  return record?.eventTypes.includes(type)
    ? { at: record.requestedAt, requestId: record.id }
    : null;
}

/** The buyer filed the documents the request asked for: the request is confirmed. */
export function confirmAcceptance(
  ctx: Ctx,
  m: MilestoneRecord,
  eventIds: string[],
): Outcome["audit"] {
  const record = openAcceptanceRequest(ctx, m.milestone_id);
  if (!record || !eventIds.length) return [];
  return close(ctx, record, "CONFIRMED", null, eventIds).audit;
}

function close(
  ctx: Ctx,
  record: AcceptanceRequestRecord,
  state: AcceptanceRequestState,
  note: string | null,
  eventIds: string[],
): Outcome<AcceptanceRequest> {
  Object.assign(record, {
    state,
    decidedBy: { id: ctx.actor.id, name: ctx.actor.displayName },
    decidedAt: businessNow(),
    decisionNote: note,
    eventIds,
    version: record.version + 1,
    updatedAt: new Date().toISOString(),
  });
  return outcome(ctx, plain(record), {
    milestoneId: record.milestoneId,
    audit: [auditOf(record)],
  });
}

const auditOf = (record: AcceptanceRequestRecord) => ({
  category: "EVIDENCE" as const,
  contractId: record.contractId,
  milestoneId: record.milestoneId,
  detail: { kind: "ACCEPTANCE_REQUEST" as const, state: record.state },
});

export const plain = (record: AcceptanceRequestRecord): AcceptanceRequest => ({
  id: record.id,
  contractId: record.contractId,
  milestoneId: record.milestoneId,
  sequence: record.sequence,
  state: record.state,
  eventTypes: record.eventTypes,
  note: record.note,
  requestedBy: record.requestedBy,
  requestedAt: record.requestedAt,
  respondBy: record.respondBy,
  decidedBy: record.decidedBy,
  decidedAt: record.decidedAt,
  decisionNote: record.decisionNote,
  eventIds: record.eventIds,
});
