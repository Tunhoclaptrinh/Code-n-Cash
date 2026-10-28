import type { Ctx } from "../context";
import { businessNow } from "../factory";
import { fromCents, toCents } from "../templates";
import type { DashboardView, Decision } from "../types";

/** Days ahead in which an unfinished milestone counts as due soon. */
const DUE_SOON_DAYS = 14;
/** Confidence below this needs a person to look before paying (spec section 8). */
const LOW_CONFIDENCE = 0.8;

/**
 * Many-contract overview of what the signed-in user may see: contract and decision counts, money
 * by state and the milestones that need attention now. Every figure comes from stored evaluations;
 * nothing is decided here.
 */
export function dashboard(ctx: Ctx): DashboardView {
  const today = businessNow().slice(0, 10);
  const horizon = new Date(`${today}T00:00:00Z`);
  horizon.setUTCDate(horizon.getUTCDate() + DUE_SOON_DAYS);
  const soon = horizon.toISOString().slice(0, 10);
  const contracts = ctx.visibleContracts();
  const byStatus: Record<string, number> = {};
  const byDecision: Partial<Record<Decision, number>> = {};
  const amounts = { planned: 0n, payable: 0n, penalty: 0n, held: 0n, paid: 0n };
  const attention: DashboardView["attention"] = [];
  const rows: DashboardView["contracts"] = [];
  for (const contract of contracts) {
    const status = ctx.contractStatus(contract);
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    const row = {
      contractId: contract.contract_id,
      title: contract.contract_title,
      status,
      milestones: 0,
      held: 0,
      openDisputes: 0,
      payableMillion: "0.00",
    };
    let payable = 0n;
    for (const m of ctx.milestonesOf(contract.contract_id)) {
      if (!ctx.hasEvaluation(m.milestone_id)) continue;
      const e = ctx.evaluation(m.milestone_id);
      const paid = ctx.paid(m.milestone_id);
      row.milestones++;
      byDecision[e.decision] = (byDecision[e.decision] ?? 0) + 1;
      amounts.planned += toCents(m.planned_payment_vnd_mn);
      amounts.penalty += toCents(e.penaltyMillion);
      if (paid) amounts.paid += toCents(e.payableMillion);
      else if (e.decision === "RELEASE" || e.decision === "PENALTY")
        payable += toCents(e.payableMillion);
      else if (e.decision === "HOLD") {
        amounts.held += toCents(m.planned_payment_vnd_mn);
        row.held++;
      }
      if (e.openDisputeIds.length) row.openDisputes++;
      const ref = {
        contractId: contract.contract_id,
        sequence: Number(m.milestone_sequence),
      };
      if (e.openDisputeIds.length)
        attention.push({ ...ref, kind: "OPEN_DISPUTE" });
      if (
        !paid &&
        e.decision === "HOLD" &&
        e.completedAt === null &&
        m.due_date >= today &&
        m.due_date <= soon
      )
        attention.push({ ...ref, kind: "DUE_SOON", dueDate: m.due_date });
      if (!paid && e.warnings?.length)
        attention.push({ ...ref, kind: "SEQUENCE_WARNING" });
      if (
        !paid &&
        (e.decision === "RELEASE" || e.decision === "PENALTY") &&
        Number(e.confidence) < LOW_CONFIDENCE
      )
        attention.push({ ...ref, kind: "LOW_CONFIDENCE" });
    }
    amounts.payable += payable;
    row.payableMillion = fromCents(payable);
    rows.push(row);
  }
  return {
    generatedAt: new Date().toISOString(),
    contracts: rows
      .sort((a, b) => b.held - a.held || b.openDisputes - a.openDisputes)
      .slice(0, 10),
    contractCount: contracts.length,
    byStatus,
    byDecision,
    amounts: {
      plannedMillion: fromCents(amounts.planned),
      payableMillion: fromCents(amounts.payable),
      paidMillion: fromCents(amounts.paid),
      heldMillion: fromCents(amounts.held),
      penaltyMillion: fromCents(amounts.penalty),
    },
    attention: attention.slice(0, 50),
    attentionCount: attention.length,
  };
}
