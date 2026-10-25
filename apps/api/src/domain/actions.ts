import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import type { Ctx } from "./context";
import { businessNow, entity, eventRecord, nextId } from "./factory";
import {
  TABLE,
  type AttachmentRecord,
  type EventRecord,
  type ExceptionRecord,
  type HistoryRecord,
  type MilestoneRecord,
  type NoteRecord,
  type PaymentRecord,
} from "./records";
import type {
  ActivityAction,
  ActivityCategory,
  BusinessEventType,
  EventStatus,
  EventType,
  Trigger,
} from "./types";
import { voidCandidates } from "./views";
import { TERMINAL, isBusinessEvent } from "./vocabulary";

/** What an action changed, so the service knows whether to re-evaluate and what to log. */
export interface Outcome<T = unknown> {
  result: T;
  events: EventRecord[];
  /** Re-run the engine after the change (new events, exception decisions, new milestones). */
  evaluate: boolean;
  trigger: Trigger;
  milestoneId: string | null;
  audit: Array<{
    category: ActivityCategory;
    contractId: string;
    milestoneId: string | null;
    detail: ActivityAction;
  }>;
}

export const outcome = <T>(
  ctx: Ctx,
  result: T,
  part: Partial<Outcome<T>> = {},
): Outcome<T> => ({
  result,
  events: [],
  evaluate: false,
  trigger: { kind: "CONTRACT", actorName: ctx.actor.displayName },
  milestoneId: null,
  audit: [],
  ...part,
});

const DOCUMENT_PREFIX: Record<EventType, string> = {
  CONTRACT_SIGNED: "CTR",
  KICKOFF_CONFIRMED: "KO",
  REQUIREMENTS_APPROVED: "REQ",
  UAT_PASSED: "UAT",
  ACCEPTANCE: "ACC",
  DELIVERY: "DN",
  INVOICE: "INV",
  GO_LIVE: "GL",
  SERVICE_ACTIVATED: "ACT",
  SERVICE_COMPLETED: "SVC",
  WARRANTY_COMPLETED: "WAR",
  APPROVAL: "APR",
  REJECTION: "REJ",
  DISPUTE_OPENED: "DSP",
  DISPUTE_RESOLVED: "DSR",
};

const text = (value: unknown, max = 1000) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

/** A new event recorded by the signed-in user, in the Data Pack schema (origin APP). */
export function newEvent(
  ctx: Ctx,
  m: MilestoneRecord,
  type: EventType,
  status: EventStatus,
  actorPartyId: string,
  opts: {
    note?: string;
    amount?: string;
    reference?: string;
    fileName?: string | null;
    at?: string;
  } = {},
): EventRecord {
  const actor = ctx.party(actorPartyId);
  if (!actor) throw new BadRequestException("UNKNOWN_PARTY");
  const id = nextId(
    "AP-EV",
    ctx.events.map((e) => e.event_id),
  );
  const sequence =
    Math.max(
      0,
      ...ctx.events
        .filter((e) => e.contract_id === m.contract_id)
        .map((e) => Number(e.contract_event_sequence) || 0),
    ) + 1;
  const record = eventRecord({
    id,
    milestone: m,
    type,
    status,
    actor,
    at: opts.at ?? businessNow(),
    sequence,
    documentId: `${DOCUMENT_PREFIX[type]}-${m.contract_id}-${String(m.milestone_sequence).padStart(2, "0")}-${id.slice(-4)}`,
    amount: opts.amount,
    referenceEventId: opts.reference,
    note: opts.note || "Recorded in CodeCash.",
    origin: "APP",
    recordedBy: ctx.actor.displayName,
    recordedByUserId: ctx.actor.id,
    fileName: opts.fileName ?? null,
  });
  ctx.events.push(record);
  return record;
}

/** Events may only be added to a signed contract and a milestone that is not final (spec 9.4). */
function assertOpen(ctx: Ctx, m: MilestoneRecord) {
  const contract = ctx.contract(m.contract_id);
  if (contract.lifecycle !== "ACTIVE")
    throw new BadRequestException("CONTRACT_NOT_SIGNED");
  if (TERMINAL.includes(ctx.status(m)))
    throw new BadRequestException("MILESTONE_CLOSED");
  return contract;
}

/* ------------------------------ evidence ------------------------------ */

