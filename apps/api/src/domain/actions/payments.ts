import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import { gatewayChannel, type DeliveryResult } from "../../payment-gateway";
import type { Ctx } from "../context";
import { decisionHash } from "../engine";
import { businessNow, entity } from "../factory";
import { paysOut } from "../policy";
import {
  type HistoryRecord,
  type MilestoneRecord,
  type PaymentRecord,
  TABLE,
} from "../records";
import type { Evaluation, PaymentInstruction } from "../types";
import { type Outcome, outcome } from "./shared";

/**
 * The instruction a paying decision draws up by itself: the buyer pays the supplier the payable amount
 * of the latest decision, identified by that decision's sealed hash. Null when the decision pays nothing.
 */
export function paymentInstruction(
  ctx: Ctx,
  m: MilestoneRecord,
  evaluation: Evaluation,
): PaymentInstruction | null {
  if (!paysOut(evaluation.decision)) return null;
  const contract = ctx.contract(m.contract_id);
  return {
    decision: evaluation.decision,
    amountMillion: evaluation.payableMillion,
    penaltyMillion: evaluation.penaltyMillion,
    payer: { id: contract.buyer_id, name: ctx.partyName(contract.buyer_id) },
    payee: {
      id: contract.supplier_id,
      name: ctx.partyName(contract.supplier_id),
    },
    runId: evaluation.runId,
    decisionDigest: decisionHash(evaluation),
  };
}

/**
 * Finance approves the instruction of a paying decision: once per milestone and decision run, then
 * COMPLETED. The approved instruction is then sent to the payment gateway (payment-gateway.ts).
 */
export function transferToAccounting(
  ctx: Ctx,
  input: { contractId: string; sequence: number },
): Outcome<{ paymentId: string }> {
  const m = ctx.milestoneAt(input.contractId, Number(input.sequence));
  const contract = ctx.contract(m.contract_id);
  if (
    ctx.actor.role !== "FINANCE_APPROVER" ||
    contract.buyer_id !== ctx.actor.organizationId
  )
    throw new ForbiddenException("NOT_FINANCE_APPROVER");
  const evaluation = ctx.evaluation(m.milestone_id);
  if (evaluation.decision !== "RELEASE" && evaluation.decision !== "PENALTY")
    throw new BadRequestException("NOT_PAYABLE");
  const payments = ctx.t[TABLE.payments] as PaymentRecord[];
  const id = `PAY-${m.milestone_id}-${evaluation.runId}`;
  if (payments.some((p) => p.milestoneId === m.milestone_id))
    throw new ConflictException("ALREADY_TRANSFERRED");
  const at = businessNow();
  payments.push(
    entity(id, {
      milestoneId: m.milestone_id,
      contractId: m.contract_id,
      runId: evaluation.runId,
      decision: evaluation.decision,
      amountMillion: evaluation.payableMillion,
      transferredBy: ctx.actor.displayName,
      transferredAt: at,
      organizationId: contract.buyer_id,
      instruction: paymentInstruction(ctx, m, evaluation),
      delivery: {
        channel: gatewayChannel(),
        status: "PENDING",
        attempts: 0,
        lastAttemptAt: null,
        reference: null,
        error: null,
      },
    }) as PaymentRecord,
  );
  (ctx.t[TABLE.history] as HistoryRecord[]).push(
    entity(`${id}:history`, {
      milestoneId: m.milestone_id,
      contractId: m.contract_id,
      runId: evaluation.runId,
      at: new Date().toISOString(),
      from: {
        status: evaluation.status,
        decision: evaluation.decision,
        reasonCode: evaluation.reasonCode,
      },
      to: {
        status: "COMPLETED" as const,
        decision: evaluation.decision,
        reasonCode: evaluation.reasonCode,
      },
      trigger: {
        kind: "PAYMENT" as const,
        paymentId: id,
        actorName: ctx.actor.displayName,
      },
    }) as HistoryRecord,
  );
  return outcome(
    ctx,
    { paymentId: id },
    {
      milestoneId: m.milestone_id,
      audit: [
        {
          category: "SYSTEM",
          contractId: m.contract_id,
          milestoneId: m.milestone_id,
          detail: { kind: "PAYMENT", amountMillion: evaluation.payableMillion },
        },
      ],
    },
  );
}

/**
 * Records one attempt to send an approved instruction to the payment gateway. Only the buyer's finance
 * approver may, and an acknowledged instruction is never sent or changed again.
 */
export function recordPaymentDelivery(
  ctx: Ctx,
  input: { paymentId: string; result: DeliveryResult },
): Outcome {
  const payment = (ctx.t[TABLE.payments] as PaymentRecord[]).find(
    (p) => p.id === input.paymentId,
  );
  if (!payment) throw new BadRequestException("PAYMENT_NOT_FOUND");
  const contract = ctx.contract(payment.contractId);
  if (
    ctx.actor.role !== "FINANCE_APPROVER" ||
    contract.buyer_id !== ctx.actor.organizationId
  )
    throw new ForbiddenException("NOT_FINANCE_APPROVER");
  if (payment.delivery?.status === "ACKNOWLEDGED")
    throw new ConflictException("ALREADY_DELIVERED");
  const delivery = {
    channel: payment.delivery?.channel ?? gatewayChannel(),
    status: input.result.status,
    attempts: (payment.delivery?.attempts ?? 0) + 1,
    lastAttemptAt: new Date().toISOString(),
    reference: input.result.reference,
    error: input.result.error,
  };
  Object.assign(payment, { delivery, version: payment.version + 1 });
  return outcome(
    ctx,
    { paymentId: payment.id, delivery },
    {
      milestoneId: payment.milestoneId,
      audit: [
        {
          category: "SYSTEM",
          contractId: payment.contractId,
          milestoneId: payment.milestoneId,
          detail: {
            kind: "PAYMENT_DELIVERY",
            channel: delivery.channel,
            status: delivery.status,
            attempts: delivery.attempts,
            reference: delivery.reference,
            error: delivery.error,
          },
        },
      ],
    },
  );
}
