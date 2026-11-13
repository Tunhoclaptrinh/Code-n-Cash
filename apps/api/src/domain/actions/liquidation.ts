import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { canonical, sha256 } from "../../common/audit-chain";
import type { Ctx } from "../context";
import { businessNow } from "../factory";
import type { ContractRecord } from "../records";
import { sumMillion } from "../templates";
import type { AmendmentState, Liquidation } from "../types";
import { TERMINAL } from "../vocabulary";
import { openAmendment } from "./amendments";
import { type Outcome, outcome, text } from "./shared";

/**
 * Liquidation (thanh lý hợp đồng): the last step of a contract made in the app. When every
 * milestone is paid (transferred) or rejected, the buyer's contract officer or owner proposes the
 * liquidation record with the settled figures; the contract's supplier confirms or rejects it; the
 * proposer may withdraw it while it is open. Confirmed, the contract is CLOSED: no evidence,
 * approval, dispute, amendment or payment can be recorded any more. The organiser's contracts
 * stay as given (risk R08).
 */
const BUYER_EDITORS = ["LEGAL_REVIEWER", "CONTRACT_OWNER"];

const milestonesSettled = (ctx: Ctx, contract: ContractRecord) => {
  const milestones = ctx
    .milestonesOf(contract.contract_id)
    .filter((m) => ctx.hasEvaluation(m.milestone_id));
  return (
    milestones.length > 0 &&
    milestones.every((m) => TERMINAL.includes(ctx.status(m)))
  );
};

export const latestLiquidation = (contract: ContractRecord) =>
  contract.liquidations?.at(-1) ?? null;

const pendingLiquidation = (contract: ContractRecord) => {
  const latest = latestLiquidation(contract);
  return latest?.state === "PROPOSED" ? latest : null;
};

const liquidable = (contract: ContractRecord) =>
  contract.lifecycle === "ACTIVE" && contract.origin !== "DATA_PACK";

const isBuyerEditor = (ctx: Ctx, contract: ContractRecord) =>
  BUYER_EDITORS.includes(ctx.actor.role) &&
  contract.buyer_id === ctx.actor.organizationId;

const isSupplier = (ctx: Ctx, contract: ContractRecord) =>
  ctx.actor.role === "SUPPLIER" &&
  contract.supplier_id === ctx.actor.organizationId;

export const mayProposeLiquidation = (ctx: Ctx, contract: ContractRecord) =>
  liquidable(contract) &&
  isBuyerEditor(ctx, contract) &&
  milestonesSettled(ctx, contract) &&
  !pendingLiquidation(contract) &&
  !openAmendment(ctx, contract.contract_id);

export const mayDecideLiquidation = (ctx: Ctx, contract: ContractRecord) =>
  liquidable(contract) &&
  isSupplier(ctx, contract) &&
  !!pendingLiquidation(contract);

export const mayWithdrawLiquidation = (ctx: Ctx, contract: ContractRecord) =>
  liquidable(contract) &&
  isBuyerEditor(ctx, contract) &&
  !!pendingLiquidation(contract);

/** The settled figures: paid (net of penalties), penalties deducted, rejected amounts. */
function settledTotals(ctx: Ctx, contract: ContractRecord) {
  const milestones = ctx
    .milestonesOf(contract.contract_id)
    .filter((m) => ctx.hasEvaluation(m.milestone_id));
  const paid = milestones.filter((m) => ctx.status(m) === "COMPLETED");
  return {
    valueMillion: contract.contract_value_vnd_mn,
    paidMillion: sumMillion(
      paid.map((m) => ctx.evaluation(m.milestone_id).payableMillion),
    ),
    penaltyMillion: sumMillion(
      paid.map((m) => ctx.evaluation(m.milestone_id).penaltyMillion),
    ),
    rejectedMillion: ctx.plannedOf(milestones, ["REJECTED"]),
  };
}

