import type { Ctx } from "../context";
import { previewOf } from "../engine";
import type { EventRecord, MilestoneRecord } from "../records";
import type { ApprovalSlot, ApprovalView } from "../types";
import { isBusinessEvent, TERMINAL } from "../vocabulary";
import type { DryRun } from "./shared";
import { resolveTarget } from "./tasks";

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
