import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { randomInt } from "node:crypto";
import { outcome, newEvent, type Outcome } from "./actions";
import type { Ctx } from "./context";
import { businessNow, entity, nextId } from "./factory";
import {
  TABLE,
  type DraftRecord,
  type ProfileRecord,
  type SigningRecord,
  type SigningRequestRecord,
} from "./records";
import { defaultSlots } from "./signing-layout";
import type {
  SignMethod,
  SigningConfig,
  SigningOverview,
  SigningRequest,
  SlotMap,
  VerificationResult,
} from "./types";

const REQUEST_LIFETIME_MS = 5 * 60 * 1000;
/** The simulated signer confirms on the phone a few seconds after the request is sent. */
const SIMULATED_CONFIRM_DELAY_MS = 7000;
const METHODS: SignMethod[] = [
  "USB_TOKEN",
  "VNPT_SMARTCA",
  "VIETTEL_MYSIGN",
  "IMAGE",
];

function stored(ctx: Ctx, contractCode: string): SigningRecord {
  ctx.contract(contractCode);
  const record = ctx.signing(contractCode);
  if (!record) throw new NotFoundException("SIGNING_NOT_FOUND");
  return record;
}

export function signingConfig(ctx: Ctx, contractCode: string): SigningConfig {
  const record = stored(ctx, contractCode);
  const contract = ctx.contract(contractCode);
  return {
    contractCode,
    title: contract.contract_title,
    supplierName: ctx.partyName(contract.supplier_id),
    valueMillion: contract.contract_value_vnd_mn,
    fileName: record.fileName,
    pageCount: record.pageCount,
    digitalSignatureRequired: record.digitalSignatureRequired,
    origin: record.origin,
    steps: ctx.signingSteps(contractCode),
    slots: record.slots,
    previewPages: record.previewPages,
  };
}

export function signingOverview(
  ctx: Ctx,
  contractCode: string,
): SigningOverview {
  const config = signingConfig(ctx, contractCode);
  const profile = (ctx.t[TABLE.profiles] as ProfileRecord[]).find(
    (p) => p.id === ctx.actor.id,
  );
  const current = config.steps.find((s) => s.status === "CURRENT");
  const mine = config.steps.find((s) => s.signerUserId === ctx.actor.id);
  return {
    ...config,
    currentStepNo: current?.stepNo ?? null,
    myStepNo: mine?.stepNo ?? null,
    lastMethod: profile?.lastMethod ?? "USB_TOKEN",
    certificates: profile?.certificates ?? {},
    anySigned: config.steps.some((s) => s.status === "SIGNED"),
  };
}

export function saveSlots(
  ctx: Ctx,
  contractCode: string,
  slots: SlotMap,
): Outcome {
  const record = stored(ctx, contractCode);
  const contract = ctx.contract(contractCode);
  if (contract.buyer_id !== ctx.actor.organizationId)
    throw new ForbiddenException("BUYER_ONLY");
  if (record.steps.some((s) => s.status === "SIGNED"))
    throw new BadRequestException("SIGNING_ALREADY_STARTED");
  const next: SlotMap = {};
  for (const step of record.steps) {
    const slot = slots?.[step.stepNo];
    if (slot === null || slot === undefined) {
      next[step.stepNo] = null;
      continue;
    }
    const numbers = [slot.page, slot.x, slot.y, slot.w, slot.h];
    if (
      numbers.some((n) => typeof n !== "number" || !Number.isFinite(n)) ||
      !["NAME_AND_TIME", "WITH_TITLE"].includes(slot.look)
    )
      throw new BadRequestException("INVALID_SLOT");
    next[step.stepNo] = {
      page: slot.page,
      x: slot.x,
      y: slot.y,
      w: slot.w,
      h: slot.h,
      look: slot.look,
    };
  }
  record.slots = next;
  record.version += 1;
  return outcome(ctx, next);
}

export const defaultSignatureSlots = (ctx: Ctx, contractCode: string) =>
  defaultSlots(stored(ctx, contractCode).steps.length);

const requestsOf = (ctx: Ctx) =>
  ctx.t[TABLE.requests] as SigningRequestRecord[];

function latestRequest(ctx: Ctx, contractCode: string, stepNo: number) {
  return [...requestsOf(ctx)]
    .reverse()
    .find((r) => r.contractCode === contractCode && r.stepNo === stepNo);
}

const plain = (r: SigningRequestRecord): SigningRequest => ({
  id: r.id,
  contractCode: r.contractCode,
  stepNo: r.stepNo,
  method: r.method,
  status: r.status,
  code: r.code,
  sentAt: r.sentAt,
  expiresAt: r.expiresAt,
  autoConfirmAt: r.autoConfirmAt,
});