export function proposeLiquidation(
  ctx: Ctx,
  input: { contractId: string; note?: string },
): Outcome<Liquidation> {
  const contract = ctx.contract(String(input?.contractId));
  if (contract.origin === "DATA_PACK")
    throw new ForbiddenException("DATA_PACK_LOCKED");
  if (contract.lifecycle === "CLOSED")
    throw new ConflictException("CONTRACT_CLOSED");
  if (contract.lifecycle !== "ACTIVE")
    throw new BadRequestException("CONTRACT_NOT_SIGNED");
  if (!isBuyerEditor(ctx, contract))
    throw new ForbiddenException("CANNOT_LIQUIDATE");
  if (!milestonesSettled(ctx, contract))
    throw new BadRequestException("MILESTONES_OPEN");
  if (openAmendment(ctx, contract.contract_id))
    throw new ConflictException("AMENDMENT_PENDING");
  if (pendingLiquidation(contract))
    throw new ConflictException("LIQUIDATION_PENDING");
  const note = text(input.note, 2000);
  const record = {
    contractCode: contract.contract_id,
    note,
    totals: settledTotals(ctx, contract),
  };
  const liquidation: Liquidation = {
    state: "PROPOSED",
    note,
    totals: record.totals,
    proposedBy: { id: ctx.actor.id, name: ctx.actor.displayName },
    proposedAt: businessNow(),
    decidedBy: null,
    decidedAt: null,
    decisionNote: null,
    digest: sha256(canonical(record)),
  };
  contract.liquidations = [...(contract.liquidations ?? []), liquidation];
  contract.version += 1;
  return outcome(ctx, liquidation, { audit: [auditOf(contract, "PROPOSED")] });
}

export function decideLiquidation(
  ctx: Ctx,
  input: { contractId: string; choice: "ACCEPT" | "REJECT"; note?: string },
): Outcome<Liquidation> {
  const contract = ctx.contract(String(input?.contractId));
  if (!isSupplier(ctx, contract))
    throw new ForbiddenException("CANNOT_DECIDE_LIQUIDATION");
  const record = pendingLiquidation(contract);
  if (!record || !liquidable(contract))
    throw new NotFoundException("LIQUIDATION_NOT_FOUND");
  const note = text(input.note, 2000);
  if (input.choice === "REJECT") {
    if (!note) throw new BadRequestException("NOTE_REQUIRED");
    return close(ctx, contract, record, "REJECTED", note);
  }
  if (input.choice !== "ACCEPT") throw new BadRequestException("INVALID_VOTE");
  // The figures must still be the ones proposed (nothing may have moved since).
  if (
    canonical(settledTotals(ctx, contract)) !== canonical(record.totals) ||
    !milestonesSettled(ctx, contract)
  )
    throw new ConflictException("LIQUIDATION_STALE");
  contract.lifecycle = "CLOSED";
  return close(ctx, contract, record, "ACCEPTED", note || null);
}

export function withdrawLiquidation(
  ctx: Ctx,
  input: { contractId: string },
): Outcome<Liquidation> {
  const contract = ctx.contract(String(input?.contractId));
  if (!isBuyerEditor(ctx, contract))
    throw new ForbiddenException("CANNOT_LIQUIDATE");
  const record = pendingLiquidation(contract);
  if (!record || !liquidable(contract))
    throw new NotFoundException("LIQUIDATION_NOT_FOUND");
  return close(ctx, contract, record, "WITHDRAWN", null);
}

function close(
  ctx: Ctx,
  contract: ContractRecord,
  record: Liquidation,
  state: AmendmentState,
  note: string | null,
): Outcome<Liquidation> {
  Object.assign(record, {
    state,
    decidedBy: { id: ctx.actor.id, name: ctx.actor.displayName },
    decidedAt: businessNow(),
    decisionNote: note,
  });
  contract.version += 1;
  return outcome(ctx, { ...record }, { audit: [auditOf(contract, state)] });
}

const auditOf = (contract: ContractRecord, state: AmendmentState) => ({
  category: "SYSTEM" as const,
  contractId: contract.contract_id,
  milestoneId: null,
  detail: { kind: "LIQUIDATION" as const, state },
});
