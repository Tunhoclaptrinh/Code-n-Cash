import type { Ctx } from "../context";
import { businessNow } from "../factory";
import {
  type EventRecord,
  type MilestoneRecord,
  type PaymentRecord,
  type RuleRecord,
  TABLE,
} from "../records";
import { addDays } from "../templates";
import type {
  ApprovalRole,
  BusinessEventType,
  MilestoneDetail,
  PendingItem,
  PendingKind,
  PendingState,
  PersonRef,
  ReasonCode,
  Role,
  Side,
  WaitingOn,
} from "../types";
import { AUTHORITY, TERMINAL } from "../vocabulary";

/**
 * Who answers for each condition of a milestone (spec 9.5, extra-docs/09 §3). The engine says which
 * rule holds the milestone; this view turns its facts into items a person can act on: the party, the
 * role, the accounts, how long it has waited and the deadline. It never changes a decision.
 */

/** The condition kind behind the reason of the winning rule. */
const BLOCKING_KIND: Record<ReasonCode, PendingKind> = {
  OPEN_DISPUTE: "DISPUTE",
  REJECTION_PRESENT: "REJECTION",
  UNAUTHORIZED_EVENT: "UNAUTHORIZED",
  MISSING_REQUIRED_EVENT: "EVIDENCE",
  APPROVAL_QUORUM_NOT_MET: "APPROVAL",
  UNRESOLVED_CONDITION: "DATA_ISSUE",
  LATE_COMPLETION: "PAYMENT",
  ALL_CONDITIONS_MET: "PAYMENT",
};

/** The reason a rule gives when this kind of condition holds the milestone. */
const REASON_OF: Record<PendingKind, ReasonCode[]> = {
  DISPUTE: ["OPEN_DISPUTE"],
  REJECTION: ["REJECTION_PRESENT"],
  UNAUTHORIZED: ["UNAUTHORIZED_EVENT"],
  EVIDENCE: ["MISSING_REQUIRED_EVENT"],
  APPROVAL: ["APPROVAL_QUORUM_NOT_MET"],
  DATA_ISSUE: ["UNRESOLVED_CONDITION"],
  PAYMENT: ["LATE_COMPLETION", "ALL_CONDITIONS_MET"],
};

/** Accounts that record evidence of a side (spec 17): suppliers, and the buyer's contract officer. */
const RECORDER: Record<Side, Role> = {
  SUPPLIER: "SUPPLIER",
  BUYER: "LEGAL_REVIEWER",
};

type Actions = MilestoneDetail["actions"];

const daysBetween = (from: string, to: string) =>
  Math.round(
    (Date.parse(to.slice(0, 10)) - Date.parse(from.slice(0, 10))) / 86_400_000,
  );

interface Base {
  key: string;
  kind: PendingKind;
  done: boolean;
  subject: BusinessEventType | ApprovalRole | null;
  side: Side;
  roles: Role[];
  doneEvent: EventRecord | null;
  doneAt: string | null;
  waitingSince: string | null;
  dueBy: string | null;
}

