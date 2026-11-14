import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { canonical, sha256 } from "../../common/audit-chain";
import { validIsoDate } from "../../common/field-validation";
import type { Ctx } from "../context";
import { businessNow, entity } from "../factory";
import {
  type AmendmentRecord,
  type ContractRecord,
  type MilestoneRecord,
  TABLE,
} from "../records";
import type { Amendment, AmendmentState } from "../types";
import { TERMINAL } from "../vocabulary";
import { type Outcome, outcome, text } from "./shared";

/**
 * Amendments (phụ lục) to the schedule of a signed contract. The buyer's contract officer or owner
 * proposes new due dates for milestones that are still open and/or a later end date, with a reason;
 * the contract's supplier accepts or rejects; the proposer may withdraw it while it is open. Only an
 * accepted amendment changes anything: the milestones' due dates (which the engine reads, so lateness
 * and penalties are recomputed) and the end date in force. The signed terms are never edited, so the
 * contract's signatures still verify; the amendment keeps its own digest.
 */
const amendmentsOf = (ctx: Ctx, code: string) =>
  ((ctx.t[TABLE.amendments] ?? []) as AmendmentRecord[]).filter(
    (a) => a.contractCode === code,
  );

const BUYER_EDITORS = ["LEGAL_REVIEWER", "CONTRACT_OWNER"];

/** The organiser's Data Pack rows are sealed as given (risk R08); only app and demo contracts change. */
const amendable = (contract: ContractRecord) =>
  contract.lifecycle === "ACTIVE" && contract.origin !== "DATA_PACK";

export const mayProposeAmendment = (ctx: Ctx, contract: ContractRecord) =>
  amendable(contract) &&
  BUYER_EDITORS.includes(ctx.actor.role) &&
  contract.buyer_id === ctx.actor.organizationId;

export const mayDecideAmendment = (ctx: Ctx, contract: ContractRecord) =>
  amendable(contract) &&
  ctx.actor.role === "SUPPLIER" &&
  contract.supplier_id === ctx.actor.organizationId;

export const openAmendment = (ctx: Ctx, code: string) =>
  amendmentsOf(ctx, code).find((a) => a.state === "PROPOSED") ?? null;

export const endDateOf = (contract: ContractRecord) =>
  contract.amendedEndDate ?? contract.end_date;

/**
 * A milestone whose payment is decided (payable, paid or rejected) keeps its due date: moving it
 * would change a penalty after the fact.
 */
const decided = (ctx: Ctx, m: MilestoneRecord) =>
  ctx.paid(m.milestone_id) ||
  [...TERMINAL, "ELIGIBLE_FOR_PAYMENT", "PAID_WITH_PENALTY"].includes(
    ctx.status(m),
  );

/**
 * The schedule after the change: every date inside the contract period (start to the end date in
 * force), in milestone order; a closed (paid or rejected) milestone keeps its date.
 */
function checkSchedule(
  ctx: Ctx,
  contract: ContractRecord,
  endDate: string,
  dueDates: Map<number, string>,
) {
  const milestones = [...ctx.milestonesOf(contract.contract_id)].sort(
    (a, b) => Number(a.milestone_sequence) - Number(b.milestone_sequence),
  );
  let previous = contract.start_date;
  for (const m of milestones) {
    const sequence = Number(m.milestone_sequence);
    const changed = dueDates.get(sequence);
    if (changed !== undefined && decided(ctx, m))
      throw new BadRequestException("MILESTONE_CLOSED");
    const date = changed ?? m.due_date;
    if (!date) continue;
    if (date < previous || date > endDate)
      throw new BadRequestException("DUE_DATE_OUT_OF_RANGE");
    previous = date;
  }
  for (const sequence of dueDates.keys())
    if (!milestones.some((m) => Number(m.milestone_sequence) === sequence))
      throw new NotFoundException("MILESTONE_NOT_FOUND");
}

