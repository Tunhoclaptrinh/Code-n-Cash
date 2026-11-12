import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Param,
  Post,
  Req,
} from "@nestjs/common";
import { can } from "./common/permissions";
import type { Actor, SessionRequest } from "./common/types";
import * as actions from "./domain/actions";
import * as drafts from "./domain/drafts";
import * as lists from "./domain/lists";
import { type PaymentRecord, TABLE } from "./domain/records";
import { DomainService } from "./domain/service";
import { sendInstruction } from "./payment-gateway";
import * as signing from "./domain/signing";
import * as views from "./domain/views";
import * as remoteSigner from "./trust/remote-signer";
import { getSigningProvider } from "./trust/signing-provider";

type Args = unknown[];
interface Handler {
  /** Permission from packages/contracts/permissions.json; actions without one are refused. */
  permission: string;
  run: (domain: DomainService, actor: Actor, args: Args) => Promise<unknown>;
}

const str = (value: unknown) => (typeof value === "string" ? value : "");
const num = (value: unknown) =>
  typeof value === "number" ? value : Number(value);
const opt = (value: unknown) =>
  value === undefined || value === null ? undefined : value;
const input = <T>(value: unknown): T => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new BadRequestException("INVALID_INPUT");
  return value as T;
};

const read = (
  permission: string,
  fn: (ctx: never, args: Args, dryRun: never) => unknown,
  extra: string[] = [],
): Handler => ({
  permission,
  run: (domain, actor, args) =>
    domain.read(
      actor,
      (ctx, dryRun) => fn(ctx as never, args, dryRun as never),
      extra,
    ),
});
const write = (
  permission: string,
  name: string,
  fn: (ctx: never, args: Args) => actions.Outcome | Promise<actions.Outcome>,
): Handler => ({
  permission,
  run: (domain, actor, args) =>
    domain.write(
      actor,
      name,
      (ctx) => fn(ctx as never, args),
      typeof args[0] === "string"
        ? args[0]
        : str(
            (args[0] as { contractId?: unknown; code?: unknown } | null)
              ?.contractId ?? (args[0] as { code?: unknown } | null)?.code,
          ),
    ),
});

/** Sends an approved instruction to the payment gateway, outside any transaction, then records it. */
async function deliverPayment(
  domain: DomainService,
  actor: Actor,
  paymentId: string,
) {
  const payment = await domain.read(actor, (ctx) => {
    const found = (ctx.t[TABLE.payments] as PaymentRecord[]).find(
      (p) => p.id === paymentId,
    );
    if (!found) throw new NotFoundException("PAYMENT_NOT_FOUND");
    ctx.contract(found.contractId);
    return structuredClone(found);
  });
  if (payment.delivery?.status === "ACKNOWLEDGED")
    return { paymentId, delivery: payment.delivery };
  const result = await sendInstruction(payment);
  return domain.write(
    actor,
    "recordPaymentDelivery",
    (ctx) => actions.recordPaymentDelivery(ctx, { paymentId, result }),
    payment.contractId,
  );
}

/** Runs a write that approves an instruction, then sends that instruction to the gateway. */
const thenDeliver = (handler: Handler): Handler => ({
  permission: handler.permission,
  run: async (domain, actor, args) => {
    const { paymentId } = (await handler.run(domain, actor, args)) as {
      paymentId: string;
    };
    return deliverPayment(domain, actor, paymentId);
  },
});
/** (Re)sends an approved instruction, named by its payment id, to the gateway. */
const sends = (permission: string, _name: string): Handler => ({
  permission,
  run: (domain, actor, [paymentId]) =>
    deliverPayment(domain, actor, str(paymentId)),
});

/* ------------------- signing through the remote signing service ------------------- */

const remoteMode = () => !!getSigningProvider().remote;

/** The open request's service details, or null when there is none or it is not remote. */
const openRemote = (
  domain: DomainService,
  actor: Actor,
  code: string,
  step: number,
) =>
  domain.read(actor, (ctx) => {
    try {
      return signing.remoteDispatch(ctx, code, step);
    } catch {
      return null;
    }
  });

/**
 * Sends a signing request. Through the signing service it is recorded first, then handed to the
 * service outside any transaction (like the payment gateway), then linked to the service's
 * transaction; when the service cannot be reached the request stops and says so.
 */