/** The conditions of a milestone without people or actions: cheap enough for every list row. */
function conditions(ctx: Ctx, m: MilestoneRecord): Base[] {
  const evaluation = ctx.evaluation(m.milestone_id);
  const events = ctx.eventsOf(m.milestone_id);
  const byId = new Map(events.map((e) => [e.event_id, e]));
  const items: Base[] = [];

  for (const id of evaluation.openDisputeIds) {
    const opened = byId.get(id);
    items.push({
      key: `DISPUTE:${id}`,
      kind: "DISPUTE",
      done: false,
      subject: null,
      side: "BUYER",
      roles: ["CONTRACT_OWNER", "LEGAL_REVIEWER"],
      doneEvent: null,
      doneAt: null,
      waitingSince: opened?.event_timestamp ?? null,
      dueBy: null,
    });
  }

  const rejections = events.filter(
    (e) =>
      e.event_type === "REJECTION" && evaluation.evidence.includes(e.event_id),
  );
  if (evaluation.validRejectionCount > 0)
    items.push({
      key: "REJECTION",
      kind: "REJECTION",
      done: false,
      subject: null,
      side: "BUYER",
      roles: ["CONTRACT_OWNER"],
      doneEvent: null,
      doneAt: null,
      waitingSince: rejections[0]?.event_timestamp ?? null,
      dueBy: null,
    });

  if (
    evaluation.reasonCode === "UNRESOLVED_CONDITION" ||
    evaluation.issues.length
  )
    items.push({
      key: "DATA_ISSUE",
      kind: "DATA_ISSUE",
      done: false,
      subject: null,
      side: "BUYER",
      roles: ["CONTRACT_OWNER", "LEGAL_REVIEWER"],
      doneEvent: null,
      doneAt: null,
      waitingSince: null,
      dueBy: null,
    });

  for (const requirement of ctx.requirements(m)) {
    const side = requirement.side;
    const event = requirement.eventId
      ? (byId.get(requirement.eventId) ?? null)
      : null;
    items.push({
      key: `EVENT:${requirement.eventType}`,
      kind: requirement.state === "UNAUTHORIZED" ? "UNAUTHORIZED" : "EVIDENCE",
      done: requirement.state === "VALID",
      subject: requirement.eventType,
      side,
      roles: [RECORDER[side]],
      doneEvent: requirement.state === "VALID" ? event : null,
      doneAt: requirement.state === "VALID" ? requirement.at : null,
      waitingSince:
        requirement.state === "UNAUTHORIZED" ? requirement.at : null,
      dueBy: m.due_date || null,
    });
  }

  if (m.approval_required === "TRUE") {
    const approvals = events.filter(
      (e) =>
        e.event_type === "APPROVAL" && evaluation.evidence.includes(e.event_id),
    );
    const quorumMet = evaluation.validApprovalCount >= evaluation.quorum;
    for (const role of ctx.approvalRoles(m)) {
      const vote = approvals.find(
        (e) => ctx.party(e.actor_party_id)?.approval_role === role,
      );
      // Once the quorum is met the remaining roles are no longer needed.
      if (!vote && quorumMet) continue;
      items.push({
        key: `APPROVAL:${role}`,
        kind: "APPROVAL",
        done: !!vote,
        subject: role,
        side: "BUYER",
        roles: [role],
        doneEvent: vote ?? null,
        doneAt: vote?.event_timestamp ?? null,
        // Approvers are waited for once the evidence is complete.
        waitingSince: vote ? null : evaluation.completedAt,
        dueBy: null,
      });
    }
  }

  if (evaluation.decision === "RELEASE" || evaluation.decision === "PENALTY") {
    const payment = (ctx.t[TABLE.payments] as PaymentRecord[]).find(
      (p) => p.milestoneId === m.milestone_id,
    );
    const lastVote = events
      .filter(
        (e) =>
          e.event_type === "APPROVAL" &&
          evaluation.evidence.includes(e.event_id),
      )
      .map((e) => e.event_timestamp)
      .sort()
      .pop();
    items.push({
      key: "PAYMENT",
      kind: "PAYMENT",
      done: !!payment,
      subject: null,
      side: "BUYER",
      roles: ["FINANCE_APPROVER"],
      doneEvent: null,
      doneAt: payment?.transferredAt ?? null,
      waitingSince: payment
        ? null
        : ([evaluation.completedAt, lastVote]
            .filter((x): x is string => !!x)
            .sort()
            .pop() ?? null),
      dueBy: null,
    });
  }
  return items;
}

function stateOf(item: Base, blocking: PendingKind): PendingState {
  if (item.done) return "DONE";
  if (item.kind === blocking) return "BLOCKING";
  // Evidence filed by the wrong party is missing evidence too.
  if (
    (blocking === "EVIDENCE" && item.kind === "UNAUTHORIZED") ||
    (blocking === "UNAUTHORIZED" && item.kind === "EVIDENCE")
  )
    return "BLOCKING";
  return "WAITING";
}

