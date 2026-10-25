import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { randomInt } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { canonical, sha256 } from "../common/audit-chain";
import { repoRoot } from "../common/paths";
import { digestBytes } from "../trust/crypto";
import {
  LocalSigningProvider,
  getSigningProvider,
} from "../trust/signing-provider";
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
import { defaultSlots, documentSlots, assertSlots } from "./signing-layout";
import type {
  SignMethod,
  SigningConfig,
  SigningOverview,
  SigningRequest,
  SlotMap,
  VerificationResult,
} from "./types";

const signingProvider = {
  sign: (subject: string, payload: Record<string, unknown>) =>
    getSigningProvider().sign(subject, payload),
  verify: (subject: string, proof: import("../trust/types").LocalProof) =>
    getSigningProvider().verify(subject, proof),
};
const REQUEST_LIFETIME_MS = 5 * 60 * 1000;
/** The simulated signer confirms on the phone a few seconds after the request is sent. */
const SIMULATED_CONFIRM_DELAY_MS = 7000;
const METHODS: SignMethod[] = [
  "USB_TOKEN",
  "VNPT_SMARTCA",
  "VIETTEL_MYSIGN",
  "IMAGE",
];

/** Bind signatures to immutable document bytes, or explicitly to seed/demo terms when no file exists. */
export function signingDigest(ctx: Ctx, code: string) {
  const contract = ctx.contract(code);
  const signing = ctx.signing(code)!;
  const draft = ctx.draft(code);
  const terms = Object.fromEntries(
    [
      "contract_id",
      "contract_title",
      "contract_type",
      "buyer_id",
      "supplier_id",
      "contract_value_vnd_mn",
      "start_date",
      "end_date",
      "approval_policy",
      "grace_period_days",
      "penalty_rate_pct_per_day",
      "max_penalty_pct",
      "rule_set_id",
    ].map((key) => [key, contract[key]]),
  );
  const termsDigest = sha256(
    canonical({
      terms,
      fileName: signing.fileName,
      slots: signing.slots,
      ...((draft?.appendixDocuments?.length ?? 0)
        ? { appendices: draft!.appendixDocuments }
        : {}),
      signers: signing.steps.map((step) => ({
        stepNo: step.stepNo,
        userId: step.signerUserId,
        party: step.party,
      })),
    }),
  );
  const documentId = draft?.file.documentId;
  if (documentId) {
    if (!/^[a-f0-9-]{36}$/.test(documentId))
      throw new BadRequestException("INVALID_DOCUMENT");
    const bytes = readFileSync(
      resolve(
        repoRoot(),
        process.env.DATA_DIR ?? ".data",
        "uploads",
        documentId,
      ),
    );
    const digest = digestBytes(bytes);
    if (digest !== draft.file.sha256)
      throw new BadRequestException("DOCUMENT_CHANGED");
    for (const appendix of draft.appendixDocuments ?? []) {
      if (!/^[a-f0-9-]{36}$/.test(appendix.id))
        throw new BadRequestException("INVALID_DOCUMENT");
      const appendixBytes = readFileSync(
        resolve(
          repoRoot(),
          process.env.DATA_DIR ?? ".data",
          "uploads",
          appendix.id,
        ),
      );
      if (digestBytes(appendixBytes) !== appendix.sha256)
        throw new BadRequestException("DOCUMENT_CHANGED");
    }
    return { digest, termsDigest, basis: "DOCUMENT_BYTES" as const };
  }
  return { digest: termsDigest, termsDigest, basis: "TERMS_SNAPSHOT" as const };
}

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
    ...(record.layoutDocumentId
      ? {
          documentId: String(record.layoutDocumentId),
          documentSha256: String(record.layoutDocumentSha256),
          layoutVersion: Number(record.layoutVersion),
        }
      : {}),
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
    simulated: getSigningProvider().simulated,
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
  layout?: { documentSha256?: string; version?: number },
): Outcome {
  const record = stored(ctx, contractCode);
  const contract = ctx.contract(contractCode);
  if (contract.buyer_id !== ctx.actor.organizationId)
    throw new ForbiddenException("BUYER_ONLY");
  if (record.steps.some((s) => s.status === "SIGNED"))
    throw new BadRequestException("SIGNING_ALREADY_STARTED");
  if (
    record.layoutDocumentId &&
    (layout?.documentSha256 !== record.layoutDocumentSha256 ||
      layout?.version !== record.layoutVersion)
  )
    throw new BadRequestException("DOCUMENT_CHANGED");
  const next: SlotMap = {};
  if (
    !slots ||
    typeof slots !== "object" ||
    Array.isArray(slots) ||
    Object.keys(slots).some(
      (key) => !record.steps.some((step) => String(step.stepNo) === key),
    )
  )
    throw new BadRequestException("INVALID_SLOT");
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
  assertSlots(
    next,
    record.previewPages,
    record.steps.length,
    false,
    record.steps,
  );
  record.slots = next;
  record.version += 1;
  return outcome(ctx, next);
}

