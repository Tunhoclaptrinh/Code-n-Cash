import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import type { Ctx } from "../context";
import { businessNow, entity } from "../factory";
import { type HistoryRecord, type PaymentRecord, TABLE } from "../records";
import { type Outcome, outcome } from "./shared";

/** Simulated payment order (Silver): once per milestone and decision run, then COMPLETED. */
export function transferToAccounting(
  ctx: Ctx,
  input: { contractId: string; sequence: number },
): Outcome {
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
