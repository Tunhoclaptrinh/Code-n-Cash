import { NotFoundException } from "@nestjs/common";
import type { Ctx } from "../context";
import { businessNow } from "../factory";
import {
  type ContractRecord,
  type ExceptionRecord,
  type MilestoneRecord,
  TABLE,
} from "../records";
import type {
  ApprovalRole,
  BusinessEventType,
  PendingActionKind,
  PendingItem,
  PersonRef,
  TaskGroup,
  TaskRow,
  TaskWaitingFor,
} from "../types";
import { milestoneActions } from "./milestones";
import { pendingItems, personRef } from "./responsibility";
import { routes } from "./shared";
import { mayDecideAmendment, openAmendment } from "../actions/amendments";

/** The task an action of the pending model asks for. */
const TASK_OF: Partial<Record<PendingActionKind, TaskRow["kind"]>> = {
  SUBMIT: "SUBMIT_EVIDENCE",
  APPROVE: "APPROVE_PAYMENT",
  RESOLVE: "RESOLVE_DISPUTE",
  PROPOSE_EXCEPTION: "REVIEW_EXCEPTION",
  TRANSFER: "TRANSFER_PAYMENT",
};

/** Roles that follow a contract through to payment and so see what it waits for. */
const FOLLOWERS: Record<string, "BUYER" | "SUPPLIER"> = {
  CONTRACT_OWNER: "BUYER",
  LEGAL_REVIEWER: "BUYER",
  SUPPLIER: "SUPPLIER",
};

const daysSince = (at: string) =>
  Math.max(
    0,
    Math.round(
      (Date.parse(businessNow().slice(0, 10)) - Date.parse(at.slice(0, 10))) /
        86_400_000,
    ),
  );

/** The blocking items of one party and role, as the row says who it waits for. */
function waitingFor(items: PendingItem[]): TaskWaitingFor | null {
  const [first] = items;
  if (!first) return null;
  const same = items.filter(
    (i) => i.side === first.side && i.roles.join() === first.roles.join(),
  );
  const people = new Map<string, PersonRef>();
  for (const item of same)
    for (const person of item.people) people.set(person.userId, person);
  return {
    kind: first.kind,
    subjects: same
      .map((i) => i.subject)
      .filter((x): x is BusinessEventType | ApprovalRole => !!x),
    organizationName: first.organization.name,
    roles: first.roles,
    people: [...people.values()],
  };
}

const longest = (items: PendingItem[]) =>
  items.reduce<number | null>(
    (max, i) =>
      i.waitingDays === null ? max : Math.max(max ?? 0, i.waitingDays),
    null,
  );

/** Whether the user follows this contract for its party (owner, contract officer, supplier). */
function follows(ctx: Ctx, contract: ContractRecord) {
  const side = FOLLOWERS[ctx.actor.role];
  return side === "BUYER"
    ? contract.buyer_id === ctx.actor.organizationId
    : side === "SUPPLIER" && contract.supplier_id === ctx.actor.organizationId;
}

