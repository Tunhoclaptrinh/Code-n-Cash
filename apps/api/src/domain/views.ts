import { NotFoundException } from "@nestjs/common";
import { recordHash, verifyChain } from "../common/audit-chain";
import type { RecordEntity } from "../common/types";
import { today, type Ctx } from "./context";
import { previewOf, runEngine, runTimeline } from "./engine";
import {
  dataPackSeal,
  TABLE,
  type AttachmentRecord,
  type EventRecord,
  type ExceptionRecord,
  type HistoryRecord,
  type MilestoneRecord,
  type NoteRecord,
  type PaymentRecord,
  type RuleRecord,
} from "./records";
import { addDays, shareOf, sumMillion } from "./templates";
import type {
  ActivityAction,
  ActivityCategory,
  ActivityEntry,
  ApprovalSlot,
  ApprovalView,
  BusinessEventType,
  ClassifiedEvent,
  ContractList,
  ContractOverview,
  DecisionFacts,
  DisputeView,
  EventClass,
  EventStatus,
  EventType,
  Evaluation,
  EvidenceWorkspace,
  ExceptionQueueRow,
  IntegrityReport,
  MilestoneDetail,
  Participant,
  RuleOutcome,
  StatusChange,
  TaskRow,
  TimelineEntry,
  TimelinePoint,
} from "./types";
import { INTERNAL_ROLES, isBusinessEvent, TERMINAL } from "./vocabulary";

/** Runs the engine on the live data plus hypothetical events and returns the new evaluations. */
export type DryRun = (
  events: EventRecord[],
) => Promise<Map<string, Evaluation>>;

export const routes = {
  submission: (c: string, n: number) => `/submissions/${c}/${n}`,
  approval: (c: string, n: number) => `/approvals/${c}/${n}`,
  decision: (c: string, n: number) =>
    `/contracts/${c}/milestones/${n}/decision`,
  dispute: (c: string, n: number) => `/contracts/${c}/milestones/${n}/dispute`,
  signing: (c: string) => `/contracts/${c}/signing`,
};

