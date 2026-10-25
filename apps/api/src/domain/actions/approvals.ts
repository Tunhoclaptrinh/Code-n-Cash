import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import type { Ctx } from "../context";
import { businessNow, entity, nextId } from "../factory";
import {
  type EventRecord,
  type MilestoneRecord,
  type NoteRecord,
  TABLE,
} from "../records";
import { type Outcome, assertOpen, newEvent, outcome, text } from "./shared";

/** The APPROVAL the signed-in approver would record; null when they may not approve. */
export function approvalEvent(
  ctx: Ctx,
  m: MilestoneRecord,
  commit = false,
  note?: string,
): EventRecord | null {
  const role = ctx.approvalRole();
  if (!role || !ctx.actor.partyId) return null;
  const event = newEvent(ctx, m, "APPROVAL", "APPROVED", ctx.actor.partyId, {
    amount: m.planned_payment_vnd_mn,
    note: note || "Payment approval recorded.",
  });
  if (!commit) ctx.events.splice(ctx.events.indexOf(event), 1);
  return event;
}

export function castVote(
  ctx: Ctx,
  input: {
    contractId: string;
    sequence: number;
    choice: string;
    note?: string;
  },
): Outcome {
  const m = ctx.milestoneAt(input.contractId, Number(input.sequence));
  const contract = assertOpen(ctx, m);
  const role = ctx.approvalRole();
  if (
    !role ||
    !ctx.actor.partyId ||
    contract.buyer_id !== ctx.actor.organizationId
  )
    throw new ForbiddenException("NOT_AN_APPROVER");
  const note = text(input.note);
  const events = ctx.eventsOf(m.milestone_id);
  if (input.choice === "APPROVE") {
    if (m.approval_required !== "TRUE")
      throw new BadRequestException("APPROVAL_NOT_REQUIRED");
    if (!ctx.approvalRoles(m).includes(role))
      throw new ForbiddenException("NOT_A_REQUIRED_APPROVER");
    if (
      events.some(
        (e) =>
          e.event_type === "APPROVAL" && e.actor_party_id === ctx.actor.partyId,
      )
    )
      throw new ConflictException("ALREADY_VOTED");
    const event = approvalEvent(ctx, m, true, note)!;
    return eventOutcome(ctx, m, [event]);
  }
  if (!note) throw new BadRequestException("NOTE_REQUIRED");
  if (input.choice === "REJECT") {
    if (
      events.some(
        (e) =>
          e.event_type === "REJECTION" &&
          e.actor_party_id === ctx.actor.partyId,
      )
    )
      throw new ConflictException("ALREADY_VOTED");
    const event = newEvent(ctx, m, "REJECTION", "REJECTED", ctx.actor.partyId, {
      amount: m.planned_payment_vnd_mn,
      note,
    });
    return eventOutcome(ctx, m, [event]);
  }
  if (input.choice === "REQUEST_INFO") return requestInfo(ctx, m, note);
  throw new BadRequestException("INVALID_VOTE");
}

export function requestInfo(
  ctx: Ctx,
  m: MilestoneRecord,
  note: string,
): Outcome {
  const notes = ctx.t[TABLE.notes] as NoteRecord[];
  notes.push(
    entity(
      nextId(
        "NOTE-",
        notes.map((n) => n.id),
        5,
      ),
      {
        milestoneId: m.milestone_id,
        kind: "REQUEST_INFO" as const,
        text: note,
        author: ctx.actor.displayName,
        at: businessNow(),
        organizationId: ctx.actor.organizationId,
      },
    ) as NoteRecord,
  );
  return outcome(
    ctx,
    { noted: true },
    {
      milestoneId: m.milestone_id,
      audit: [
        {
          category: "SYSTEM",
          contractId: m.contract_id,
          milestoneId: m.milestone_id,
          detail: { kind: "REQUEST_INFO", text: note },
        },
      ],
    },
  );
}

export const eventOutcome = (
  ctx: Ctx,
  m: MilestoneRecord,
  events: EventRecord[],
) =>
  outcome(
    ctx,
    { eventIds: events.map((e) => e.event_id) },
    {
      events,
      evaluate: true,
      milestoneId: m.milestone_id,
      trigger: {
        kind: "EVENTS",
        eventIds: events.map((e) => e.event_id),
        actorName: ctx.actor.displayName,
      },
    },
  );