function assertSigner(ctx: Ctx, contractCode: string, stepNo: number) {
  const record = stored(ctx, contractCode);
  const step = record.steps.find((s) => s.stepNo === stepNo);
  if (!step) throw new NotFoundException("STEP_NOT_FOUND");
  if (step.signerUserId !== ctx.actor.id)
    throw new ForbiddenException("NOT_ASSIGNED_SIGNER");
  return { record, step };
}

/**
 * Records a signature and moves the sequence on. When the last signer signs, the buyer's
 * CONTRACT_SIGNED event is recorded (spec 4.2: the buyer creates it) and the contract starts.
 */
function complete(ctx: Ctx, request: SigningRequestRecord): Outcome {
  const record = stored(ctx, request.contractCode);
  const step = record.steps.find((s) => s.stepNo === request.stepNo)!;
  request.status = "COMPLETED";
  const signedAt = businessNow();
  step.status = "SIGNED";
  step.signedAt = signedAt;
  step.method = request.method;
  const next = record.steps.find((s) => s.stepNo === request.stepNo + 1);
  if (next) next.status = "CURRENT";
  record.version += 1;
  const profiles = ctx.t[TABLE.profiles] as ProfileRecord[];
  const profile = profiles.find((p) => p.id === step.signerUserId);
  if (profile) profile.lastMethod = request.method;
  else
    profiles.push(
      entity(step.signerUserId, {
        lastMethod: request.method,
        certificates: {},
        organizationId: step.organizationId,
      }) as ProfileRecord,
    );
  const audit = [
    {
      category: "SIGN" as const,
      contractId: request.contractCode,
      milestoneId: null,
      detail: {
        kind: "SIGNATURE" as const,
        stepNo: step.stepNo,
        totalSteps: record.steps.length,
        isFinal: step.isFinal,
      },
    },
  ];
  if (record.steps.some((s) => s.status !== "SIGNED"))
    return outcome(ctx, plain(request), { audit });
  const contract = ctx.contract(request.contractCode);
  const signingMilestone = ctx
    .milestonesOf(contract.contract_id)
    .find((m) => m.required_event_types.split(";").includes("CONTRACT_SIGNED"));
  contract.lifecycle = "ACTIVE";
  contract.signing_date = signedAt.slice(0, 10);
  contract.initial_contract_status = "ACTIVE";
  contract.version += 1;
  const draft = ctx.draft(contract.contract_id);
  if (draft) draft.state = "ACTIVE";
  const events = signingMilestone
    ? [
        newEvent(
          ctx,
          signingMilestone,
          "CONTRACT_SIGNED",
          "CONFIRMED",
          contract.buyer_id,
          {
            note: `Signed by ${record.steps.length} signers in order.`,
            fileName: record.fileName,
            at: signedAt,
          },
        ),
      ]
    : [];
  return outcome(ctx, plain(request), {
    events,
    evaluate: true,
    milestoneId: signingMilestone?.milestone_id ?? null,
    trigger: {
      kind: "EVENTS",
      eventIds: events.map((e) => e.event_id),
      actorName: ctx.actor.displayName,
    },
    audit,
  });
}

/** Reading a request lets the simulated phone side progress (expiry, auto-confirmation). */
export function readRequest(
  ctx: Ctx,
  contractCode: string,
  stepNo: number,
): Outcome<SigningRequest | null> {
  stored(ctx, contractCode);
  const request = latestRequest(ctx, contractCode, stepNo);
  if (request?.status === "PENDING") {
    const now = Date.now();
    if (Date.parse(request.expiresAt) <= now) request.status = "EXPIRED";
    else if (request.autoConfirmAt && Date.parse(request.autoConfirmAt) <= now)
      return complete(ctx, request) as Outcome<SigningRequest>;
  }
  return outcome(ctx, request ? plain(request) : null);
}

export function sendRequest(
  ctx: Ctx,
  contractCode: string,
  stepNo: number,
  method: SignMethod,
): Outcome {
  const { record, step } = assertSigner(ctx, contractCode, stepNo);
  if (step.status !== "CURRENT") throw new BadRequestException("NOT_YOUR_TURN");
  if (!METHODS.includes(method))
    throw new BadRequestException("INVALID_METHOD");
  if (method === "IMAGE" && (record.digitalSignatureRequired || step.isFinal))
    throw new BadRequestException("IMAGE_NOT_ALLOWED");
  for (const open of requestsOf(ctx))
    if (
      open.contractCode === contractCode &&
      open.stepNo === stepNo &&
      open.status === "PENDING"
    )
      open.status = "CANCELLED";
  const now = Date.now();
  const request = entity(
    nextId(
      "RQ-",
      requestsOf(ctx).map((r) => r.id),
      6,
    ),
    {
      contractCode,
      stepNo,
      method,
      status: "PENDING" as const,
      code: String(randomInt(1000, 10000)),
      sentAt: new Date(now).toISOString(),
      expiresAt: new Date(now + REQUEST_LIFETIME_MS).toISOString(),
      autoConfirmAt: new Date(now + SIMULATED_CONFIRM_DELAY_MS).toISOString(),
      organizationId: step.organizationId,
    },
  ) as SigningRequestRecord;
  requestsOf(ctx).push(request);
  return outcome(ctx, plain(request));
}

