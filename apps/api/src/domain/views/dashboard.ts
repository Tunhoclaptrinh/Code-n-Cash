import type { Ctx } from "../context";
import { businessNow } from "../factory";
import { fromCents, toCents } from "../templates";
import type { DashboardView, Decision, ReasonCode } from "../types";

/** Days ahead in which an unfinished milestone counts as due soon. */
const DUE_SOON_DAYS = 14;
/** Confidence below this needs a person to look before paying (spec section 8). */
const LOW_CONFIDENCE = 0.8;
const DECISIONS: Decision[] = ["RELEASE", "PENALTY", "HOLD", "REJECT"];
/** Attention first by what blocks money now, then by what is about to. */
const ATTENTION_ORDER: Record<
  DashboardView["attention"][number]["kind"],
  number
> = {
  OPEN_DISPUTE: 0,
  OVERDUE: 1,
  DUE_SOON: 2,
  SEQUENCE_WARNING: 3,
  LOW_CONFIDENCE: 4,
};

const zeroByDecision = () =>
  Object.fromEntries(DECISIONS.map((d) => [d, 0n])) as Record<Decision, bigint>;

/**
 * Many-contract overview of what the signed-in user may see: contract and decision counts, money
 * by state and by due month, why money is held, and the milestones that need attention now.
 * Every figure comes from stored evaluations and payments; nothing is decided here. Amounts are
 * summed in cents (integers), never in floating point.
 */
