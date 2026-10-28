import type { Ctx } from "../context";
import { runTimeline } from "../engine";
import {
  type EventRecord,
  type MilestoneRecord,
  type PaymentRecord,
  type RuleRecord,
  TABLE,
} from "../records";
import { addDays, shareOf } from "../templates";
import type {
  ClassifiedEvent,
  Evaluation,
  EventClass,
  MilestoneDetail,
  RuleOutcome,
  TimelinePoint,
} from "../types";
import { isBusinessEvent, TERMINAL } from "../vocabulary";
import { historyOf, toException } from "./shared";
import { variableLabels } from "../policy";

function classify(
  e: EventRecord,
  ev: Evaluation,
): { classification: EventClass; duplicateOf: string | null } {
  const id = e.event_id;
  const duplicate = ev.duplicates.find(([dup]) => dup === id);
  let classification: EventClass;
  if (ev.voided.includes(id)) classification = "VOIDED";
  else if (duplicate) classification = "DUPLICATE";
  else if (ev.unauthorized.includes(id)) classification = "UNAUTHORIZED";
  else if (ev.unrelated.includes(id)) classification = "UNRELATED";
  else if (e.event_type === "APPROVAL")
    classification = ev.evidence.includes(id)
      ? "APPROVAL"
      : "APPROVAL_NOT_COUNTED";
  else if (e.event_type === "REJECTION") classification = "REJECTION";
  else if (e.event_type === "DISPUTE_OPENED")
    classification = ev.openDisputeIds.includes(id)
      ? "OPEN_DISPUTE"
      : "CLOSED_DISPUTE";
  else if (e.event_type === "DISPUTE_RESOLVED") classification = "RESOLUTION";
  else if (ev.evidence.includes(id)) classification = "EVIDENCE";
  else if (e.event_status !== "CONFIRMED") classification = "WRONG_STATUS";
  else classification = "ADDITIONAL";
  return { classification, duplicateOf: duplicate?.[1] ?? null };
}

/** How the engine's decision on one milestone changed with each of its events (BR-16). */
export async function milestoneTimeline(
  ctx: Ctx,
  contractId: string,
  sequence: number,
): Promise<TimelinePoint[]> {
  const m = ctx.milestoneAt(contractId, sequence);
  const events = new Map(
    ctx.eventsOf(m.milestone_id).map((e) => [e.event_id, e]),
  );
  return (await runTimeline(ctx.t, m.milestone_id)).map((point) => ({
    at: point.at,
    events: point.eventIds
      .map((id) => events.get(id))
      .filter((e) => e !== undefined)
      .map((e) => ctx.eventRow(e)),
    decision: point.decision,
    reasonCode: point.reason_code,
    ruleId: point.rule_id,
    status: point.status,
    payableMillion: String(point.payable),
    penaltyMillion: String(point.penalty),
    daysLate: point.days_late,
    missing: point.missing,
    approvals: { valid: point.valid_approval_count, quorum: point.quorum },
    openDisputeIds: point.open_dispute_ids,
  }));
}

/**
 * The active rules of a milestone's rule scope in priority order, each with what it did in the latest
 * evaluation: the engine's own trail when stored, otherwise inferred from the winning rule's priority.
 */
export function ruleRows(
  ctx: Ctx,
  m: MilestoneRecord,
  evaluation: Evaluation,
): MilestoneDetail["rules"] {
  const rules = (ctx.t[TABLE.rules] as RuleRecord[])
    .filter(
      (r) => r.release_rule_code === m.release_rule_code && r.active === "TRUE",
    )
    .sort((a, b) => Number(a.priority) - Number(b.priority));
  const winner = rules.find((r) => r.rule_id === evaluation.ruleId);
  const structural =
    evaluation.reasonCode === "UNRESOLVED_CONDITION" &&
    evaluation.issues.length > 0;
  const outcomeOf = (priority: number): RuleOutcome =>
    !winner || structural
      ? priority === Number(winner?.priority)
        ? "MATCHED"
        : "NOT_EVALUATED"
      : priority < Number(winner.priority)
        ? "NOT_MATCHED"
        : priority === Number(winner.priority)
          ? "MATCHED"
          : "NOT_EVALUATED";
  return rules.map((r) => ({
    id: r.rule_id,
    priority: Number(r.priority),
    name: r.rule_name,
    group: r.rule_group,
    condition: r.condition_expression,
    decision: r.decision as Evaluation["decision"],
    reasonCode: r.reason_code as Evaluation["reasonCode"],
    payableFormula: r.payable_amount_formula,
    penaltyFormula: r.penalty_amount_formula,
    description: r.rule_description_vi,
    outcome: evaluation.ruleTrail?.[r.rule_id] ?? outcomeOf(Number(r.priority)),
  }));
}