function pending(ctx: Ctx, contractCode: string, stepNo: number) {
  assertSigner(ctx, contractCode, stepNo);
  const request = latestRequest(ctx, contractCode, stepNo);
  if (!request || request.status !== "PENDING")
    throw new BadRequestException("REQUEST_NOT_PENDING");
  return request;
}

export const confirmRequest = (
  ctx: Ctx,
  contractCode: string,
  stepNo: number,
) => complete(ctx, pending(ctx, contractCode, stepNo));

export function rejectRequest(
  ctx: Ctx,
  contractCode: string,
  stepNo: number,
): Outcome {
  const request = pending(ctx, contractCode, stepNo);
  request.status = "REJECTED";
  return outcome(ctx, plain(request));
}

export function cancelRequest(
  ctx: Ctx,
  contractCode: string,
  stepNo: number,
): Outcome {
  const request = pending(ctx, contractCode, stepNo);
  request.status = "CANCELLED";
  return outcome(ctx, plain(request));
}

/** Cancels the whole sequence while nobody has signed; the contract goes back to draft. */
export function cancelSigning(ctx: Ctx, contractCode: string): Outcome {
  const record = stored(ctx, contractCode);
  const contract = ctx.contract(contractCode);
  if (contract.buyer_id !== ctx.actor.organizationId)
    throw new ForbiddenException("BUYER_ONLY");
  if (
    contract.lifecycle !== "SIGNING" ||
    record.steps.some((s) => s.status === "SIGNED")
  )
    throw new BadRequestException("SIGNING_ALREADY_STARTED");
  for (const request of requestsOf(ctx))
    if (request.contractCode === contractCode && request.status === "PENDING")
      request.status = "CANCELLED";
  for (const step of record.steps) step.status = "WAITING";
  contract.lifecycle = "DRAFT";
  contract.version += 1;
  const draft = ctx.draft(contractCode) as DraftRecord | undefined;
  if (draft) {
    draft.state = "DRAFT";
    if (draft.digitization) draft.digitization.locked = false;
  }
  removeMilestones(ctx, contractCode);
  return outcome(ctx, { cancelled: true });
}

/** Milestones of an unsigned contract go away with its digitised terms (they never had events). */
export function removeMilestones(ctx: Ctx, contractCode: string) {
  const ids = new Set(
    ctx.milestonesOf(contractCode).map((m) => m.milestone_id),
  );
  for (const name of [TABLE.milestones, TABLE.evaluations] as const) {
    const table = ctx.t[name];
    for (let i = table.length - 1; i >= 0; i--)
      if (ids.has(String(table[i].milestone_id ?? table[i].milestoneId)))
        table.splice(i, 1);
  }
}

export function verification(
  ctx: Ctx,
  contractCode: string,
): VerificationResult {
  const record = stored(ctx, contractCode);
  const signatures = record.steps
    .filter((s) => s.status === "SIGNED" && s.signedAt && s.method)
    .map((s) => {
      const profile = (ctx.t[TABLE.profiles] as ProfileRecord[]).find(
        (p) => p.id === s.signerUserId,
      );
      const certificate = profile?.certificates[s.method!];
      const expiry = new Date(`${s.signedAt}Z`);
      expiry.setUTCFullYear(expiry.getUTCFullYear() + 2);
      return {
        stepNo: s.stepNo,
        party: s.party,
        signerName: s.signerName,
        signedAt: s.signedAt!,
        method: s.method!,
        certExpiryMonth: certificate?.expiryMonth ?? expiry.getUTCMonth() + 1,
        certExpiryYear: certificate?.expiryYear ?? expiry.getUTCFullYear(),
        status: "VALID" as const,
        contentIntact: true,
      };
    });
  const complete = signatures.length === record.steps.length;
  return {
    contractCode,
    stepCount: record.steps.length,
    signatures,
    effectiveAt: complete
      ? signatures
          .map((s) => s.signedAt)
          .sort()
          .at(-1)!
      : null,
    milestonesOpened: ctx.milestonesOf(contractCode).length,
    origin: record.origin,
  };
}
