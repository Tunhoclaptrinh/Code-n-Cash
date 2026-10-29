import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { storedEvidenceSize } from "../../evidence-store";
import { createLocalProof } from "../../trust/crypto";
import type { Ctx } from "../context";
import { businessNow, entity, nextId } from "../factory";
import {
  type AttachmentRecord,
  type EventRecord,
  type MilestoneRecord,
  type SignedEvidence,
  TABLE,
} from "../records";
import type { BusinessEventType } from "../types";
import { isBusinessEvent } from "../vocabulary";
import { type Outcome, assertOpen, newEvent, outcome, text } from "./shared";

export function attachEvidence(
  ctx: Ctx,
  input: {
    contractId: string;
    sequence: number;
    eventType: string;
    fileName: string;
    /** SHA-256 of a file stored through POST /evidence-documents. */
    sha256: string;
    mediaType?: string;
  },
): Outcome {
  const m = ctx.milestoneAt(input.contractId, Number(input.sequence));
  assertOpen(ctx, m);
  const side = ctx.side();
  const fileName = text(input.fileName, 255);
  if (!side || !fileName) throw new BadRequestException("INVALID_FILE");
  // Only a file the API stored and hashed itself can back an event.
  const sizeBytes = storedEvidenceSize(String(input.sha256));
  if (sizeBytes === null)
    throw new BadRequestException("EVIDENCE_FILE_MISSING");
  const type = input.eventType;
  if (type !== "OTHER") {
    if (
      !isBusinessEvent(type) ||
      !m.required_event_types.split(";").includes(type)
    )
      throw new BadRequestException("NOT_A_REQUIRED_EVENT");
    if (!ctx.mayRecord(type))
      throw new ForbiddenException("NOT_YOUR_EVENT_TYPE");
  }
  const attachments = ctx.t[TABLE.attachments] as AttachmentRecord[];
  if (
    type !== "OTHER" &&
    attachments.some(
      (a) =>
        a.milestoneId === m.milestone_id &&
        a.side === side &&
        a.eventType === type,
    )
  )
    throw new ConflictException("EVIDENCE_ALREADY_ATTACHED");
  const record = entity(
    nextId(
      "ATT-",
      attachments.map((a) => a.id),
      5,
    ),
    {
      milestoneId: m.milestone_id,
      side,
      eventType: type as BusinessEventType | "OTHER",
      fileName,
      sizeMb: Math.max(0.1, Math.round((sizeBytes / 1024 / 1024) * 10) / 10),
      sha256: String(input.sha256),
      sizeBytes,
      mediaType: text(input.mediaType, 120) || "application/octet-stream",
      addedBy: ctx.actor.displayName,
      addedAt: businessNow(),
      organizationId: ctx.actor.organizationId,
    },
  ) as AttachmentRecord;
  attachments.push(record);
  return outcome(ctx, { id: record.id }, { milestoneId: m.milestone_id });
}

export function removeEvidence(
  ctx: Ctx,
  input: { contractId: string; sequence: number; attachmentId: string },
): Outcome {
  const m = ctx.milestoneAt(input.contractId, Number(input.sequence));
  const attachments = ctx.t[TABLE.attachments] as AttachmentRecord[];
  const index = attachments.findIndex(
    (a) =>
      a.id === input.attachmentId &&
      a.milestoneId === m.milestone_id &&
      a.side === ctx.side(),
  );
  if (index < 0) throw new NotFoundException("EVIDENCE_NOT_FOUND");
  attachments.splice(index, 1);
  return outcome(ctx, { removed: true }, { milestoneId: m.milestone_id });
}

/**
 * The submitter signs what the event will rest on: the document's hash, the milestone and the event type.
 * The key is the submitter's own (the same local Ed25519 key store as contract signing).
 */
function signedEvidence(
  ctx: Ctx,
  m: MilestoneRecord,
  attachment: AttachmentRecord,
): SignedEvidence | undefined {
  if (!attachment.sha256) return undefined;
  const document = {
    sha256: attachment.sha256,
    fileName: attachment.fileName,
    sizeBytes: Number(attachment.sizeBytes ?? 0),
    mediaType: String(attachment.mediaType ?? "application/octet-stream"),
    signedBy: ctx.actor.displayName,
    signedById: ctx.actor.id,
    signedAt: new Date().toISOString(),
  };
  return {
    ...document,
    proof: createLocalProof(`signer:${ctx.actor.id}`, {
      kind: "EVIDENCE_DOCUMENT",
      contractId: m.contract_id,
      milestoneId: m.milestone_id,
      eventType: attachment.eventType,
      ...document,
    }),
  };
}

/** Events the attached documents would become; also used for the dry-run preview. */
export function evidenceEvents(
  ctx: Ctx,
  m: MilestoneRecord,
  commit = false,
): EventRecord[] {
  const side = ctx.side();
  const attachments = (ctx.t[TABLE.attachments] as AttachmentRecord[]).filter(
    (a) => a.milestoneId === m.milestone_id && a.side === side,
  );
  const requirements = ctx.requirements(m);
  const extras = attachments
    .filter((a) => a.eventType === "OTHER")
    .map((a) => a.fileName);
  const actorParty =
    side === "SUPPLIER"
      ? ctx.contract(m.contract_id).supplier_id
      : ctx.contract(m.contract_id).buyer_id;
  const created: EventRecord[] = [];
  for (const req of requirements) {
    if (req.state === "VALID" || !ctx.mayRecord(req.eventType)) continue;
    const attachment = attachments.find((a) => a.eventType === req.eventType);
    if (!attachment) continue;
    const event = newEvent(ctx, m, req.eventType, "CONFIRMED", actorParty, {
      amount:
        req.eventType === "INVOICE" ? m.planned_payment_vnd_mn : undefined,
      fileName: attachment.fileName,
      document: commit ? signedEvidence(ctx, m, attachment) : undefined,
      note:
        extras.length && !created.length
          ? `Kèm theo: ${extras.join(", ")}`
          : undefined,
    });
    created.push(event);
  }
  if (!commit)
    for (const event of created)
      ctx.events.splice(ctx.events.indexOf(event), 1);
  return created;
}

export function submitEvidence(
  ctx: Ctx,
  input: { contractId: string; sequence: number },
): Outcome {
  const m = ctx.milestoneAt(input.contractId, Number(input.sequence));
  assertOpen(ctx, m);
  const side = ctx.side();
  const pending = ctx
    .requirements(m)
    .filter((r) => r.state !== "VALID" && ctx.mayRecord(r.eventType));
  if (!side || !pending.length)
    throw new BadRequestException("NOTHING_TO_SUBMIT");
  const attachments = ctx.t[TABLE.attachments] as AttachmentRecord[];
  const mine = attachments.filter(
    (a) => a.milestoneId === m.milestone_id && a.side === side,
  );
  if (!pending.every((r) => mine.some((a) => a.eventType === r.eventType)))
    throw new BadRequestException("EVIDENCE_INCOMPLETE");
  const events = evidenceEvents(ctx, m, true);
  for (const a of mine) attachments.splice(attachments.indexOf(a), 1);
  return outcome(
    ctx,
    { eventIds: events.map((e) => e.event_id) },
    {
      events,
      evaluate: true,
      milestoneId: m.milestone_id,
      trigger: {
        kind: "EVENTS",
        eventIds: events.map((e) => e.event_id),
        actorName: ctx.actor.displayName,
      },
    },
  );
}