export function contractList(ctx: Ctx): ContractList {
  return {
    organizationName: INTERNAL_ROLES.includes(ctx.actor.role)
      ? ctx.actor.roleChipOrganization
      : ctx.partyName(ctx.actor.organizationId),
    contracts: ctx
      .visibleContracts()
      .map((c) => ctx.contractRow(c))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}

function participants(ctx: Ctx, contractId: string): Participant[] {
  const contract = ctx.contract(contractId);
  const person = (partyId: string, role?: string) =>
    ctx.personOf(partyId, role);
  const list: Participant[] = [];
  for (const [side, partyId] of [
    ["BUYER", contract.buyer_id],
    ["SUPPLIER", contract.supplier_id],
  ] as const) {
    list.push({
      side,
      kind: "ORGANIZATION",
      partyId,
      name: ctx.partyName(partyId),
      personName: null,
      role: null,
      approvalRole: null,
      email: null,
      origin: "DATA_PACK",
    });
  }
  for (const role of [
    "CONTRACT_OWNER",
    "FINANCE_APPROVER",
    "SECONDARY_APPROVER",
  ] as const) {
    const party = ctx.approverParty(contract.buyer_id, role);
    if (!party) continue;
    const user = person(party.party_id);
    list.push({
      side: "BUYER",
      kind: "APPROVER",
      partyId: party.party_id,
      name: party.party_name,
      personName: user ? String(user.displayName) : null,
      role: (user?.role as Participant["role"]) ?? null,
      approvalRole: role,
      email: user ? String(user.email) : null,
      origin: "DATA_PACK",
    });
  }
  const officer = person(contract.buyer_id, "LEGAL_REVIEWER");
  const representative = person(contract.supplier_id, "SUPPLIER");
  for (const [side, kind, user] of [
    ["BUYER", "OFFICER", officer],
    ["SUPPLIER", "REPRESENTATIVE", representative],
  ] as const)
    if (user)
      list.push({
        side,
        kind,
        partyId: String(user.partyId),
        name: ctx.partyName(String(user.organizationId)),
        personName: String(user.displayName),
        role: user.role as Participant["role"],
        approvalRole: null,
        email: String(user.email),
        origin: "SEED",
      });
  return list;
}

const historyOf = (
  ctx: Ctx,
  filter: (h: HistoryRecord) => boolean,
): StatusChange[] =>
  (ctx.t[TABLE.history] as HistoryRecord[])
    .filter(filter)
    .map(({ id, milestoneId, contractId, runId, at, from, to, trigger }) => ({
      id,
      milestoneId,
      contractId,
      runId,
      at,
      from,
      to,
      trigger,
    }))
    .sort((a, b) => a.at.localeCompare(b.at));

export function contractOverview(
  ctx: Ctx,
  contractId: string,
): ContractOverview {
  const contract = ctx.contract(contractId);
  const milestones = ctx
    .milestonesOf(contractId)
    .filter((m) => ctx.hasEvaluation(m.milestone_id));
  const rows = milestones.map((m) => ctx.milestoneRow(m));
  const events = ctx.events
    .filter((e) => e.contract_id === contractId)
    .map((e) => ctx.eventRow(e))
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  const history = historyOf(ctx, (h) => h.contractId === contractId);
  const timeline: TimelineEntry[] = [
    ...events.map((event) => ({ kind: "EVENT" as const, at: event.at, event })),
    ...history.map((change) => ({
      kind: "STATUS" as const,
      at: change.at,
      change,
    })),
  ];
  const steps = ctx.signingSteps(contractId);
  const signing = ctx.signing(contractId);
  const paying = rows.filter(
    (r) => r.decision === "RELEASE" || r.decision === "PENALTY",
  );
  return {
    contract: ctx.contractRow(contract),
    workflowTemplate:
      contract.workflow_template as ContractOverview["workflowTemplate"],
    ruleSetId: contract.rule_set_id,
    graceDays: Number(contract.grace_period_days),
    penaltyRatePct: contract.penalty_rate_pct_per_day,
    maxPenaltyPct: contract.max_penalty_pct,
    autoReleaseAllowed: contract.auto_release_allowed === "TRUE",
    milestones: rows,
    totals: {
      valueMillion: contract.contract_value_vnd_mn,
      eligibleMillion: sumMillion(paying.map((r) => r.payableMillion)),
      penaltyMillion: sumMillion(paying.map((r) => r.penaltyMillion)),
      paidMillion: sumMillion(
        rows.filter((r) => r.paid).map((r) => r.payableMillion),
      ),
      heldMillion: ctx.plannedOf(milestones, [
        "WAITING_EVIDENCE",
        "WAITING_APPROVAL",
        "ON_HOLD",
      ]),
      rejectedMillion: ctx.plannedOf(milestones, ["REJECTED"]),
    },
    participants: participants(ctx, contractId),
    events,
    timeline,
    signing:
      signing && steps.length
        ? {
            signed: steps.filter((s) => s.status === "SIGNED").length,
            total: steps.length,
            steps,
            origin: signing.origin,
          }
        : null,
  };
}

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

export function milestoneDetail(
  ctx: Ctx,
  contractId: string,
  sequence: number,
): MilestoneDetail {
  const m = ctx.milestoneAt(contractId, sequence);
  const contract = ctx.contract(contractId);
  const evaluation = ctx.evaluation(m.milestone_id);
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
  const approved = ctx
    .eventsOf(m.milestone_id)
    .some(
      (e) =>
        e.event_type === "APPROVAL" && e.actor_party_id === ctx.actor.partyId,
    );
  return {
    contract: ctx.contractRow(contract),
    milestone: ctx.milestoneRow(m),
    evaluation,
    rules: rules.map((r) => ({
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
      outcome: outcomeOf(Number(r.priority)),
    })),
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
      reject: open && !!role && contract.buyer_id === ctx.actor.organizationId,
      openDispute:
        open &&
        mine &&
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
        ctx.actor.role === "ADMIN_AUDITOR" && voidCandidates(ctx, m).length > 0,
    },
  };
}

export const toException = (x: ExceptionRecord) => ({
  id: x.id,
  milestoneId: x.milestoneId,
  contractId: x.contractId,
  eventId: x.eventId,
  action: x.action,
  reason: x.reason,
  proposedBy: x.proposedBy,
  proposedAt: x.proposedAt,
  status: x.status,
  decidedBy: x.decidedBy,
  decidedAt: x.decidedAt,
  decisionNote: x.decisionNote,
});

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