/** An account as screens name it: never its e-mail. */
export function personRef(ctx: Ctx, user: Record<string, unknown>): PersonRef {
  return {
    userId: String(user.id),
    name: String(user.displayName ?? user.id),
    title: user.title ? String(user.title) : null,
    organizationId: String(user.organizationId),
    isYou: user.id === ctx.actor.id,
  };
}

/** Active accounts of one organisation holding one of the roles. */
export function accountsOf(
  ctx: Ctx,
  organizationId: string,
  roles: Role[],
): PersonRef[] {
  return ctx
    .users()
    .filter(
      (u) =>
        u.active !== false &&
        u.organizationId === organizationId &&
        roles.includes(u.role as Role),
    )
    .map((u) => personRef(ctx, u));
}

/**
 * Who recorded an event: the app account, or the seed person of an approver party. Organiser
 * rows of a buyer or supplier name only the party, so no person is made up for them.
 */
export function recorderOf(ctx: Ctx, e: EventRecord): PersonRef | null {
  const userId = e.recordedByUserId;
  const user = userId
    ? ctx.user(userId)
    : ctx.party(e.actor_party_id)?.party_type === "APPROVER"
      ? ctx.personOf(e.actor_party_id)
      : undefined;
  return user ? personRef(ctx, user) : null;
}

/** The side a party acts for: approvers belong to the buyer. */
export function sideOfParty(ctx: Ctx, partyId: string): Side {
  return ctx.party(partyId)?.party_type === "SUPPLIER" ? "SUPPLIER" : "BUYER";
}

/** Compact list of who a milestone waits for; empty once it is paid or closed. */
export function waitingOn(ctx: Ctx, m: MilestoneRecord): WaitingOn[] {
  if (ctx.paid(m.milestone_id)) return [];
  const evaluation = ctx.evaluation(m.milestone_id);
  if (evaluation.status === "REJECTED") return [];
  const contract = ctx.contract(m.contract_id);
  const blocking = BLOCKING_KIND[evaluation.reasonCode];
  const groups = new Map<string, WaitingOn>();
  for (const item of conditions(ctx, m)) {
    if (stateOf(item, blocking) !== "BLOCKING") continue;
    const groupKey = `${item.side}:${item.roles.join(",")}`;
    const group = groups.get(groupKey) ?? {
      kind: item.kind,
      side: item.side,
      organizationName: ctx.partyName(
        item.side === "BUYER" ? contract.buyer_id : contract.supplier_id,
      ),
      roles: item.roles,
      subjects: [],
    };
    if (item.subject) group.subjects.push(item.subject);
    groups.set(groupKey, group);
  }
  return [...groups.values()];
}

