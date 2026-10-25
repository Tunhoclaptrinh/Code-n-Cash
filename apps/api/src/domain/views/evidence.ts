import { NotFoundException } from "@nestjs/common";
import type { Ctx } from "../context";
import { previewOf } from "../engine";
import {
  type AttachmentRecord,
  type EventRecord,
  type MilestoneRecord,
  TABLE,
} from "../records";
import type { EvidenceWorkspace } from "../types";
import { TERMINAL } from "../vocabulary";
import type { DryRun } from "./shared";
import { resolveTarget } from "./tasks";

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