export function proposeAmendment(
  ctx: Ctx,
  input: {
    contractId: string;
    reason: string;
    endDate?: string | null;
    dueDates?: { sequence: number; dueDate: string }[];
  },
): Outcome<Amendment> {
  const contract = ctx.contract(String(input?.contractId));
  if (contract.lifecycle === "CLOSED")
    throw new BadRequestException("CONTRACT_CLOSED");
  if (contract.lifecycle !== "ACTIVE")
    throw new BadRequestException("CONTRACT_NOT_SIGNED");
  if (contract.origin === "DATA_PACK")
    throw new ForbiddenException("DATA_PACK_LOCKED");
  if (!mayProposeAmendment(ctx, contract))
    throw new ForbiddenException("CANNOT_AMEND");
  if (openAmendment(ctx, contract.contract_id))
    throw new ConflictException("AMENDMENT_PENDING");
  const reason = text(input.reason, 2000);
  if (!reason) throw new BadRequestException("NOTE_REQUIRED");
  const currentEnd = endDateOf(contract);
  const newEnd = input.endDate ? String(input.endDate) : null;
  if (
    newEnd !== null &&
    (!validIsoDate(newEnd) || newEnd <= contract.start_date)
  )
    throw new BadRequestException("INVALID_DATES");
  const requested = Array.isArray(input.dueDates) ? input.dueDates : [];
  if (requested.length > 20) throw new BadRequestException("INVALID_INPUT");
  const dueDates = new Map<number, string>();
  for (const row of requested) {
    const sequence = Number(row?.sequence);
    if (
      !Number.isInteger(sequence) ||
      !validIsoDate(row?.dueDate) ||
      dueDates.has(sequence)
    )
      throw new BadRequestException("INVALID_DATES");
    dueDates.set(sequence, row.dueDate);
  }
  const milestoneAt = (sequence: number) =>
    ctx
      .milestonesOf(contract.contract_id)
      .find((m) => Number(m.milestone_sequence) === sequence) as
      MilestoneRecord | undefined;
  // Only real changes are kept.
  for (const [sequence, date] of [...dueDates])
    if (milestoneAt(sequence)?.due_date === date) dueDates.delete(sequence);
  const endChange =
    newEnd !== null && newEnd !== currentEnd
      ? { from: currentEnd, to: newEnd }
      : null;
  if (!endChange && !dueDates.size)
    throw new BadRequestException("AMENDMENT_EMPTY");
  checkSchedule(ctx, contract, endChange?.to ?? currentEnd, dueDates);

  const all = (ctx.t[TABLE.amendments] ??= []) as AmendmentRecord[];
  const number = amendmentsOf(ctx, contract.contract_id).length + 1;
  const changes = {
    contractCode: contract.contract_id,
    number,
    reason,
    endDate: endChange,
    dueDates: [...dueDates]
      .sort(([a], [b]) => a - b)
      .map(([sequence, to]) => {
        const m = milestoneAt(sequence)!;
        return {
          sequence,
          milestoneId: m.milestone_id,
          from: m.due_date || null,
          to,
        };
      }),
  };
  const record = entity(
    `${contract.contract_id}-PL${String(number).padStart(2, "0")}`,
    {
      ...changes,
      state: "PROPOSED" as AmendmentState,
      proposedBy: { id: ctx.actor.id, name: ctx.actor.displayName },
      proposedAt: businessNow(),
      decidedBy: null,
      decidedAt: null,
      decisionNote: null,
      digest: sha256(canonical(changes)),
      organizationId: contract.buyer_id,
    },
  ) as AmendmentRecord;
  all.push(record);
  return outcome(ctx, plain(record), {
    audit: [auditOf(record)],
  });
}

export function decideAmendment(
  ctx: Ctx,
  input: {
    contractId: string;
    amendmentId: string;
    choice: "ACCEPT" | "REJECT";
    note?: string;
  },
): Outcome<Amendment> {
  const contract = ctx.contract(String(input?.contractId));
  if (!mayDecideAmendment(ctx, contract))
    throw new ForbiddenException("CANNOT_DECIDE_AMENDMENT");
  const record = pending(ctx, contract, input.amendmentId);
  const note = text(input.note, 2000);
  if (input.choice === "REJECT") {
    if (!note) throw new BadRequestException("NOTE_REQUIRED");
    return close(ctx, record, "REJECTED", note);
  }
  if (input.choice !== "ACCEPT") throw new BadRequestException("INVALID_VOTE");
  // Milestones may have closed since the proposal; the schedule is checked again as it is now.
  const dueDates = new Map(record.dueDates.map((d) => [d.sequence, d.to]));
  checkSchedule(
    ctx,
    contract,
    record.endDate?.to ?? endDateOf(contract),
    dueDates,
  );
  for (const change of record.dueDates) {
    const m = ctx
      .milestonesOf(contract.contract_id)
      .find((row) => row.milestone_id === change.milestoneId)!;
    m.due_date = change.to;
    m.version += 1;
  }
  if (record.endDate) {
    contract.amendedEndDate = record.endDate.to;
    contract.version += 1;
  }
  const result = close(ctx, record, "ACCEPTED", note || null);
  // New due dates change lateness, so the engine evaluates the contract again.
  return { ...result, evaluate: record.dueDates.length > 0 };
}

export function withdrawAmendment(
  ctx: Ctx,
  input: { contractId: string; amendmentId: string },
): Outcome<Amendment> {
  const contract = ctx.contract(String(input?.contractId));
  if (!mayProposeAmendment(ctx, contract))
    throw new ForbiddenException("CANNOT_AMEND");
  return close(
    ctx,
    pending(ctx, contract, input.amendmentId),
    "WITHDRAWN",
    null,
  );
}

function pending(ctx: Ctx, contract: ContractRecord, id: string) {
  const record = amendmentsOf(ctx, contract.contract_id).find(
    (a) => a.id === id,
  );
  if (!record) throw new NotFoundException("AMENDMENT_NOT_FOUND");
  if (record.state !== "PROPOSED")
    throw new ConflictException("AMENDMENT_CLOSED");
  return record;
}

function close(
  ctx: Ctx,
  record: AmendmentRecord,
  state: AmendmentState,
  note: string | null,
): Outcome<Amendment> {
  Object.assign(record, {
    state,
    decidedBy: { id: ctx.actor.id, name: ctx.actor.displayName },
    decidedAt: businessNow(),
    decisionNote: note,
    version: record.version + 1,
    updatedAt: new Date().toISOString(),
  });
  return outcome(ctx, plain(record), { audit: [auditOf(record)] });
}

const auditOf = (record: AmendmentRecord) => ({
  category: "SYSTEM" as const,
  contractId: record.contractCode,
  milestoneId: null,
  detail: {
    kind: "AMENDMENT" as const,
    state: record.state,
    number: record.number,
  },
});

export const plain = (record: AmendmentRecord): Amendment => ({
  id: record.id,
  contractCode: record.contractCode,
  number: record.number,
  state: record.state,
  reason: record.reason,
  endDate: record.endDate,
  dueDates: record.dueDates,
  proposedBy: record.proposedBy,
  proposedAt: record.proposedAt,
  decidedBy: record.decidedBy,
  decidedAt: record.decidedAt,
  decisionNote: record.decisionNote,
  digest: record.digest,
});

export const amendmentList = (ctx: Ctx, code: string) =>
  amendmentsOf(ctx, code)
    .map(plain)
    .sort((a, b) => b.number - a.number);