export function attachEvidence(
  ctx: Ctx,
  input: {
    contractId: string;
    sequence: number;
    eventType: string;
    fileName: string;
    sizeMb: number;
  },
): Outcome {
  const m = ctx.milestoneAt(input.contractId, Number(input.sequence));
  assertOpen(ctx, m);
  const side = ctx.side();
  const fileName = text(input.fileName, 255);
  const sizeMb = Number(input.sizeMb);
  if (!side || !fileName || !(sizeMb >= 0 && sizeMb <= 20))
    throw new BadRequestException("INVALID_FILE");
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
      sizeMb: Math.round(sizeMb * 10) / 10,
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

/* ------------------------------ approvals ------------------------------ */

/** The APPROVAL the signed-in approver would record; null when they may not approve. */
export function approvalEvent(
  ctx: Ctx,
  m: MilestoneRecord,
  commit = false,
  note?: string,
): EventRecord | null {
  const role = ctx.approvalRole();
  if (!role || !ctx.actor.partyId) return null;
  const event = newEvent(ctx, m, "APPROVAL", "APPROVED", ctx.actor.partyId, {
    amount: m.planned_payment_vnd_mn,
    note: note || "Payment approval recorded.",
  });
  if (!commit) ctx.events.splice(ctx.events.indexOf(event), 1);
  return event;
}

export function castVote(
  ctx: Ctx,
  input: {
    contractId: string;
    sequence: number;
    choice: string;
    note?: string;
  },
): Outcome {
  const m = ctx.milestoneAt(input.contractId, Number(input.sequence));
  const contract = assertOpen(ctx, m);
  const role = ctx.approvalRole();
  if (
    !role ||
    !ctx.actor.partyId ||
    contract.buyer_id !== ctx.actor.organizationId
  )
    throw new ForbiddenException("NOT_AN_APPROVER");
  const note = text(input.note);
  const events = ctx.eventsOf(m.milestone_id);
  if (input.choice === "APPROVE") {
    if (m.approval_required !== "TRUE")
      throw new BadRequestException("APPROVAL_NOT_REQUIRED");
    if (!ctx.approvalRoles(m).includes(role))
      throw new ForbiddenException("NOT_A_REQUIRED_APPROVER");
    if (
      events.some(
        (e) =>
          e.event_type === "APPROVAL" && e.actor_party_id === ctx.actor.partyId,
      )
    )
      throw new ConflictException("ALREADY_VOTED");
    const event = approvalEvent(ctx, m, true, note)!;
    return eventOutcome(ctx, m, [event]);
  }
  if (!note) throw new BadRequestException("NOTE_REQUIRED");
  if (input.choice === "REJECT") {
    if (
      events.some(
        (e) =>
          e.event_type === "REJECTION" &&
          e.actor_party_id === ctx.actor.partyId,
      )
    )
      throw new ConflictException("ALREADY_VOTED");
    const event = newEvent(ctx, m, "REJECTION", "REJECTED", ctx.actor.partyId, {
      amount: m.planned_payment_vnd_mn,
      note,
    });
    return eventOutcome(ctx, m, [event]);
  }
  if (input.choice === "REQUEST_INFO") return requestInfo(ctx, m, note);
  throw new BadRequestException("INVALID_VOTE");
}

function requestInfo(ctx: Ctx, m: MilestoneRecord, note: string): Outcome {
  const notes = ctx.t[TABLE.notes] as NoteRecord[];
  notes.push(
    entity(
      nextId(
        "NOTE-",
        notes.map((n) => n.id),
        5,
      ),
      {
        milestoneId: m.milestone_id,
        kind: "REQUEST_INFO" as const,
        text: note,
        author: ctx.actor.displayName,
        at: businessNow(),
        organizationId: ctx.actor.organizationId,
      },
    ) as NoteRecord,
  );
  return outcome(
    ctx,
    { noted: true },
    {
      milestoneId: m.milestone_id,
      audit: [
        {
          category: "SYSTEM",
          contractId: m.contract_id,
          milestoneId: m.milestone_id,
          detail: { kind: "REQUEST_INFO", text: note },
        },
      ],
    },
  );
}

const eventOutcome = (ctx: Ctx, m: MilestoneRecord, events: EventRecord[]) =>
  outcome(
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

/* ------------------------------ disputes ------------------------------ */

/** Party recorded on dispute events: the supplier or buyer itself, or the owner approver (spec 4.2). */
function disputeParty(ctx: Ctx, m: MilestoneRecord) {
  const contract = ctx.contract(m.contract_id);
  if (
    ctx.actor.role === "SUPPLIER" &&
    contract.supplier_id === ctx.actor.organizationId
  )
    return contract.supplier_id;
  if (
    ctx.actor.role === "LEGAL_REVIEWER" &&
    contract.buyer_id === ctx.actor.organizationId
  )
    return contract.buyer_id;
  if (
    ctx.actor.role === "CONTRACT_OWNER" &&
    contract.buyer_id === ctx.actor.organizationId &&
    ctx.actor.partyId
  )
    return ctx.actor.partyId;
  return null;
}

export function openDispute(
  ctx: Ctx,
  input: { contractId: string; sequence: number; note: string },
): Outcome {
  const m = ctx.milestoneAt(input.contractId, Number(input.sequence));
  assertOpen(ctx, m);
  const party = disputeParty(ctx, m);
  if (!party) throw new ForbiddenException("CANNOT_OPEN_DISPUTE");
  // One open dispute already holds the milestone; further concerns go into that dispute.
  if (ctx.evaluation(m.milestone_id).openDisputeIds.length)
    throw new BadRequestException("DISPUTE_ALREADY_OPEN");
  const note = text(input.note);
  if (!note) throw new BadRequestException("NOTE_REQUIRED");
  return eventOutcome(ctx, m, [
    newEvent(ctx, m, "DISPUTE_OPENED", "OPEN", party, { note }),
  ]);
}

/** DISPUTE_RESOLVED for every open dispute, referencing it (BR-08); also used for the preview. */
export function resolutionEvents(
  ctx: Ctx,
  m: MilestoneRecord,
  commit = false,
  note?: string,
): EventRecord[] {
  const party = disputeParty(ctx, m);
  if (!party || ctx.actor.role === "SUPPLIER") return [];
  const created = ctx.evaluation(m.milestone_id).openDisputeIds.map((id) =>
    newEvent(ctx, m, "DISPUTE_RESOLVED", "RESOLVED", party, {
      reference: id,
      note: note || "Dispute resolved and workflow reopened.",
    }),
  );
  if (!commit)
    for (const event of created)
      ctx.events.splice(ctx.events.indexOf(event), 1);
  return created;
}

export function resolveDispute(
  ctx: Ctx,
  input: { contractId: string; sequence: number; option: string; note: string },
): Outcome {
  const m = ctx.milestoneAt(input.contractId, Number(input.sequence));
  assertOpen(ctx, m);
  const note = text(input.note);
  if (!note) throw new BadRequestException("NOTE_REQUIRED");
  if (
    !["LEGAL_REVIEWER", "CONTRACT_OWNER"].includes(ctx.actor.role) ||
    !disputeParty(ctx, m)
  )
    throw new ForbiddenException("CANNOT_RESOLVE_DISPUTE");
  if (!ctx.evaluation(m.milestone_id).openDisputeIds.length)
    throw new BadRequestException("DISPUTE_NOT_OPEN");
  if (input.option === "REQUEST_INFO") return requestInfo(ctx, m, note);
  if (input.option !== "RESOLVE")
    throw new BadRequestException("INVALID_RESOLUTION");
  return eventOutcome(ctx, m, resolutionEvents(ctx, m, true, note));
}

/* ------------------------- payment and exceptions ------------------------- */

/** Simulated payment order (Silver): once per milestone and decision run, then COMPLETED. */
export function transferToAccounting(
  ctx: Ctx,
  input: { contractId: string; sequence: number },
): Outcome {
  const m = ctx.milestoneAt(input.contractId, Number(input.sequence));
  const contract = ctx.contract(m.contract_id);
  if (
    ctx.actor.role !== "FINANCE_APPROVER" ||
    contract.buyer_id !== ctx.actor.organizationId
  )
    throw new ForbiddenException("NOT_FINANCE_APPROVER");
  const evaluation = ctx.evaluation(m.milestone_id);
  if (evaluation.decision !== "RELEASE" && evaluation.decision !== "PENALTY")
    throw new BadRequestException("NOT_PAYABLE");
  const payments = ctx.t[TABLE.payments] as PaymentRecord[];
  const id = `PAY-${m.milestone_id}-${evaluation.runId}`;
  if (payments.some((p) => p.milestoneId === m.milestone_id))
    throw new ConflictException("ALREADY_TRANSFERRED");
  const at = businessNow();
  payments.push(
    entity(id, {
      milestoneId: m.milestone_id,
      contractId: m.contract_id,
      runId: evaluation.runId,
      decision: evaluation.decision,
      amountMillion: evaluation.payableMillion,
      transferredBy: ctx.actor.displayName,
      transferredAt: at,
      organizationId: contract.buyer_id,
    }) as PaymentRecord,
  );
  (ctx.t[TABLE.history] as HistoryRecord[]).push(
    entity(`${id}:history`, {
      milestoneId: m.milestone_id,
      contractId: m.contract_id,
      runId: evaluation.runId,
      at: new Date().toISOString(),
      from: {
        status: evaluation.status,
        decision: evaluation.decision,
        reasonCode: evaluation.reasonCode,
      },
      to: {
        status: "COMPLETED" as const,
        decision: evaluation.decision,
        reasonCode: evaluation.reasonCode,
      },
      trigger: {
        kind: "PAYMENT" as const,
        paymentId: id,
        actorName: ctx.actor.displayName,
      },
    }) as HistoryRecord,
  );
  return outcome(
    ctx,
    { paymentId: id },
    {
      milestoneId: m.milestone_id,
      audit: [
        {
          category: "SYSTEM",
          contractId: m.contract_id,
          milestoneId: m.milestone_id,
          detail: { kind: "PAYMENT", amountMillion: evaluation.payableMillion },
        },
      ],
    },
  );
}

export function proposeException(
  ctx: Ctx,
  input: {
    contractId: string;
    sequence: number;
    eventId: string;
    reason: string;
  },
): Outcome {
  if (ctx.actor.role !== "ADMIN_AUDITOR")
    throw new ForbiddenException("CONTROLLERS_ONLY");
  const m = ctx.milestoneAt(input.contractId, Number(input.sequence));
  const reason = text(input.reason);
  if (!reason) throw new BadRequestException("NOTE_REQUIRED");
  if (!voidCandidates(ctx, m).some((e) => e.event_id === input.eventId))
    throw new BadRequestException("EVENT_NOT_VOIDABLE");
  const exceptions = ctx.t[TABLE.exceptions] as ExceptionRecord[];
  const id = nextId(
    "EXC-",
    exceptions.map((x) => x.id),
    4,
  );
  exceptions.push(
    entity(id, {
      milestoneId: m.milestone_id,
      contractId: m.contract_id,
      eventId: input.eventId,
      action: "VOID" as const,
      reason,
      proposedBy: { userId: ctx.actor.id, name: ctx.actor.displayName },
      proposedAt: businessNow(),
      status: "PROPOSED" as const,
      decidedBy: null,
      decidedAt: null,
      decisionNote: null,
      organizationId: ctx.actor.organizationId,
    }) as ExceptionRecord,
  );
  return outcome(
    ctx,
    { id },
    {
      milestoneId: m.milestone_id,
      audit: [
        {
          category: "SYSTEM",
          contractId: m.contract_id,
          milestoneId: m.milestone_id,
          detail: {
            kind: "EXCEPTION",
            state: "PROPOSED",
            eventId: input.eventId,
          },
        },
      ],
    },
  );
}

/** SoD-2: a second controller decides; an approved void is applied by the engine (BR-19). */
export function decideException(
  ctx: Ctx,
  input: { exceptionId: string; approve: boolean; note?: string },
): Outcome {
  if (ctx.actor.role !== "ADMIN_AUDITOR")
    throw new ForbiddenException("CONTROLLERS_ONLY");
  const request = (ctx.t[TABLE.exceptions] as ExceptionRecord[]).find(
    (x) => x.id === input.exceptionId,
  );
  if (!request) throw new NotFoundException("EXCEPTION_NOT_FOUND");
  ctx.milestone(request.milestoneId);
  if (request.status !== "PROPOSED")
    throw new BadRequestException("EXCEPTION_ALREADY_DECIDED");
  if (request.proposedBy.userId === ctx.actor.id)
    throw new ForbiddenException("SECOND_CONTROLLER_REQUIRED");
  const approve = input.approve === true;
  Object.assign(request, {
    status: approve ? "APPROVED" : "REJECTED",
    decidedBy: { userId: ctx.actor.id, name: ctx.actor.displayName },
    decidedAt: businessNow(),
    decisionNote: text(input.note) || null,
    version: request.version + 1,
    updatedAt: new Date().toISOString(),
  });
  return outcome(
    ctx,
    { status: request.status },
    {
      evaluate: approve,
      milestoneId: request.milestoneId,
      trigger: {
        kind: "EXCEPTION",
        exceptionId: request.id,
        eventId: request.eventId,
        actorName: ctx.actor.displayName,
      },
      audit: [
        {
          category: "SYSTEM",
          contractId: request.contractId,
          milestoneId: request.milestoneId,
          detail: {
            kind: "EXCEPTION",
            state: request.status,
            eventId: request.eventId,
          },
        },
      ],
    },
  );
}