/** Every condition of a milestone with who answers for it, blocking items first. */
export function pendingItems(
  ctx: Ctx,
  m: MilestoneRecord,
  actions: Actions,
): PendingItem[] {
  const contract = ctx.contract(m.contract_id);
  const evaluation = ctx.evaluation(m.milestone_id);
  const status = ctx.status(m);
  const open = contract.lifecycle === "ACTIVE" && !TERMINAL.includes(status);
  const blocking = BLOCKING_KIND[evaluation.reasonCode];
  const today = businessNow().slice(0, 10);
  const base = `/contracts/${contract.contract_id}/milestones/${m.milestone_sequence}`;

  const orgOf = (side: Side) => {
    const id = side === "BUYER" ? contract.buyer_id : contract.supplier_id;
    return { id, name: ctx.partyName(id) };
  };
  const accounts = (organizationId: string, roles: Role[]) =>
    accountsOf(ctx, organizationId, roles);
  const recorder = (e: EventRecord) => recorderOf(ctx, e);

  // Rules of the scope by the reason they give, to tell the user which rule each item feeds.
  const rules = (ctx.t[TABLE.rules] as RuleRecord[])
    .filter(
      (r) => r.release_rule_code === m.release_rule_code && r.active === "TRUE",
    )
    .sort((a, b) => Number(a.priority) - Number(b.priority));
  const ruleOf = (kind: PendingKind) => {
    const winner = rules.find((r) => r.rule_id === evaluation.ruleId);
    const rule =
      kind === "PAYMENT" &&
      winner &&
      REASON_OF.PAYMENT.includes(winner.reason_code as ReasonCode)
        ? winner
        : rules.find((r) =>
            REASON_OF[kind].includes(r.reason_code as ReasonCode),
          );
    return rule ? { id: rule.rule_id, priority: Number(rule.priority) } : null;
  };

  const actionOf = (item: Base): PendingItem["action"] => {
    if (item.done || !open) return null;
    switch (item.kind) {
      case "EVIDENCE":
      case "UNAUTHORIZED": {
        const type = item.subject as BusinessEventType;
        const mayFile =
          ctx.mayRecord(type) &&
          ctx.actor.organizationId === orgOf(AUTHORITY[type]).id;
        if (
          item.kind === "UNAUTHORIZED" &&
          !mayFile &&
          actions.proposeException
        )
          return {
            kind: "PROPOSE_EXCEPTION",
            href: `${base}/decision#exceptions`,
            mine: true,
          };
        return {
          kind: "SUBMIT",
          href: `/submissions/${contract.contract_id}/${m.milestone_sequence}?type=${type}`,
          mine: mayFile,
        };
      }
      case "APPROVAL":
        return {
          kind: "APPROVE",
          href: `/approvals/${contract.contract_id}/${m.milestone_sequence}`,
          mine: actions.approve && ctx.approvalRole() === item.subject,
        };
      case "DISPUTE":
        return {
          kind: "RESOLVE",
          href: `${base}/dispute`,
          mine: actions.resolveDispute,
        };
      case "PAYMENT":
        return {
          kind: "TRANSFER",
          href: `${base}/decision`,
          mine: actions.transfer,
        };
      case "DATA_ISSUE":
        return actions.proposeException
          ? {
              kind: "PROPOSE_EXCEPTION",
              href: `${base}/decision#exceptions`,
              mine: true,
            }
          : { kind: "CONTACT", href: `${base}/decision`, mine: false };
      case "REJECTION":
        return { kind: "CONTACT", href: `${base}/decision`, mine: false };
    }
  };

  const items = conditions(ctx, m).map((item): PendingItem => {
    const organization = orgOf(item.side);
    const state = stateOf(item, blocking);
    const waitingSince = item.done ? null : item.waitingSince;
    const doneBy = item.doneEvent ? recorder(item.doneEvent) : null;
    return {
      key: item.key,
      kind: item.kind,
      state,
      rule: ruleOf(item.kind),
      subject: item.subject,
      side: item.side,
      organization,
      roles: item.roles,
      people: accounts(organization.id, item.roles),
      done:
        item.done && item.doneAt
          ? {
              by: doneBy,
              byName:
                doneBy?.name ??
                item.doneEvent?.recordedBy ??
                (item.doneEvent
                  ? ctx.partyName(item.doneEvent.actor_party_id)
                  : organization.name),
              at: item.doneAt,
              eventId: item.doneEvent?.event_id ?? null,
            }
          : null,
      waitingSince,
      waitingDays: waitingSince
        ? Math.max(0, daysBetween(waitingSince, today))
        : null,
      dueBy: item.dueBy,
      graceUntil: item.dueBy
        ? addDays(item.dueBy, Number(m.grace_period_days))
        : null,
      // Same count as the evidence screen (Ctx.lateness): days past the due date.
      overdueDays:
        !item.done && item.dueBy
          ? Math.max(0, daysBetween(item.dueBy, today))
          : 0,
      action: actionOf(item),
    };
  });
  const rank: Record<PendingState, number> = {
    BLOCKING: 0,
    WAITING: 1,
    DONE: 2,
  };
  return items.sort(
    (a, b) =>
      rank[a.state] - rank[b.state] ||
      (a.rule?.priority ?? 999) - (b.rule?.priority ?? 999),
  );
}