export function milestoneDetail(
  ctx: Ctx,
  contractId: string,
  sequence: number,
): MilestoneDetail {
  const m = ctx.milestoneAt(contractId, sequence);
  const contract = ctx.contract(contractId);
  const evaluation = ctx.evaluation(m.milestone_id);
  const rules = ruleRows(ctx, m, evaluation);
  const deadline = addDays(m.due_date, Number(m.grace_period_days));
  const payment = (ctx.t[TABLE.payments] as PaymentRecord[]).find(
    (p) => p.milestoneId === m.milestone_id,
  );
  const status = ctx.status(m);
  const open = contract.lifecycle === "ACTIVE" && !TERMINAL.includes(status);
  const role = ctx.approvalRole();
  const mine =
    contract.buyer_id === ctx.actor.organizationId ||
    contract.supplier_id === ctx.actor.organizationId;
  // One vote per approver and kind, matching what castVote accepts (ALREADY_VOTED).
  const votedOwn = (type: "APPROVAL" | "REJECTION") =>
    ctx
      .eventsOf(m.milestone_id)
      .some(
        (e) => e.event_type === type && e.actor_party_id === ctx.actor.partyId,
      );
  const approved = votedOwn("APPROVAL");
  return {
    contract: ctx.contractRow(contract),
    milestone: ctx.milestoneRow(m),
    evaluation,
    rules,
    variables: Object.entries(evaluation.variables ?? {}).map(
      ([name, value]) => ({
        name,
        label: variableLabels.get(name) ?? { vi: name, en: name },
        value,
      }),
    ),
    events: ctx.eventsOf(m.milestone_id).map((e) => ({
      ...ctx.eventRow(e),
      ...classify(e, evaluation),
    })) as ClassifiedEvent[],
    money: {
      plannedMillion: m.planned_payment_vnd_mn,
      dueDate: m.due_date,
      graceDays: Number(m.grace_period_days),
      deadline,
      completedAt: evaluation.completedAt,
      daysLate: evaluation.daysLate,
      latePenalty: m.late_penalty_applicable === "TRUE",
      penaltyRatePct: m.penalty_rate_pct_per_day,
      maxPenaltyPct: m.max_penalty_pct,
      capMillion: shareOf(m.planned_payment_vnd_mn, m.max_penalty_pct),
      rawPenaltyMillion: evaluation.rawPenaltyMillion,
      penaltyMillion: evaluation.penaltyMillion,
      payableMillion: evaluation.payableMillion,
    },
    history: historyOf(ctx, (h) => h.milestoneId === m.milestone_id),
    payment: payment
      ? {
          id: payment.id,
          milestoneId: payment.milestoneId,
          contractId: payment.contractId,
          runId: payment.runId,
          decision: payment.decision,
          amountMillion: payment.amountMillion,
          transferredBy: payment.transferredBy,
          transferredAt: payment.transferredAt,
        }
      : null,
    exceptions: ctx.exceptionsOf(m.milestone_id).map(toException),
    actions: {
      submit:
        open &&
        evaluation.missing.some((t) => isBusinessEvent(t) && ctx.mayRecord(t)),
      approve:
        open &&
        !!role &&
        contract.buyer_id === ctx.actor.organizationId &&
        ctx.approvalRoles(m).includes(role) &&
        !approved,
      reject:
        open &&
        !!role &&
        contract.buyer_id === ctx.actor.organizationId &&
        !votedOwn("REJECTION"),
      openDispute:
        open &&
        mine &&
        evaluation.openDisputeIds.length === 0 &&
        ["SUPPLIER", "LEGAL_REVIEWER", "CONTRACT_OWNER"].includes(
          ctx.actor.role,
        ),
      resolveDispute:
        open &&
        evaluation.openDisputeIds.length > 0 &&
        contract.buyer_id === ctx.actor.organizationId &&
        ["LEGAL_REVIEWER", "CONTRACT_OWNER"].includes(ctx.actor.role),
      transfer:
        !payment &&
        status !== "REJECTED" &&
        (evaluation.decision === "RELEASE" ||
          evaluation.decision === "PENALTY") &&
        ctx.actor.role === "FINANCE_APPROVER" &&
        contract.buyer_id === ctx.actor.organizationId,
      proposeException:
        ctx.actor.role === "CONTRACT_OWNER" &&
        contract.buyer_id === ctx.actor.organizationId &&
        voidCandidates(ctx, m).length > 0,
      decideException:
        ctx.actor.role === "ADMIN_AUDITOR" &&
        contract.buyer_id === ctx.actor.organizationId,
    },
  };
}

/** BR-19: only unauthorised events and anomalies may be voided, and only once. */
export function voidCandidates(ctx: Ctx, m: MilestoneRecord): EventRecord[] {
  const evaluation = ctx.evaluation(m.milestone_id);
  const flagged = new Set([
    ...evaluation.unauthorized,
    ...evaluation.issues
      .map((issue) => /^([A-Z]{2}-?[A-Z]*\d+):/.exec(issue)?.[1])
      .filter((id): id is string => !!id),
  ]);
  const requested = new Set(
    ctx
      .exceptionsOf(m.milestone_id)
      .filter((x) => x.status !== "REJECTED")
      .map((x) => x.eventId),
  );
  return ctx
    .eventsOf(m.milestone_id)
    .filter(
      (e) =>
        flagged.has(e.event_id) &&
        !requested.has(e.event_id) &&
        !evaluation.voided.includes(e.event_id),
    );
}