export function taskInbox(ctx: Ctx): TaskRow[] {
  const tasks: TaskRow[] = [];
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
      if (current && current.signerUserId !== ctx.actor.id) {
        const signer = ctx.user(current.signerUserId);
        if (follows(ctx, contract))
          tasks.push({
            ...base,
            id: `follow:sign:${contract.contract_id}`,
            kind: "FOLLOW_UP",
            milestoneId: null,
            sequence: null,
            milestoneType: null,
            dueDate: contract.start_date,
            overdueDays: 0,
            eventTypes: [],
            roles: [],
            amountMillion: contract.contract_value_vnd_mn,
            reasonCode: null,
            badge: "ON_TIME",
            href: routes.signing(contract.contract_id),
            group: "WAITING",
            waitingFor: {
              kind: "SIGNATURE",
              subjects: [],
              organizationName: current.organizationName,
              roles: [],
              people: signer ? [personRef(ctx, signer)] : [],
            },
            waitingDays: null,
          });
      }
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
          group: "MINE",
          waitingFor: null,
          waitingDays: null,
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
          group: "MINE",
          waitingFor: null,
          waitingDays: null,
        });
      continue;
    }
    // An amendment of the schedule waits for the supplier's answer.
    const amendment = openAmendment(ctx, contract.contract_id);
    if (amendment && mayDecideAmendment(ctx, contract))
      tasks.push({
        ...base,
        id: `amendment:${amendment.id}`,
        kind: "REVIEW_AMENDMENT",
        milestoneId: null,
        sequence: null,
        milestoneType: null,
        dueDate: amendment.proposedAt.slice(0, 10),
        overdueDays: 0,
        eventTypes: [],
        roles: [],
        amountMillion: contract.contract_value_vnd_mn,
        reasonCode: null,
        badge: "YOUR_TURN",
        href: `/contracts/${contract.contract_id}?tab=amendments`,
        group: "MINE",
        waitingFor: null,
        waitingDays: null,
      });
    for (const m of ctx.milestonesOf(contract.contract_id)) {
      if (!ctx.hasEvaluation(m.milestone_id) || ctx.paid(m.milestone_id))
        continue;
      const evaluation = ctx.evaluation(m.milestone_id);
      // A rejected milestone is closed: what follows happens outside the system.
      if (evaluation.status === "REJECTED") continue;
      const sequence = Number(m.milestone_sequence);
      const { overdueDays, pastGrace } = ctx.lateness(m);
      const latePenalty = m.late_penalty_applicable === "TRUE";
      // Same items as the milestone's "what is left" block: the inbox never decides on its own.
      const open = pendingItems(ctx, m, milestoneActions(ctx, m)).filter(
        (i) => i.state !== "DONE",
      );
      const blocking = open.filter((i) => i.state === "BLOCKING");
      const row = (
        kind: TaskRow["kind"],
        group: TaskGroup,
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
        group,
        waitingFor: null,
        waitingDays: null,
        ...extra,
      });

      const byAction = new Map<PendingActionKind, PendingItem[]>();
      for (const item of open)
        if (item.action?.mine)
          byAction.set(item.action.kind, [
            ...(byAction.get(item.action.kind) ?? []),
            item,
          ]);
      let mineNow = false;
      for (const [action, items] of byAction) {
        const now = items.some((i) => i.state === "BLOCKING");
        // Exceptions and payment orders are only work once they hold the milestone.
        if (!now && (action === "PROPOSE_EXCEPTION" || action === "TRANSFER"))
          continue;
        let kind = TASK_OF[action];
        if (!kind) continue;
        if (
          kind === "SUBMIT_EVIDENCE" &&
          items.some((i) => i.kind === "UNAUTHORIZED")
        )
          kind = "RESUBMIT_EVIDENCE";
        mineNow ||= now;
        const evidence =
          kind === "SUBMIT_EVIDENCE" || kind === "RESUBMIT_EVIDENCE";
        tasks.push(
          row(kind, now ? "MINE" : "UPCOMING", {
            eventTypes: evidence
              ? items.map((i) => i.subject as BusinessEventType)
              : [],
            roles:
              kind === "APPROVE_PAYMENT"
                ? open
                    .filter((i) => i.kind === "APPROVAL")
                    .map((i) => i.subject as ApprovalRole)
                : [],
            badge:
              evidence && pastGrace && latePenalty
                ? "LATE_PENALTY_RISK"
                : !now
                  ? "ON_TIME"
                  : kind === "APPROVE_PAYMENT" || kind === "TRANSFER_PAYMENT"
                    ? "YOUR_TURN"
                    : kind === "SUBMIT_EVIDENCE"
                      ? "ON_TIME"
                      : "MILESTONE_ON_HOLD",
            href:
              items[0].action?.href ??
              routes.decision(contract.contract_id, sequence),
            // Later work says what has to happen first.
            waitingFor: now
              ? null
              : waitingFor(blocking.filter((i) => !i.action?.mine)),
            waitingDays: now ? longest(items) : null,
          }),
        );
      }
      // Nothing of mine holds it: the owner, the contract officer and the supplier still follow it.
      if (!mineNow && blocking.length && follows(ctx, contract)) {
        const others = blocking.filter((i) => !i.action?.mine);
        if (others.length)
          tasks.push({
            ...row("FOLLOW_UP", "WAITING", {
              waitingFor: waitingFor(others),
              waitingDays: longest(others),
              badge: overdueDays > 0 ? "MILESTONE_ON_HOLD" : "ON_TIME",
            }),
            id: `follow:${m.milestone_id}`,
          });
      }
    }
  }
  if (ctx.actor.role === "ADMIN_AUDITOR") {
    // Only proposals on contracts the controller's organisation buys.
    const own = new Set(
      ctx
        .visibleContracts()
        .filter((c) => c.buyer_id === ctx.actor.organizationId)
        .map((c) => c.contract_id),
    );
    for (const request of ctx.t[TABLE.exceptions] as ExceptionRecord[]) {
      if (
        request.status !== "PROPOSED" ||
        request.proposedBy.userId === ctx.actor.id ||
        !own.has(request.contractId)
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
        href: `${routes.decision(m.contract_id, sequence)}#exceptions`,
        origin: "APP",
        group: "MINE",
        waitingFor: null,
        waitingDays: daysSince(request.proposedAt),
      });
    }
  }
  const rank = {
    LATE_PENALTY_RISK: 0,
    YOUR_TURN: 1,
    MILESTONE_ON_HOLD: 2,
    ON_TIME: 3,
  };
  const groupRank: Record<TaskGroup, number> = {
    MINE: 0,
    UPCOMING: 1,
    WAITING: 2,
  };
  return tasks.sort(
    (a, b) =>
      groupRank[a.group] - groupRank[b.group] ||
      rank[a.badge] - rank[b.badge] ||
      // Work that holds a milestone comes before sending money already decided.
      Number(a.kind === "TRANSFER_PAYMENT") -
        Number(b.kind === "TRANSFER_PAYMENT") ||
      (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") ||
      a.id.localeCompare(b.id),
  );
}

/**
 * Whether a task goes to the bell and the menu badge: the user's turn on something still held.
 * A payment order of a decided milestone is a queue finance works through from the inbox.
 */
export const notifies = (task: TaskRow) =>
  task.group === "MINE" && task.kind !== "TRANSFER_PAYMENT";

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
