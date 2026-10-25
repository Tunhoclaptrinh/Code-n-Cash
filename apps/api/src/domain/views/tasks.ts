import { NotFoundException } from "@nestjs/common";
import type { Ctx } from "../context";
import { type ExceptionRecord, type MilestoneRecord, TABLE } from "../records";
import type { BusinessEventType, TaskRow } from "../types";
import { isBusinessEvent } from "../vocabulary";
import { routes } from "./shared";

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