const sendThroughService: Handler = {
  permission: "signing:sign",
  run: async (domain, actor, [code, step, method]) => {
    const sent = await domain.write(
      actor,
      "sendSigningRequest",
      (ctx) =>
        signing.sendRequest(ctx, str(code), num(step), str(method) as never),
      str(code),
    );
    if (!(sent as { remote?: boolean }).remote) return sent;
    const open = await openRemote(domain, actor, str(code), num(step));
    if (!open) return sent;
    try {
      await remoteSigner.ensureCa();
      await remoteSigner.enroll({
        subscriberId: actor.id,
        commonName: actor.displayName,
        organization: actor.roleChipOrganization ?? "",
      });
      const transaction = await remoteSigner.createSignature(
        open,
        open.requestId,
      );
      return domain.write(
        actor,
        "attachSigningTransaction",
        (ctx) => signing.attachTransaction(ctx, open.requestId, transaction),
        str(code),
      );
    } catch {
      await domain.write(
        actor,
        "failSigningRequest",
        (ctx) => signing.failRemote(ctx, open.requestId, "SIGNER_UNAVAILABLE"),
        str(code),
      );
      throw new BadRequestException("SIGNER_UNAVAILABLE");
    }
  },
};

/**
 * Reads the request. When a webhook from the signing service was lost, asking the service here
 * brings the result in anyway (the service stays the source of what the person decided).
 */
const readThroughService: Handler = {
  permission: "contracts:read",
  run: async (domain, actor, [code, step]) => {
    if (remoteMode()) {
      const open = await openRemote(domain, actor, str(code), num(step));
      if (open?.transactionId)
        try {
          const transaction = await remoteSigner.getSignature(
            open.transactionId,
          );
          if (transaction.status !== "PENDING") {
            await remoteSigner.ensureCa();
            await domain.write(
              actor,
              "applySigningResult",
              (ctx) => signing.applyRemoteResult(ctx, transaction),
              str(code),
            );
          }
        } catch {
          /* The service is unreachable: the request keeps waiting until it expires. */
        }
    }
    return domain.write(
      actor,
      "getSigningRequest",
      (ctx) => signing.readRequest(ctx, str(code), num(step)),
      str(code),
    );
  },
};

/** Rejecting or cancelling here also withdraws the request from the person's device. */
const withdrawThroughService = (
  name: "rejectSigningRequest" | "cancelSigningRequest",
): Handler => ({
  permission: "signing:sign",
  run: async (domain, actor, [code, step]) => {
    const open = remoteMode()
      ? await openRemote(domain, actor, str(code), num(step))
      : null;
    const result = await domain.write(
      actor,
      name,
      (ctx) =>
        name === "rejectSigningRequest"
          ? signing.rejectRequest(ctx, str(code), num(step))
          : signing.cancelRequest(ctx, str(code), num(step)),
      str(code),
    );
    if (open?.transactionId)
      await remoteSigner.cancelSignature(open.transactionId).catch(() => {});
    return result;
  },
});

/**
 * Workflow actions. The signed-in actor comes from the session, never from the arguments; each
 * handler checks the business rules (who may record which event) inside the domain layer.
 */
/** A head hash saved earlier ("seq:hash"), checked against the audit chain. */
const anchorOf = (value: unknown) => {
  if (value === undefined || value === null || value === "") return undefined;
  const match = /^(\d{1,9}):([0-9a-f]{64})$/.exec(str(value).trim());
  if (!match) throw new BadRequestException("INVALID_ANCHOR");
  return { seq: Number(match[1]), hash: match[2] };
};

