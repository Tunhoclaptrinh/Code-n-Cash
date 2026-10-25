import { BadRequestException, ForbiddenException } from "@nestjs/common";
import type { Ctx } from "../context";
import type { EventRecord, MilestoneRecord } from "../records";
import { type Outcome, assertOpen, newEvent, text } from "./shared";
import { eventOutcome, requestInfo } from "./approvals";

/** Party recorded on dispute events: the supplier or buyer itself, or the owner approver (spec 4.2). */
function disputeParty(ctx: Ctx, m: MilestoneRecord) {
  const contract = ctx.contract(m.contract_id);
  if (
    ctx.actor.role === "SUPPLIER" &&
    contract.supplier_id === ctx.actor.organizationId
  )
    return contract.supplier_id;
  if (
    ctx.actor.role === "LEGAL_REVIEWER" &&
    contract.buyer_id === ctx.actor.organizationId
  )
    return contract.buyer_id;
  if (
    ctx.actor.role === "CONTRACT_OWNER" &&
    contract.buyer_id === ctx.actor.organizationId &&
    ctx.actor.partyId
  )
    return ctx.actor.partyId;
  return null;
}

export function openDispute(
  ctx: Ctx,
  input: { contractId: string; sequence: number; note: string },
): Outcome {
  const m = ctx.milestoneAt(input.contractId, Number(input.sequence));
  assertOpen(ctx, m);
  const party = disputeParty(ctx, m);
  if (!party) throw new ForbiddenException("CANNOT_OPEN_DISPUTE");
  // One open dispute already holds the milestone; further concerns go into that dispute.
  if (ctx.evaluation(m.milestone_id).openDisputeIds.length)
    throw new BadRequestException("DISPUTE_ALREADY_OPEN");
  const note = text(input.note);
  if (!note) throw new BadRequestException("NOTE_REQUIRED");
  return eventOutcome(ctx, m, [
    newEvent(ctx, m, "DISPUTE_OPENED", "OPEN", party, { note }),
  ]);
}

/** DISPUTE_RESOLVED for every open dispute, referencing it (BR-08); also used for the preview. */
export function resolutionEvents(
  ctx: Ctx,
  m: MilestoneRecord,
  commit = false,
  note?: string,
): EventRecord[] {
  const party = disputeParty(ctx, m);
  if (!party || ctx.actor.role === "SUPPLIER") return [];
  const created = ctx.evaluation(m.milestone_id).openDisputeIds.map((id) =>
    newEvent(ctx, m, "DISPUTE_RESOLVED", "RESOLVED", party, {
      reference: id,
      note: note || "Dispute resolved and workflow reopened.",
    }),
  );
  if (!commit)
    for (const event of created)
      ctx.events.splice(ctx.events.indexOf(event), 1);
  return created;
}

export function resolveDispute(
  ctx: Ctx,
  input: { contractId: string; sequence: number; option: string; note: string },
): Outcome {
  const m = ctx.milestoneAt(input.contractId, Number(input.sequence));
  assertOpen(ctx, m);
  const note = text(input.note);
  if (!note) throw new BadRequestException("NOTE_REQUIRED");
  if (
    !["LEGAL_REVIEWER", "CONTRACT_OWNER"].includes(ctx.actor.role) ||
    !disputeParty(ctx, m)
  )
    throw new ForbiddenException("CANNOT_RESOLVE_DISPUTE");
  if (!ctx.evaluation(m.milestone_id).openDisputeIds.length)
    throw new BadRequestException("DISPUTE_NOT_OPEN");
  if (input.option === "REQUEST_INFO") return requestInfo(ctx, m, note);
  if (input.option !== "RESOLVE")
    throw new BadRequestException("INVALID_RESOLUTION");
  return eventOutcome(ctx, m, resolutionEvents(ctx, m, true, note));
}
