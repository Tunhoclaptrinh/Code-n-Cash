import { BadRequestException, ForbiddenException } from "@nestjs/common";
import type { Ctx } from "../context";
import { acceptanceReview, reviewDaysOf } from "../review-window";
import { eventOutcome } from "./approvals";
import { type Outcome, assertOpen, newEvent, text } from "./shared";

/**
 * BR-21: the supplier asks the buyer to accept a milestone. The request opens the contract's review
 * window; once it closes, the buyer's documents count at its end (engine, schedule.py). Only the
 * contract's supplier may ask, once per open request, while the buyer's documents are still missing.
 */
export function requestAcceptance(
  ctx: Ctx,
  input: { contractId: string; sequence: number; note?: string },
): Outcome {
  const m = ctx.milestoneAt(input.contractId, Number(input.sequence));
  const contract = assertOpen(ctx, m);
  if (
    ctx.actor.role !== "SUPPLIER" ||
    contract.supplier_id !== ctx.actor.organizationId
  )
    throw new ForbiddenException("CANNOT_REQUEST_ACCEPTANCE");
  if (reviewDaysOf(contract) === null)
    throw new BadRequestException("REVIEW_WINDOW_NOT_SET");
  const review = acceptanceReview(ctx, m);
  if (!review) throw new BadRequestException("NOTHING_TO_ACCEPT");
  if (review.state === "ACCEPTED" || review.state === "ACCEPTED_AFTER_DEADLINE")
    throw new BadRequestException("ALREADY_ACCEPTED");
  if (review.request)
    throw new BadRequestException("ACCEPTANCE_ALREADY_REQUESTED");
  if (!review.canRequest) throw new BadRequestException("MILESTONE_CLOSED");
  const note = text(input.note) || "Đề nghị bên mua nghiệm thu theo hợp đồng.";
  return eventOutcome(ctx, m, [
    newEvent(
      ctx,
      m,
      "ACCEPTANCE_REQUESTED",
      "CONFIRMED",
      contract.supplier_id,
      {
        note,
      },
    ),
  ]);
}

/**
 * BR-21: the buyer's contract officer returns the open request, with the reason, inside the window. The
 * request no longer counts; the supplier fixes the work and asks again. After the window has closed a
 * return is refused: the buyer's documents already count at the deadline.
 */
export function returnAcceptanceRequest(
  ctx: Ctx,
  input: { contractId: string; sequence: number; note: string },
): Outcome {
  const m = ctx.milestoneAt(input.contractId, Number(input.sequence));
  const contract = assertOpen(ctx, m);
  if (
    ctx.actor.role !== "LEGAL_REVIEWER" ||
    contract.buyer_id !== ctx.actor.organizationId
  )
    throw new ForbiddenException("CANNOT_RETURN_ACCEPTANCE");
  const note = text(input.note);
  if (!note) throw new BadRequestException("NOTE_REQUIRED");
  const review = acceptanceReview(ctx, m);
  if (!review?.request) throw new BadRequestException("NO_ACCEPTANCE_REQUEST");
  if (review.state === "OVERDUE")
    throw new BadRequestException("REVIEW_WINDOW_CLOSED");
  if (!review.canReturn) throw new BadRequestException("MILESTONE_CLOSED");
  return eventOutcome(ctx, m, [
    newEvent(ctx, m, "ACCEPTANCE_RETURNED", "RETURNED", contract.buyer_id, {
      note,
      reference: review.request.eventId,
    }),
  ]);
}