const HANDLERS: Record<string, Record<string, Handler>> = {
  contracts: {
    getContractList: read("contracts:read", (ctx) => views.contractList(ctx)),
    listContracts: read("contracts:read", (ctx, [query]) =>
      lists.listContracts(ctx, query),
    ),
    getContractOverview: read("contracts:read", (ctx, [id]) =>
      views.contractOverview(ctx, str(id)),
    ),
    getSmartContract: read("contracts:read", (ctx, [id]) =>
      views.smartContract(ctx, str(id)),
    ),
    // Only the decision hashes of the audit chain are read, never its content.
    getVerificationBundle: read(
      "contracts:read",
      (ctx, [id]) => views.verificationBundle(ctx, str(id)),
      ["audit"],
    ),
    getMilestoneDetail: read("contracts:read", (ctx, [id, sequence]) =>
      views.milestoneDetail(ctx, str(id), num(sequence)),
    ),
    getMilestoneTimeline: read("contracts:read", (ctx, [id, sequence]) =>
      views.milestoneTimeline(ctx, str(id), num(sequence)),
    ),
  },
  dashboard: {
    getDashboard: read("contracts:read", (ctx) => views.dashboard(ctx)),
  },
  integrity: {
    verifyIntegrity: read(
      "audit:read",
      (ctx, [anchor]) => views.integrityReport(ctx, anchorOf(anchor)),
      ["audit", "anchor-jobs"],
    ),
  },
  tasks: {
    // The notification drawer and the menu badge (docs/09 §5): what is the user's turn and holds
    // a milestone or contract. Payment orders of decided milestones stay in the inbox list only.
    getTaskInbox: read("tasks:read", (ctx) =>
      views.taskInbox(ctx).filter(views.notifies),
    ),
    listTasks: read("tasks:read", (ctx, [query]) =>
      lists.listTasks(ctx, query),
    ),
    getPendingTaskCount: read(
      "tasks:read",
      (ctx) => views.taskInbox(ctx).filter(views.notifies).length,
    ),
  },
  evidence: {
    getEvidenceWorkspace: read("tasks:read", (ctx, [id, sequence], dryRun) =>
      views.evidenceWorkspace(
        ctx,
        dryRun,
        (c, m) => actions.evidenceEvents(c, m),
        opt(id) as string | undefined,
        opt(sequence) as number | undefined,
      ),
    ),
    attachEvidenceFile: write(
      "evidence:submit",
      "attachEvidenceFile",
      (ctx, [value]) => actions.attachEvidence(ctx, input(value)),
    ),
    removeEvidenceFile: write(
      "evidence:submit",
      "removeEvidenceFile",
      (ctx, [value]) => actions.removeEvidence(ctx, input(value)),
    ),
    submitEvidence: write("evidence:submit", "submitEvidence", (ctx, [value]) =>
      actions.submitEvidence(ctx, input(value)),
    ),
  },
  approvals: {
    getApprovalView: read("approvals:read", (ctx, [id, sequence], dryRun) =>
      views.approvalView(
        ctx,
        dryRun,
        (c, m) => actions.approvalEvent(c, m),
        opt(id) as string | undefined,
        opt(sequence) as number | undefined,
      ),
    ),
    castVote: write("approvals:vote", "castVote", (ctx, [value]) =>
      actions.castVote(ctx, input(value)),
    ),
  },
  amendments: {
    proposeAmendment: write(
      "contracts:amend",
      "proposeAmendment",
      (ctx, [value]) => actions.proposeAmendment(ctx, input(value)),
    ),
    decideAmendment: write(
      "contracts:amend",
      "decideAmendment",
      (ctx, [value]) => actions.decideAmendment(ctx, input(value)),
    ),
    withdrawAmendment: write(
      "contracts:amend",
      "withdrawAmendment",
      (ctx, [value]) => actions.withdrawAmendment(ctx, input(value)),
    ),
  },
  disputes: {
    getDispute: read("disputes:read", (ctx, [id, sequence], dryRun) =>
      views.disputeView(
        ctx,
        dryRun,
        (c, m) => actions.resolutionEvents(c, m),
        str(id),
        num(sequence),
      ),
    ),
    openDispute: write("disputes:open", "openDispute", (ctx, [value]) =>
      actions.openDispute(ctx, input(value)),
    ),
    resolveDispute: write(
      "disputes:resolve",
      "resolveDispute",
      (ctx, [value]) => actions.resolveDispute(ctx, input(value)),
    ),
  },
  payments: {
    // Approving creates the instruction; it is then sent to the gateway and the result recorded.
    transferToAccounting: thenDeliver(
      write("payments:transfer", "transferToAccounting", (ctx, [value]) =>
        actions.transferToAccounting(ctx, input(value)),
      ),
    ),
    // A failed send can be retried; the gateway sees the same idempotency key every time.
    retryPaymentDelivery: sends("payments:transfer", "retryPaymentDelivery"),
  },
  exceptions: {
    listExceptionQueue: read("exceptions:read", (ctx) =>
      views.exceptionQueue(ctx),
    ),
    listExceptions: read("exceptions:read", (ctx, [query]) =>
      lists.listExceptions(ctx, query),
    ),
    proposeException: write(
      "exceptions:propose",
      "proposeException",
      (ctx, [value]) => actions.proposeException(ctx, input(value)),
    ),
    decideException: write(
      "exceptions:decide",
      "decideException",
      (ctx, [value]) => actions.decideException(ctx, input(value)),
    ),
  },
  signing: {
    getSigningConfig: read("contracts:read", (ctx, [code]) =>
      signing.signingConfig(ctx, str(code)),
    ),
    getDefaultSignatureSlots: read("contracts:read", (ctx, [code]) =>
      signing.defaultSignatureSlots(ctx, str(code)),
    ),
    getSigningOverview: read("contracts:read", (ctx, [code]) =>
      signing.signingOverview(ctx, str(code)),
    ),
    getVerification: read("signing:verify", (ctx, [code]) =>
      signing.verification(ctx, str(code)),
    ),
    saveSignatureSlots: write(
      "contracts:signature-slots",
      "saveSignatureSlots",
      (ctx, [code, slots, layout]) =>
        signing.saveSlots(
          ctx,
          str(code),
          input(slots),
          layout ? input(layout) : undefined,
        ),
    ),
    getSigningRequest: readThroughService,
    sendSigningRequest: sendThroughService,
    confirmSigningRequest: write(
      "signing:sign",
      "confirmSigningRequest",
      (ctx, [code, step]) => signing.confirmRequest(ctx, str(code), num(step)),
    ),
    rejectSigningRequest: withdrawThroughService("rejectSigningRequest"),
    cancelSigningRequest: withdrawThroughService("cancelSigningRequest"),
    cancelSigning: write("signing:cancel", "cancelSigning", (ctx, [code]) =>
      signing.cancelSigning(ctx, str(code)),
    ),
  },
  drafts: {
    getContractDraft: read("contracts:draft-read", (ctx, [code, fresh]) =>
      drafts.currentDraft(ctx, opt(code) as string | undefined, fresh === true),
    ),
    getUploadFormOptions: read("contracts:draft-read", (ctx) =>
      drafts.uploadFormOptions(ctx),
    ),
    saveContractDraft: write(
      "contracts:draft-write",
      "saveContractDraft",
      (ctx, [value]) => drafts.saveDraft(ctx, input(value)),
    ),
    getDigitization: read("contracts:read", (ctx, [code]) =>
      drafts.digitization(ctx, str(code)),
    ),
    confirmDigitization: write(
      "contracts:digitize",
      "confirmDigitization",
      (ctx, [code, value]) =>
        drafts.confirmDigitization(
          ctx,
          str(code),
          input(value ?? { dueDate: null }),
        ),
    ),
  },
  activity: {
    listActivityEntries: read("activity:read", (ctx) => views.activity(ctx), [
      "audit",
    ]),
    listActivity: read(
      "activity:read",
      (ctx, [query]) => lists.listActivity(ctx, query),
      ["audit"],
    ),
    getDefaultActivityRange: read("activity:read", (ctx) =>
      views.activityRange(ctx),
    ),
  },
};

@Injectable()
export class WorkflowService {
  constructor(@Inject(DomainService) private domain: DomainService) {}
  async call(module: string, action: string, body: unknown, actor: Actor) {
    const handler =
      Object.hasOwn(HANDLERS, module) && Object.hasOwn(HANDLERS[module], action)
        ? HANDLERS[module][action]
        : undefined;
    if (!handler) throw new NotFoundException("ACTION_NOT_FOUND");
    if (!can(actor.role, handler.permission))
      throw new ForbiddenException("ACTION_FORBIDDEN");
    const args = (body as { args?: unknown })?.args ?? [];
    if (!Array.isArray(args) || args.length > 6)
      throw new BadRequestException("INVALID_ARGUMENTS");
    return handler.run(this.domain, actor, structuredClone(args));
  }
}

@Controller("workflow")
export class WorkflowController {
  constructor(@Inject(WorkflowService) private service: WorkflowService) {}
  @Post(":module/:action") call(
    @Param("module") module: string,
    @Param("action") action: string,
    @Body() body: unknown,
    @Req() req: SessionRequest,
  ) {
    return this.service.call(module, action, body, req.user);
  }
}
