import { MAX_ACCEPTANCE_REVIEW_DAYS } from "../common/field-validation";
import type { Ctx } from "./context";
import { businessNow, entity } from "./factory";
import type { ContractRecord, MilestoneRecord, Tables } from "./records";
import type { AcceptanceReview, BusinessEventType } from "./types";
import { TERMINAL } from "./vocabulary";

/**
 * BR-21, acceptance review window (docs/NGHIEP_VU.md). The supplier asks for acceptance; the buyer issues
 * its documents within the contract's window or returns the request with a reason. A buyer document
 * issued after the window counts at the window's end, so the buyer's delay never makes the supplier
 * late. The engine decides (apps/engine/codecash_engine/schedule.py); this module only reads the
 * contract's setting and shapes what the milestone screen shows and allows.
 */

/** System setting (SYSTEM_ADMIN) with the window new drafts start from. */
export const REVIEW_DAYS_SETTING = "ACCEPTANCE_REVIEW_DAYS";
export const DEFAULT_REVIEW_DAYS = 5;

const parseDays = (value: unknown): number | null => {
  const text = String(value ?? "").trim();
  if (!/^\d{1,3}$/.test(text)) return null;
  const days = Number(text);
  return days >= 1 && days <= MAX_ACCEPTANCE_REVIEW_DAYS ? days : null;
};

/** The contract's window in days, or null when it sets none (every Data Pack contract). */
export const reviewDaysOf = (contract: ContractRecord) =>
  parseDays(contract.acceptance_review_days);

/** The window a new draft starts from: the system setting, or 5 days when it is missing or unreadable. */
export function defaultReviewDays(tables: Tables): number {
  const row = (tables.settings ?? []).find(
    (s) => (s as { name?: string }).name === REVIEW_DAYS_SETTING,
  ) as { value?: string } | undefined;
  return parseDays(row?.value) ?? DEFAULT_REVIEW_DAYS;
}

/** The settings row added by the seed and, on an existing database, by the startup migration. */
export const reviewDaysSetting = () =>
  entity(`setting-${REVIEW_DAYS_SETTING.toLowerCase()}`, {
    name: REVIEW_DAYS_SETTING,
    value: String(DEFAULT_REVIEW_DAYS),
    origin: "SEED",
    organizationId: "OPS",
  });

/** Whole calendar days from `from` to `to` (timestamps "YYYY-MM-DDTHH:MM:SS"). */
const daysBetween = (from: string, to: string) =>
  Math.round(
    (Date.parse(`${to.slice(0, 10)}T00:00:00Z`) -
      Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) /
      86_400_000,
  );

/** The buyer's contract officer of this contract: the one who issues the buyer's documents. */
const isBuyerOfficer = (ctx: Ctx, contract: ContractRecord) =>
  ctx.actor.role === "LEGAL_REVIEWER" &&
  contract.buyer_id === ctx.actor.organizationId;

const isSupplier = (ctx: Ctx, contract: ContractRecord) =>
  ctx.actor.role === "SUPPLIER" &&
  contract.supplier_id === ctx.actor.organizationId;

/**
 * The review window of one milestone as the milestone screen shows it; null when the contract sets no
 * window or the milestone needs no buyer document. `now` is business time (Vietnam), for tests.
 */
export function acceptanceReview(
  ctx: Ctx,
  m: MilestoneRecord,
  now = businessNow(),
): AcceptanceReview | null {
  const contract = ctx.contract(m.contract_id);
  const days = reviewDaysOf(contract);
  if (days === null) return null;
  const requirements = ctx.requirements(m);
  const reviewed = requirements.filter((r) => r.side === "BUYER");
  if (!reviewed.length) return null;
  const evaluation = ctx.hasEvaluation(m.milestone_id)
    ? ctx.evaluation(m.milestone_id)
    : null;
  const window = evaluation?.reviewWindow ?? null;
  const events = ctx.eventsOf(m.milestone_id);
  const byId = new Map(events.map((e) => [e.event_id, e]));
  const nameOf = (id: string) => {
    const e = byId.get(id);
    return (
      e?.recordedBy || ctx.party(e?.actor_party_id ?? "")?.party_name || ""
    );
  };

  const deadline = window?.deadline ?? null;
  const deemed = new Set<BusinessEventType>(window?.deemedTypes ?? []);
  const documents = reviewed.map((r) => ({
    eventType: r.eventType,
    issuedAt: r.state === "VALID" ? r.at : null,
    countedAt:
      r.state !== "VALID" ? null : deemed.has(r.eventType) ? deadline : r.at,
    deemed: deemed.has(r.eventType),
  }));
  const accepted = documents.every((d) => d.issuedAt !== null);
  const requestId = window?.requestId ?? null;
  const request = requestId ? byId.get(requestId) : undefined;

  const state: AcceptanceReview["state"] = accepted
    ? deemed.size
      ? "ACCEPTED_AFTER_DEADLINE"
      : "ACCEPTED"
    : !requestId
      ? "NOT_REQUESTED"
      : !deadline
        ? "WAITING_SUPPLIER_DOCUMENTS"
        : now > deadline
          ? "OVERDUE"
          : "IN_REVIEW";

  // The return names its request (app events); otherwise it is the buyer's first return after it.
  const returnEvents = events
    .filter(
      (e) =>
        e.event_type === "ACCEPTANCE_RETURNED" &&
        e.actor_party_id === contract.buyer_id,
    )
    .sort((a, b) => a.event_timestamp.localeCompare(b.event_timestamp));
  const returns = (window?.returnedIds ?? [])
    .map((id) => {
      const asked = byId.get(id);
      const back = asked
        ? (returnEvents.find((e) => e.reference_event_id === id) ??
          returnEvents.find((e) => e.event_timestamp >= asked.event_timestamp))
        : undefined;
      return asked && back
        ? {
            requestId: id,
            requestedAt: asked.event_timestamp,
            returnedAt: back.event_timestamp,
            by: nameOf(back.event_id),
            reason: back.event_note,
          }
        : null;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .reverse();

  const open =
    contract.lifecycle === "ACTIVE" &&
    !TERMINAL.includes(ctx.status(m)) &&
    !ctx.paid(m.milestone_id);
  return {
    days,
    state,
    request: request
      ? {
          eventId: request.event_id,
          at: request.event_timestamp,
          by: nameOf(request.event_id),
          note: request.event_note,
        }
      : null,
    startsAt: window?.startsAt ?? null,
    deadline,
    daysLeft:
      state === "IN_REVIEW" && deadline ? daysBetween(now, deadline) : null,
    documents,
    returns,
    canRequest: open && !accepted && !requestId && isSupplier(ctx, contract),
    canReturn:
      open &&
      !accepted &&
      state === "IN_REVIEW" &&
      isBuyerOfficer(ctx, contract),
  };
}