/* ------------------------------- tasks ------------------------------- */

export function taskInbox(ctx: Ctx): TaskRow[] {
  const tasks: TaskRow[] = [];
  const role = ctx.approvalRole();
  for (const contract of ctx.visibleContracts()) {
    const base = {
      contractId: contract.contract_id,
      contractTitle: contract.contract_title,
      origin: contract.origin,
    };
    if (contract.lifecycle === "SIGNING") {
      const current = ctx
        .signingSteps(contract.contract_id)
        .find((s) => s.status === "CURRENT");
      if (current?.signerUserId === ctx.actor.id)
        tasks.push({
          ...base,
          id: `sign:${contract.contract_id}`,
          kind: "SIGN_CONTRACT",
          milestoneId: null,
          sequence: null,
          milestoneType: null,
          dueDate: contract.start_date,
          overdueDays: 0,
          eventTypes: [],
          roles: [],
          amountMillion: contract.contract_value_vnd_mn,
          reasonCode: null,
          badge: "YOUR_TURN",
          href: routes.signing(contract.contract_id),
        });
      continue;
    }
    if (contract.lifecycle === "DRAFT") {
      if (
        ctx.actor.role === "LEGAL_REVIEWER" &&
        contract.buyer_id === ctx.actor.organizationId
      )
        tasks.push({
          ...base,
          id: `draft:${contract.contract_id}`,
          kind: "COMPLETE_DRAFT",
          milestoneId: null,
          sequence: null,
          milestoneType: null,
          dueDate: contract.start_date,
          overdueDays: 0,
          eventTypes: [],
          roles: [],
          amountMillion: contract.contract_value_vnd_mn,
          reasonCode: null,
          badge: "YOUR_TURN",
          href: `/contracts/new?draft=${encodeURIComponent(contract.contract_id)}`,
        });
      continue;
    }
    for (const m of ctx.milestonesOf(contract.contract_id)) {
      if (!ctx.hasEvaluation(m.milestone_id) || ctx.paid(m.milestone_id))
        continue;
      const evaluation = ctx.evaluation(m.milestone_id);
      const sequence = Number(m.milestone_sequence);
      const { overdueDays, pastGrace } = ctx.lateness(m);
      const row = (
        kind: TaskRow["kind"],
        extra: Partial<TaskRow>,
      ): TaskRow => ({
        ...base,
        id: `${kind}:${m.milestone_id}`,
        kind,
        milestoneId: m.milestone_id,
        sequence,
        milestoneType: m.milestone_type as TaskRow["milestoneType"],
        dueDate: m.due_date,
        overdueDays,
        eventTypes: [],
        roles: [],
        amountMillion: m.planned_payment_vnd_mn,
        reasonCode: evaluation.reasonCode,
        badge: "ON_TIME",
        href: routes.decision(contract.contract_id, sequence),
        ...extra,
      });
      const mineMissing = evaluation.missing.filter(
        (t): t is BusinessEventType => isBusinessEvent(t) && ctx.mayRecord(t),
      );
      switch (evaluation.reasonCode) {
        case "MISSING_REQUIRED_EVENT":
          if (mineMissing.length)
            tasks.push(
              row("SUBMIT_EVIDENCE", {
                eventTypes: mineMissing,
                badge:
                  pastGrace && m.late_penalty_applicable === "TRUE"
                    ? "LATE_PENALTY_RISK"
                    : "ON_TIME",
                href: routes.submission(contract.contract_id, sequence),
              }),
            );
          break;
        case "UNAUTHORIZED_EVENT":
          if (mineMissing.length)
            tasks.push(
              row("RESUBMIT_EVIDENCE", {
                eventTypes: mineMissing,
                badge: "MILESTONE_ON_HOLD",
                href: routes.submission(contract.contract_id, sequence),
              }),
            );
          if (ctx.actor.role === "ADMIN_AUDITOR")
            tasks.push(row("REVIEW_EXCEPTION", { badge: "MILESTONE_ON_HOLD" }));
          break;
        case "UNRESOLVED_CONDITION":
          if (ctx.actor.role === "ADMIN_AUDITOR")
            tasks.push(row("REVIEW_EXCEPTION", { badge: "MILESTONE_ON_HOLD" }));
          break;
        case "APPROVAL_QUORUM_NOT_MET": {
          const missingRoles = ctx.missingRoles(m);
          if (
            role &&
            missingRoles.includes(role) &&
            contract.buyer_id === ctx.actor.organizationId
          )
            tasks.push(
              row("APPROVE_PAYMENT", {
                roles: missingRoles,
                badge: "YOUR_TURN",
                href: routes.approval(contract.contract_id, sequence),
              }),
            );
          break;
        }
        case "OPEN_DISPUTE":
          if (
            ctx.actor.role === "CONTRACT_OWNER" &&
            contract.buyer_id === ctx.actor.organizationId
          )
            tasks.push(
              row("RESOLVE_DISPUTE", {
                badge: "MILESTONE_ON_HOLD",
                href: routes.dispute(contract.contract_id, sequence),
              }),
            );
          break;
      }
    }
  }
  if (ctx.actor.role === "ADMIN_AUDITOR")
    for (const request of ctx.t[TABLE.exceptions] as ExceptionRecord[]) {
      if (
        request.status !== "PROPOSED" ||
        request.proposedBy.userId === ctx.actor.id
      )
        continue;
      const m = ctx.milestone(request.milestoneId);
      const sequence = Number(m.milestone_sequence);
      tasks.push({
        id: `decide:${request.id}`,
        kind: "DECIDE_EXCEPTION",
        contractId: m.contract_id,
        contractTitle: ctx.contract(m.contract_id).contract_title,
        milestoneId: m.milestone_id,
        sequence,
        milestoneType: m.milestone_type as TaskRow["milestoneType"],
        dueDate: null,
        overdueDays: 0,
        eventTypes: [],
        roles: [],
        amountMillion: m.planned_payment_vnd_mn,
        reasonCode: ctx.evaluation(m.milestone_id).reasonCode,
        badge: "YOUR_TURN",
        href: routes.decision(m.contract_id, sequence),
        origin: "APP",
      });
    }
  const rank = {
    LATE_PENALTY_RISK: 0,
    YOUR_TURN: 1,
    MILESTONE_ON_HOLD: 2,
    ON_TIME: 3,
  };
  return tasks.sort(
    (a, b) =>
      rank[a.badge] - rank[b.badge] ||
      (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") ||
      a.id.localeCompare(b.id),
  );
}

/* --------------------------- work screens --------------------------- */

/** The task screens open on a given milestone, or on the actor's first task of that kind. */
export function resolveTarget(
  ctx: Ctx,
  kinds: TaskRow["kind"][],
  contractId?: string,
  sequence?: number,
): MilestoneRecord {
  if (contractId && sequence) return ctx.milestoneAt(contractId, sequence);
  const task = taskInbox(ctx).find(
    (t) => kinds.includes(t.kind) && t.milestoneId,
  );
  if (!task?.milestoneId) throw new NotFoundException("NO_OPEN_TASK");
  return ctx.milestone(task.milestoneId);
}

export async function evidenceWorkspace(
  ctx: Ctx,
  dryRun: DryRun,
  draftEvents: (ctx: Ctx, m: MilestoneRecord) => EventRecord[],
  contractId?: string,
  sequence?: number,
): Promise<EvidenceWorkspace> {
  const m = resolveTarget(
    ctx,
    ["SUBMIT_EVIDENCE", "RESUBMIT_EVIDENCE"],
    contractId,
    sequence,
  );
  const side = ctx.side();
  if (!side) throw new NotFoundException("NO_OPEN_TASK");
  const attachments = (ctx.t[TABLE.attachments] as AttachmentRecord[]).filter(
    (a) => a.milestoneId === m.milestone_id && a.side === side,
  );
  const events = ctx.eventsOf(m.milestone_id);
  const slots = ctx.requirements(m).map((req) => {
    const attachment = attachments.find((a) => a.eventType === req.eventType);
    return {
      eventType: req.eventType,
      side: req.side,
      state: req.state,
      mine: ctx.mayRecord(req.eventType),
      evidence: req.eventId
        ? ctx.eventRow(events.find((e) => e.event_id === req.eventId)!)
        : null,
      attachment: attachment ? toAttachment(attachment) : null,
    };
  });
  const pending = slots.filter((s) => s.mine && s.state !== "VALID");
  const contract = ctx.contract(m.contract_id);
  const canSubmit =
    contract.lifecycle === "ACTIVE" &&
    !TERMINAL.includes(ctx.status(m)) &&
    pending.length > 0 &&
    pending.every((s) => s.attachment);
  const hypothetical = draftEvents(ctx, m);
  const preview = hypothetical.length
    ? previewOf((await dryRun(hypothetical)).get(m.milestone_id))
    : null;
  return {
    contract: ctx.contractRow(contract),
    milestone: ctx.milestoneRow(m),
    side,
    slots,
    extras: attachments
      .filter((a) => a.eventType === "OTHER")
      .map(toAttachment),
    overdueDays: ctx.lateness(m).overdueDays,
    canSubmit,
    preview,
  };
}

const toAttachment = (a: AttachmentRecord) => ({
  id: a.id,
  eventType: a.eventType,
  fileName: a.fileName,
  sizeMb: a.sizeMb,
  addedBy: a.addedBy,
  addedAt: a.addedAt,
});

export async function approvalView(
  ctx: Ctx,
  dryRun: DryRun,
  approvalEvent: (ctx: Ctx, m: MilestoneRecord) => EventRecord | null,
  contractId?: string,
  sequence?: number,
): Promise<ApprovalView> {
  const m = resolveTarget(ctx, ["APPROVE_PAYMENT"], contractId, sequence);
  const contract = ctx.contract(m.contract_id);
  const evaluation = ctx.evaluation(m.milestone_id);
  const events = ctx.eventsOf(m.milestone_id);
  const slots: ApprovalSlot[] = ctx.approvalRoles(m).map((role) => {
    const party = ctx.approverParty(contract.buyer_id, role);
    const approval = events.find(
      (e) =>
        e.event_type === "APPROVAL" &&
        e.actor_party_id === party?.party_id &&
        evaluation.evidence.includes(e.event_id),
    );
    const rejection = events.find(
      (e) =>
        e.event_type === "REJECTION" && e.actor_party_id === party?.party_id,
    );
    const done = approval ?? rejection;
    return {
      role,
      required: true,
      partyId: party?.party_id ?? "",
      personName: party
        ? String(ctx.personOf(party.party_id)?.displayName ?? party.party_name)
        : role,
      state: approval ? "APPROVED" : rejection ? "REJECTED" : "PENDING",
      at: done?.event_timestamp ?? null,
      eventId: done?.event_id ?? null,
      isYou: !!party && party.party_id === ctx.actor.partyId,
    };
  });
  const role = ctx.approvalRole();
  const status = ctx.status(m);
  const blockedReason =
    contract.lifecycle !== "ACTIVE" || TERMINAL.includes(status)
      ? "MILESTONE_CLOSED"
      : !role || contract.buyer_id !== ctx.actor.organizationId
        ? "NOT_APPROVER"
        : m.approval_required !== "TRUE"
          ? "APPROVAL_NOT_REQUIRED"
          : !ctx.approvalRoles(m).includes(role)
            ? "NOT_REQUIRED_ROLE"
            : events.some(
                  (e) =>
                    e.event_type === "APPROVAL" &&
                    e.actor_party_id === ctx.actor.partyId,
                )
              ? "ALREADY_APPROVED"
              : null;
  const hypothetical = blockedReason ? null : approvalEvent(ctx, m);
  return {
    contract: ctx.contractRow(contract),
    milestone: ctx.milestoneRow(m),
    evaluation,
    slots,
    evidence: events
      .filter(
        (e) =>
          isBusinessEvent(e.event_type) &&
          evaluation.evidence.includes(e.event_id),
      )
      .map((e) => ctx.eventRow(e)),
    preview: hypothetical
      ? previewOf((await dryRun([hypothetical])).get(m.milestone_id))
      : null,
    canApprove: !blockedReason,
    canReject:
      contract.lifecycle === "ACTIVE" &&
      !TERMINAL.includes(status) &&
      !!role &&
      contract.buyer_id === ctx.actor.organizationId &&
      !events.some(
        (e) =>
          e.event_type === "REJECTION" &&
          e.actor_party_id === ctx.actor.partyId,
      ),
    blockedReason,
  };
}

export async function disputeView(
  ctx: Ctx,
  dryRun: DryRun,
  resolutions: (ctx: Ctx, m: MilestoneRecord) => EventRecord[],
  contractId: string,
  sequence: number,
): Promise<DisputeView> {
  const m = ctx.milestoneAt(contractId, sequence);
  const contract = ctx.contract(contractId);
  const evaluation = ctx.evaluation(m.milestone_id);
  const events = ctx.eventsOf(m.milestone_id);
  const disputes = events
    .filter((e) => e.event_type === "DISPUTE_OPENED")
    .map((opened) => {
      const resolution = events.find(
        (e) =>
          e.event_type === "DISPUTE_RESOLVED" &&
          e.reference_event_id === opened.event_id,
      );
      return {
        opened: ctx.eventRow(opened),
        resolution: resolution ? ctx.eventRow(resolution) : null,
        state: evaluation.openDisputeIds.includes(opened.event_id)
          ? ("OPEN" as const)
          : ("RESOLVED" as const),
      };
    });
  const status = ctx.status(m);
  const live = contract.lifecycle === "ACTIVE" && !TERMINAL.includes(status);
  const buyerSide =
    contract.buyer_id === ctx.actor.organizationId &&
    ["LEGAL_REVIEWER", "CONTRACT_OWNER"].includes(ctx.actor.role);
  const canResolve = live && buyerSide && evaluation.openDisputeIds.length > 0;
  const hypothetical = canResolve ? resolutions(ctx, m) : [];
  return {
    contract: ctx.contractRow(contract),
    milestone: ctx.milestoneRow(m),
    evaluation,
    disputes,
    preview: hypothetical.length
      ? previewOf((await dryRun(hypothetical)).get(m.milestone_id))
      : null,
    notes: (ctx.t[TABLE.notes] as NoteRecord[])
      .filter((n) => n.milestoneId === m.milestone_id)
      .map(({ id, milestoneId, kind, text, author, at }) => ({
        id,
        milestoneId,
        kind,
        text,
        author,
        at,
      })),
    canOpen:
      live &&
      (contract.buyer_id === ctx.actor.organizationId ||
        contract.supplier_id === ctx.actor.organizationId) &&
      ["SUPPLIER", "LEGAL_REVIEWER", "CONTRACT_OWNER"].includes(ctx.actor.role),
    canResolve,
  };
}

export function exceptionQueue(ctx: Ctx): ExceptionQueueRow[] {
  const rows: ExceptionQueueRow[] = [];
  for (const contract of ctx.visibleContracts()) {
    for (const m of ctx.milestonesOf(contract.contract_id)) {
      if (!ctx.hasEvaluation(m.milestone_id)) continue;
      const evaluation = ctx.evaluation(m.milestone_id);
      const requests = ctx.exceptionsOf(m.milestone_id);
      if (
        !requests.length &&
        !["UNAUTHORIZED_EVENT", "UNRESOLVED_CONDITION"].includes(
          evaluation.reasonCode,
        )
      )
        continue;
      rows.push({
        contract: ctx.contractRow(contract),
        milestone: ctx.milestoneRow(m),
        evaluation,
        candidates: voidCandidates(ctx, m).map((e) => ctx.eventRow(e)),
        requests: requests.map(toException),
      });
    }
  }
  return rows;
}

/* ------------------------------ activity ------------------------------ */

const categoryOf = (type: string): ActivityCategory =>
  type === "CONTRACT_SIGNED"
    ? "SIGN"
    : type === "APPROVAL" || type === "REJECTION"
      ? "APPROVAL"
      : type.startsWith("DISPUTE")
        ? "DISPUTE"
        : "EVIDENCE";

export function activity(ctx: Ctx): ActivityEntry[] {
  const visible = new Set(ctx.visibleContracts().map((c) => c.contract_id));
  const sequenceOf = new Map(
    ctx.milestones.map((m) => [m.milestone_id, Number(m.milestone_sequence)]),
  );
  const entries: ActivityEntry[] = [];
  for (const e of ctx.events) {
    if (!visible.has(e.contract_id)) continue;
    const party = ctx.party(e.actor_party_id);
    entries.push({
      id: e.event_id,
      at: e.event_timestamp,
      actor: {
        id: e.recordedByUserId ?? e.actor_party_id,
        displayName: e.recordedBy ?? party?.party_name ?? e.actor_party_id,
        role:
          party?.party_type === "APPROVER"
            ? (party.approval_role as ActivityEntry["actor"]["role"])
            : ((party?.party_type ??
                "SYSTEM") as ActivityEntry["actor"]["role"]),
      },
      category: categoryOf(e.event_type),
      action: {
        kind: "EVENT",
        eventType: e.event_type as EventType,
        status: e.event_status as EventStatus,
        eventId: e.event_id,
      },
      contractCode: e.contract_id,
      milestoneId: e.milestone_id,
      milestoneNo: sequenceOf.get(e.milestone_id) ?? null,
      origin: e.origin,
    });
  }
  for (const h of ctx.t[TABLE.history] as HistoryRecord[]) {
    if (!visible.has(h.contractId) || h.trigger.kind === "IMPORT") continue;
    entries.push({
      id: h.id,
      at: h.at.slice(0, 19),
      actor: { id: "system", displayName: null, role: "SYSTEM" },
      category: "SYSTEM",
      action: {
        kind: "DECISION",
        decision: h.to.decision,
        reasonCode: h.to.reasonCode,
        status: h.to.status,
        previous: h.from?.status ?? null,
        runId: h.runId,
      },
      contractCode: h.contractId,
      milestoneId: h.milestoneId,
      milestoneNo: sequenceOf.get(h.milestoneId) ?? null,
      origin: "APP",
    });
  }
  const users = new Map(ctx.users().map((u) => [u.id, u]));
  const auditEntries = (ctx.t.audit ?? []) as RecordEntity[];
  const detailed = new Set(
    auditEntries
      .filter((entry) => entry.detail)
      .map((entry) => entry.transactionId),
  );
  const primaryByTransaction = new Map(
    auditEntries
      .filter((entry) => entry.changes)
      .map((entry) => [entry.transactionId, entry]),
  );
  for (const entry of auditEntries) {
    const contractCode = String(entry.contractId ?? "");
    if (
      entry.resource !== "workflow" ||
      !visible.has(contractCode) ||
      (!entry.detail && detailed.has(entry.transactionId))
    )
      continue;
    const user = users.get(String(entry.actorId));
    entries.push({
      id: entry.id,
      at: String(
        entry.at ??
          new Date(
            Date.parse(String(entry.createdAt)) + 7 * 3_600_000,
          ).toISOString(),
      ).slice(0, 19),
      actor: {
        id: String(entry.actorId),
        displayName: String(
          entry.actorName ?? user?.displayName ?? entry.actorId,
        ),
        role:
          ((entry.actorRole ?? user?.role) as ActivityEntry["actor"]["role"]) ??
          "SYSTEM",
      },
      category: (entry.category as ActivityCategory) ?? "SYSTEM",
      action: (entry.detail as ActivityAction) ?? {
        kind: "WORKFLOW_ACTION",
        code: String(entry.action),
      },
      contractCode,
      milestoneId: (entry.milestoneId as string) ?? null,
      milestoneNo: entry.milestoneId
        ? (sequenceOf.get(String(entry.milestoneId)) ?? null)
        : null,
      origin: "APP",
      audit: (() => {
        const primary = primaryByTransaction.get(entry.transactionId) ?? entry;
        const changes = (primary.changes ?? []) as NonNullable<
          ActivityEntry["audit"]
        >["changes"];
        return {
          seq: Number(entry.seq),
          hash: String(entry.hash),
          transactionId: entry.transactionId as string,
          requestId: entry.requestId as string,
          outcome: entry.outcome as string,
          changes: changes?.filter((change) => {
            const row = ctx.t[change.resource]?.find(
              (item) => item.id === change.recordId,
            );
            const reference =
              row?.contract_id ??
              row?.contractCode ??
              row?.contractId ??
              change.fields.contract_id?.before ??
              change.fields.contractCode?.before;
            return (
              reference === contractCode ||
              change.recordId === contractCode ||
              change.recordId === `draft-${contractCode}`
            );
          }),
        };
      })(),
    });
  }
  return entries.sort(
    (a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id),
  );
}

export function activityRange(ctx: Ctx) {
  const visible = new Set(ctx.visibleContracts().map((c) => c.contract_id));
  const stamps = ctx.events
    .filter((e) => visible.has(e.contract_id))
    .map((e) => e.event_timestamp)
    .sort();
  const last = (stamps.at(-1) ?? today()).slice(0, 10);
  return {
    from: (stamps[0] ?? today()).slice(0, 10),
    to: last > today() ? last : today(),
  };
}

export const draftsOf = (ctx: Ctx) =>
  ctx.drafts().filter((d) => d.organizationId === ctx.actor.organizationId);

const factsOf = (e: Evaluation): DecisionFacts => ({
  decision: e.decision,
  reasonCode: e.reasonCode,
  ruleId: e.ruleId,
  payableMillion: e.payableMillion,
  penaltyMillion: e.penaltyMillion,
});

/**
 * Integrity check for controllers and auditors: the audit hash chain, each app event against the
 * hash sealed with it, and each stored decision against a fresh run of the engine on the same data.
 * Nothing is written.
 */
export async function integrityReport(
  ctx: Ctx,
  anchor?: { seq: number; hash: string },
): Promise<IntegrityReport> {
  const audit = ctx.t["audit"] ?? [];
  const sealed = new Map<string, string>();
  for (const entry of audit)
    for (const [id, hash] of Object.entries(
      (entry.eventHashes ?? {}) as Record<string, string>,
    ))
      sealed.set(id, hash);
  const byId = new Map(ctx.events.map((e) => [e.event_id, e]));
  const problems: IntegrityReport["evidence"]["problems"] = [];
  for (const [eventId, hash] of sealed) {
    const event = byId.get(eventId);
    if (!event || recordHash(event) !== hash)
      problems.push({
        eventId,
        contractId: event?.contract_id ?? null,
        problem: event ? "CHANGED" : "MISSING",
      });
  }
  const fresh = await runEngine(ctx.t);
  const stored = ctx.t[TABLE.evaluations] as Array<RecordEntity & Evaluation>;
  const mismatches: IntegrityReport["decisions"]["mismatches"] = [];
  for (const evaluation of stored) {
    const now = fresh.evaluations.get(evaluation.milestoneId);
    if (
      now &&
      JSON.stringify(factsOf(now)) === JSON.stringify(factsOf(evaluation))
    )
      continue;
    const m = ctx.milestones.find(
      (x) => x.milestone_id === evaluation.milestoneId,
    );
    mismatches.push({
      milestoneId: evaluation.milestoneId,
      contractId: evaluation.contractId,
      sequence: Number(m?.milestone_sequence ?? 0),
      frozen:
        ctx.paid(evaluation.milestoneId) || evaluation.status === "REJECTED",
      stored: factsOf(evaluation),
      fresh: now ? factsOf(now) : null,
    });
  }
  const imported = audit
    .filter((entry) => entry.action === "IMPORT_DATA_PACK" && entry.seal)
    .at(-1);
  const current = dataPackSeal(ctx.t);
  const seal = (imported?.seal ?? {}) as ReturnType<typeof dataPackSeal>;
  return {
    checkedAt: new Date().toISOString(),
    chain: verifyChain(audit, anchor),
    dataPack: imported
      ? {
          sealedAt: imported.createdAt,
          tables: Object.entries(seal).map(([name, sealed]) => ({
            name,
            sealedRows: sealed.rows,
            rows: current[name]?.rows ?? 0,
            ok: current[name]?.hash === sealed.hash,
          })),
        }
      : null,
    evidence: {
      sealed: sealed.size,
      unsealed: ctx.events.filter(
        (e) => e.origin === "APP" && !sealed.has(e.event_id),
      ).length,
      problems,
    },
    decisions: {
      checked: stored.length,
      matched: stored.length - mismatches.length,
      runId: fresh.runId,
      fingerprint: fresh.fingerprint,
      mismatches,
    },
  };
}