export const defaultSignatureSlots = (ctx: Ctx, contractCode: string) => {
  const record = stored(ctx, contractCode);
  return record.layoutDocumentId
    ? documentSlots(record.previewPages, record.steps.length, record.steps)
    : defaultSlots(record.steps.length);
};

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
async function complete(
  ctx: Ctx,
  request: SigningRequestRecord,
): Promise<Outcome> {
  const record = stored(ctx, request.contractCode);
  const step = record.steps.find((s) => s.stepNo === request.stepNo)!;
  if (request.status !== "PENDING" || step.status !== "CURRENT")
    throw new BadRequestException("REQUEST_NOT_PENDING");
  if (Date.parse(request.expiresAt) <= Date.now())
    throw new BadRequestException("REQUEST_EXPIRED");
  const document = signingDigest(ctx, request.contractCode);
  if (
    request.documentDigest !== document.digest ||
    request.termsDigest !== document.termsDigest
  )
    throw new BadRequestException("DOCUMENT_CHANGED");
  const signedAt = businessNow();
  const previous = record.steps.find(
    (s) => s.stepNo === step.stepNo - 1,
  )?.localProof;
  const proof = await signingProvider.sign(`signer:${step.signerUserId}`, {
    kind: "CONTRACT_SIGNATURE",
    contractCode: request.contractCode,
    requestId: request.id,
    stepNo: step.stepNo,
    signerUserId: step.signerUserId,
    declaredMethod: request.method,
    documentDigest: document.digest,
    basis: document.basis,
    signedAt,
    termsDigest: document.termsDigest,
    previousSignatureHash: previous ? sha256(canonical(previous)) : null,
    certificateTrusted: false,
  });
  if (!signingProvider.verify(`signer:${step.signerUserId}`, proof))
    throw new BadRequestException("INVALID_SIGNATURE_PROOF");
  step.localProof = proof;
  step.proofSource = getSigningProvider().kind as NonNullable<
    typeof step.proofSource
  >;
  request.status = "COMPLETED";
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
export async function readRequest(
  ctx: Ctx,
  contractCode: string,
  stepNo: number,
): Promise<Outcome<SigningRequest | null>> {
  assertSigner(ctx, contractCode, stepNo);
  const request = latestRequest(ctx, contractCode, stepNo);
  if (request?.status === "PENDING") {
    const now = Date.now();
    if (Date.parse(request.expiresAt) <= now) request.status = "EXPIRED";
    else if (
      getSigningProvider().simulated &&
      request.autoConfirmAt &&
      Date.parse(request.autoConfirmAt) <= now
    )
      return (await complete(ctx, request)) as Outcome<SigningRequest>;
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
      autoConfirmAt: getSigningProvider().simulated
        ? new Date(now + SIMULATED_CONFIRM_DELAY_MS).toISOString()
        : null,
      documentDigest: signingDigest(ctx, contractCode).digest,
      termsDigest: signingDigest(ctx, contractCode).termsDigest,
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
  let document: ReturnType<typeof signingDigest> | null = null;
  try {
    document = signingDigest(ctx, contractCode);
  } catch {
    /* changed or missing stored document */
  }
  const signatures = record.steps
    .filter((s) => s.status === "SIGNED" && s.signedAt && s.method)
    .map((s) => {
      const profile = (ctx.t[TABLE.profiles] as ProfileRecord[]).find(
        (p) => p.id === s.signerUserId,
      );
      const certificate = profile?.certificates[s.method!];
      const expiry = new Date(`${s.signedAt}Z`);
      expiry.setUTCFullYear(expiry.getUTCFullYear() + 2);
      const proof = s.localProof;
      const previous = record.steps.find(
        (step) => step.stepNo === s.stepNo - 1,
      )?.localProof;
      const cryptoValid =
        !!proof &&
        (s.proofSource === "HTTP_ED25519_BRIDGE"
          ? !getSigningProvider().simulated &&
            signingProvider.verify(`signer:${s.signerUserId}`, proof)
          : new LocalSigningProvider().verify(
              `signer:${s.signerUserId}`,
              proof,
            )) &&
        proof.payload.contractCode === contractCode &&
        proof.payload.signerUserId === s.signerUserId &&
        proof.payload.stepNo === s.stepNo &&
        proof.payload.signedAt === s.signedAt &&
        proof.payload.declaredMethod === s.method &&
        proof.payload.previousSignatureHash ===
          (previous ? sha256(canonical(previous)) : null);
      const contentIntact =
        !!proof &&
        !!document &&
        proof.payload.documentDigest === document.digest &&
        proof.payload.termsDigest === document.termsDigest;
      return {
        stepNo: s.stepNo,
        party: s.party,
        signerName: s.signerName,
        signedAt: s.signedAt!,
        method: s.method!,
        certExpiryMonth: certificate?.expiryMonth ?? expiry.getUTCMonth() + 1,
        certExpiryYear: certificate?.expiryYear ?? expiry.getUTCFullYear(),
        status: !proof
          ? ("UNVERIFIED" as const)
          : cryptoValid && contentIntact
            ? ("VALID" as const)
            : ("INVALID" as const),
        contentIntact,
        cryptoValid,
        certificateTrusted: false,
        proofBasis: document?.basis,
        keyFingerprint: proof?.keyFingerprint,
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
