import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import type { Ctx } from "../context";
import { businessNow, entity, nextId } from "../factory";
import { type ExceptionRecord, TABLE } from "../records";
import { voidCandidates } from "../views";
import { type Outcome, outcome, text } from "./shared";

export function proposeException(
  ctx: Ctx,
  input: {
    contractId: string;
    sequence: number;
    eventId: string;
    reason: string;
  },
): Outcome {
  if (ctx.actor.role !== "ADMIN_AUDITOR")
    throw new ForbiddenException("CONTROLLERS_ONLY");
  const m = ctx.milestoneAt(input.contractId, Number(input.sequence));
  const reason = text(input.reason);
  if (!reason) throw new BadRequestException("NOTE_REQUIRED");
  if (!voidCandidates(ctx, m).some((e) => e.event_id === input.eventId))
    throw new BadRequestException("EVENT_NOT_VOIDABLE");
  const exceptions = ctx.t[TABLE.exceptions] as ExceptionRecord[];
  const id = nextId(
    "EXC-",
    exceptions.map((x) => x.id),
    4,
  );
  exceptions.push(
    entity(id, {
      milestoneId: m.milestone_id,
      contractId: m.contract_id,
      eventId: input.eventId,
      action: "VOID" as const,
      reason,
      proposedBy: { userId: ctx.actor.id, name: ctx.actor.displayName },
      proposedAt: businessNow(),
      status: "PROPOSED" as const,
      decidedBy: null,
      decidedAt: null,
      decisionNote: null,
      organizationId: ctx.actor.organizationId,
    }) as ExceptionRecord,
  );
  return outcome(
    ctx,
    { id },
    {
      milestoneId: m.milestone_id,
      audit: [
        {
          category: "SYSTEM",
          contractId: m.contract_id,
          milestoneId: m.milestone_id,
          detail: {
            kind: "EXCEPTION",
            state: "PROPOSED",
            eventId: input.eventId,
          },
        },
      ],
    },
  );
}

/** SoD-2: a second controller decides; an approved void is applied by the engine (BR-19). */
export function decideException(
  ctx: Ctx,
  input: { exceptionId: string; approve: boolean; note?: string },
): Outcome {
  if (ctx.actor.role !== "ADMIN_AUDITOR")
    throw new ForbiddenException("CONTROLLERS_ONLY");
  const request = (ctx.t[TABLE.exceptions] as ExceptionRecord[]).find(
    (x) => x.id === input.exceptionId,
  );
  if (!request) throw new NotFoundException("EXCEPTION_NOT_FOUND");
  ctx.milestone(request.milestoneId);
  if (request.status !== "PROPOSED")
    throw new BadRequestException("EXCEPTION_ALREADY_DECIDED");
  if (request.proposedBy.userId === ctx.actor.id)
    throw new ForbiddenException("SECOND_CONTROLLER_REQUIRED");
  const approve = input.approve === true;
  Object.assign(request, {
    status: approve ? "APPROVED" : "REJECTED",
    decidedBy: { userId: ctx.actor.id, name: ctx.actor.displayName },
    decidedAt: businessNow(),
    decisionNote: text(input.note) || null,
    version: request.version + 1,
    updatedAt: new Date().toISOString(),
  });
  return outcome(
    ctx,
    { status: request.status },
    {
      evaluate: approve,
      milestoneId: request.milestoneId,
      trigger: {
        kind: "EXCEPTION",
        exceptionId: request.id,
        eventId: request.eventId,
        actorName: ctx.actor.displayName,
      },
      audit: [
        {
          category: "SYSTEM",
          contractId: request.contractId,
          milestoneId: request.milestoneId,
          detail: {
            kind: "EXCEPTION",
            state: request.status,
            eventId: request.eventId,
          },
        },
      ],
    },
  );
}