export function dashboard(ctx: Ctx): DashboardView {
  const today = businessNow().slice(0, 10);
  const horizon = new Date(`${today}T00:00:00Z`);
  horizon.setUTCDate(horizon.getUTCDate() + DUE_SOON_DAYS);
  const soon = horizon.toISOString().slice(0, 10);
  const contracts = ctx.visibleContracts();
  const byStatus: Record<string, number> = {};
  const byDecision: Partial<Record<Decision, number>> = {};
  const amounts = {
    planned: 0n,
    payable: 0n,
    penalty: 0n,
    held: 0n,
    paid: 0n,
    rejected: 0n,
  };
  const counts = {
    total: 0,
    paid: 0,
    payable: 0,
    held: 0,
    rejected: 0,
    overdue: 0,
    dueSoon: 0,
  };
  const months = new Map<
    string,
    { amounts: Record<Decision, bigint>; paid: bigint }
  >();
  const reasons = new Map<ReasonCode, { milestones: number; amount: bigint }>();
  const attention: DashboardView["attention"] = [];
  const dueItems: DashboardView["dueItems"] = [];
  const rows: Array<
    DashboardView["contracts"][number] & { heldCents: bigint }
  > = [];
  for (const contract of contracts) {
    const status = ctx.contractStatus(contract);
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    const sums = { planned: 0n, paid: 0n, payable: 0n, held: 0n };
    const row = {
      contractId: contract.contract_id,
      title: contract.contract_title,
      status,
      milestones: 0,
      held: 0,
      openDisputes: 0,
      overdue: 0,
      plannedMillion: "0.00",
      paidMillion: "0.00",
      payableMillion: "0.00",
      heldMillion: "0.00",
      nextDue: null as string | null,
      heldCents: 0n,
    };
    for (const m of ctx.milestonesOf(contract.contract_id)) {
      if (!ctx.hasEvaluation(m.milestone_id)) continue;
      const e = ctx.evaluation(m.milestone_id);
      const paid = ctx.paid(m.milestone_id);
      const planned = toCents(m.planned_payment_vnd_mn);
      const released = e.decision === "RELEASE" || e.decision === "PENALTY";
      row.milestones++;
      counts.total++;
      byDecision[e.decision] = (byDecision[e.decision] ?? 0) + 1;
      amounts.planned += planned;
      sums.planned += planned;
      if (released) amounts.penalty += toCents(e.penaltyMillion);
      const month = m.due_date ? m.due_date.slice(0, 7) : "";
      if (month) {
        const bucket = months.get(month) ?? {
          amounts: zeroByDecision(),
          paid: 0n,
        };
        bucket.amounts[e.decision] += planned;
        if (paid) bucket.paid += toCents(e.payableMillion);
        months.set(month, bucket);
      }
      if (paid) {
        amounts.paid += toCents(e.payableMillion);
        sums.paid += toCents(e.payableMillion);
        counts.paid++;
      } else if (released) {
        amounts.payable += toCents(e.payableMillion);
        sums.payable += toCents(e.payableMillion);
        counts.payable++;
      } else if (e.decision === "HOLD") {
        amounts.held += planned;
        sums.held += planned;
        counts.held++;
        row.held++;
        const reason = reasons.get(e.reasonCode) ?? {
          milestones: 0,
          amount: 0n,
        };
        reason.milestones++;
        reason.amount += planned;
        reasons.set(e.reasonCode, reason);
      } else {
        amounts.rejected += planned;
        counts.rejected++;
      }
      if (e.openDisputeIds.length) row.openDisputes++;
      const ref = {
        contractId: contract.contract_id,
        sequence: Number(m.milestone_sequence),
        amountMillion: fromCents(planned),
      };
      const unfinished = !paid && e.decision === "HOLD" && !e.completedAt;
      if (m.due_date)
        dueItems.push({
          date: m.due_date,
          contractId: contract.contract_id,
          sequence: Number(m.milestone_sequence),
          state: paid
            ? "PAID"
            : released
              ? "PAYABLE"
              : e.decision === "REJECT"
                ? "REJECTED"
                : m.due_date < today && !e.completedAt
                  ? "OVERDUE"
                  : "HELD",
          amountMillion: fromCents(planned),
        });
      if (
        unfinished &&
        m.due_date &&
        (!row.nextDue || m.due_date < row.nextDue)
      )
        row.nextDue = m.due_date;
      if (e.openDisputeIds.length)
        attention.push({ ...ref, kind: "OPEN_DISPUTE" });
      if (unfinished && m.due_date && m.due_date < today) {
        counts.overdue++;
        row.overdue++;
        attention.push({ ...ref, kind: "OVERDUE", dueDate: m.due_date });
      } else if (unfinished && m.due_date >= today && m.due_date <= soon) {
        counts.dueSoon++;
        attention.push({ ...ref, kind: "DUE_SOON", dueDate: m.due_date });
      }
      if (!paid && e.warnings?.length)
        attention.push({ ...ref, kind: "SEQUENCE_WARNING" });
      if (!paid && released && Number(e.confidence) < LOW_CONFIDENCE)
        attention.push({ ...ref, kind: "LOW_CONFIDENCE" });
    }
    row.plannedMillion = fromCents(sums.planned);
    row.paidMillion = fromCents(sums.paid);
    row.payableMillion = fromCents(sums.payable);
    row.heldMillion = fromCents(sums.held);
    row.heldCents = sums.held;
    rows.push(row);
  }
  attention.sort(
    (a, b) =>
      ATTENTION_ORDER[a.kind] - ATTENTION_ORDER[b.kind] ||
      (a.dueDate ?? "").localeCompare(b.dueDate ?? "") ||
      a.contractId.localeCompare(b.contractId) ||
      a.sequence - b.sequence,
  );
  return {
    generatedAt: new Date().toISOString(),
    today,
    contracts: rows
      .sort(
        (a, b) =>
          (b.heldCents > a.heldCents
            ? 1
            : b.heldCents < a.heldCents
              ? -1
              : 0) ||
          b.openDisputes - a.openDisputes ||
          b.overdue - a.overdue ||
          a.contractId.localeCompare(b.contractId),
      )
      .slice(0, 10)
      .map(({ heldCents: _held, ...row }) => row),
    contractCount: contracts.length,
    byStatus,
    byDecision,
    amounts: {
      plannedMillion: fromCents(amounts.planned),
      payableMillion: fromCents(amounts.payable),
      paidMillion: fromCents(amounts.paid),
      heldMillion: fromCents(amounts.held),
      penaltyMillion: fromCents(amounts.penalty),
      rejectedMillion: fromCents(amounts.rejected),
    },
    milestones: counts,
    byMonth: [...months.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, bucket]) => ({
        month,
        amounts: Object.fromEntries(
          DECISIONS.map((d) => [d, fromCents(bucket.amounts[d])]),
        ) as Record<Decision, string>,
        paidMillion: fromCents(bucket.paid),
      })),
    holdReasons: [...reasons.entries()]
      .sort(([, a], [, b]) =>
        b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0,
      )
      .map(([reason, value]) => ({
        reason,
        milestones: value.milestones,
        amountMillion: fromCents(value.amount),
      })),
    attention: attention.slice(0, 50),
    dueItems: dueItems.sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.contractId.localeCompare(b.contractId) ||
        a.sequence - b.sequence,
    ),
    attentionCount: attention.length,
  };
}
