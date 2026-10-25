import type { Ctx } from "../context";
import { previewOf } from "../engine";
import {
  type EventRecord,
  type MilestoneRecord,
  type NoteRecord,
  TABLE,
} from "../records";
import type { DisputeView } from "../types";
import { TERMINAL } from "../vocabulary";
import type { DryRun } from "./shared";

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
      evaluation.openDisputeIds.length === 0 &&
      (contract.buyer_id === ctx.actor.organizationId ||
        contract.supplier_id === ctx.actor.organizationId) &&
      ["SUPPLIER", "LEGAL_REVIEWER", "CONTRACT_OWNER"].includes(ctx.actor.role),
    canResolve,
  };
}
