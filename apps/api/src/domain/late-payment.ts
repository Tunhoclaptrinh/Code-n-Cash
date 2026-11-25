import type { Ctx } from "./context";
import { today } from "./context";
import type { ContractRecord, MilestoneRecord } from "./records";
import { addDays, daysBetween, fromCents, toCents } from "./templates";
import type { Evaluation, LatePayment } from "./types";
import { VALID_STATUS } from "./vocabulary";

/**
 * The buyer's side of a two-way contract: the payment term and the late-payment interest (lãi chậm
 * trả, Luật Thương mại 2005, Điều 306). Both are terms of contracts drafted in the app; contracts
 * without them (the organiser's Data Pack, the seeded demo contracts) owe no interest.
 *
 * The term runs from the milestone's completion date (BR-11: the required documents, which never
 * include the buyer's approvals), or from the closing of the latest dispute when that is later. So
 * the buyer's own approvals, and a buyer's late acceptance record that the supplier requested in
 * time (actions/acceptance.ts), do not move the due date. Interest is simple, per calendar day, on
 * the amount the engine decided: amount × annual rate × days late / 365, in hundredths of a
 * million, half up. The engine and its decisions are not changed: the interest is added to the
 * payment instruction only.
 */

const DAYS_PER_YEAR = 365n;

/**
 * Values a new draft proposes; the drafter changes them to what the parties agree. The rate is a
 * placeholder, not a legal figure: Điều 306 refers to the average market rate for overdue debt.
 */
export const DEFAULT_PAYMENT_TERM_DAYS = 30;
export const DEFAULT_LATE_PAYMENT_RATE_PCT = "10.00";

/** The contract's payment terms, or null when it has none. */
export function paymentTermsOf(
  contract: ContractRecord,
): { termDays: number; ratePct: string } | null {
  if (
    !Number.isInteger(contract.paymentTermDays) ||
    !contract.latePaymentRatePct
  )
    return null;
  return {
    termDays: Number(contract.paymentTermDays),
    ratePct: contract.latePaymentRatePct,
  };
}

/** amount × annual rate (%) × days / 365, in hundredths of a million, half up. */
export function lateInterest(
  amountMillion: string,
  ratePct: string,
  days: number,
): string {
  if (days <= 0) return "0.00";
  const numerator =
    toCents(amountMillion) * toCents(ratePct) * BigInt(Math.trunc(days));
  // Two factors of 100: the rate is a percentage given in hundredths.
  const denominator = 100n * 100n * DAYS_PER_YEAR;
  return fromCents((numerator * 2n + denominator) / (2n * denominator));
}

/** When the payment term starts: completion, or the closing of the latest dispute if later. */
function termStart(
  ctx: Ctx,
  m: MilestoneRecord,
  evaluation: Evaluation,
): string | null {
  if (!evaluation.completedAt) return null;
  const resolutions = ctx
    .eventsOf(m.milestone_id)
    .filter(
      (e) =>
        e.event_type === "DISPUTE_RESOLVED" &&
        e.event_status === VALID_STATUS.DISPUTE_RESOLVED &&
        !evaluation.voided.includes(e.event_id),
    )
    .map((e) => e.event_timestamp);
  return [evaluation.completedAt, ...resolutions].sort().at(-1)!.slice(0, 10);
}

/**
 * The payment due date of a paying milestone and the interest owed if it is paid on `paidOn`
 * (today by default). Null when the contract has no payment terms or nothing is payable.
 */
export function latePaymentOf(
  ctx: Ctx,
  m: MilestoneRecord,
  evaluation: Evaluation,
  paidOn: string = today(),
): LatePayment | null {
  if (evaluation.decision !== "RELEASE" && evaluation.decision !== "PENALTY")
    return null;
  const terms = paymentTermsOf(ctx.contract(m.contract_id));
  const start = termStart(ctx, m, evaluation);
  if (!terms || !start) return null;
  const dueOn = addDays(start, terms.termDays);
  const daysLate = Math.max(0, daysBetween(dueOn, paidOn));
  return {
    termDays: terms.termDays,
    ratePct: terms.ratePct,
    startsOn: start,
    dueOn,
    daysLate,
    interestMillion: lateInterest(
      evaluation.payableMillion,
      terms.ratePct,
      daysLate,
    ),
  };
}

/** The amount the buyer transfers: the engine's payable amount plus any late-payment interest. */
export const totalWithInterest = (
  payableMillion: string,
  late: LatePayment | null,
) =>
  fromCents(
    toCents(payableMillion) + (late ? toCents(late.interestMillion) : 0n),
  );
