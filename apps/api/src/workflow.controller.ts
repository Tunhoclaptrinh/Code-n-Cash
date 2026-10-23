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
import { DomainService } from "./domain/service";
import * as signing from "./domain/signing";
import * as views from "./domain/views";

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
    getMilestoneDetail: read("contracts:read", (ctx, [id, sequence]) =>
      views.milestoneDetail(ctx, str(id), num(sequence)),
    ),
    getMilestoneTimeline: read("contracts:read", (ctx, [id, sequence]) =>
      views.milestoneTimeline(ctx, str(id), num(sequence)),
    ),
  },
  integrity: {
    verifyIntegrity: read(
      "audit:read",
      (ctx, [anchor]) => views.integrityReport(ctx, anchorOf(anchor)),
      ["audit"],
    ),
  },
  tasks: {
    getTaskInbox: read("tasks:read", (ctx) => views.taskInbox(ctx)),
    listTasks: read("tasks:read", (ctx, [query]) =>
      lists.listTasks(ctx, query),
    ),
    getPendingTaskCount: read(
      "tasks:read",
      (ctx) => views.taskInbox(ctx).length,
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
    transferToAccounting: write(
      "payments:transfer",
      "transferToAccounting",
      (ctx, [value]) => actions.transferToAccounting(ctx, input(value)),
    ),
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
      (ctx, [code, slots]) => signing.saveSlots(ctx, str(code), input(slots)),
    ),
    getSigningRequest: write(
      "contracts:read",
      "getSigningRequest",
      (ctx, [code, step]) => signing.readRequest(ctx, str(code), num(step)),
    ),
    sendSigningRequest: write(
      "signing:sign",
      "sendSigningRequest",
      (ctx, [code, step, method]) =>
        signing.sendRequest(ctx, str(code), num(step), str(method) as never),
    ),
    confirmSigningRequest: write(
      "signing:sign",
      "confirmSigningRequest",
      (ctx, [code, step]) => signing.confirmRequest(ctx, str(code), num(step)),
    ),
    rejectSigningRequest: write(
      "signing:sign",
      "rejectSigningRequest",
      (ctx, [code, step]) => signing.rejectRequest(ctx, str(code), num(step)),
    ),
    cancelSigningRequest: write(
      "signing:sign",
      "cancelSigningRequest",
      (ctx, [code, step]) => signing.cancelRequest(ctx, str(code), num(step)),
    ),
    cancelSigning: write("signing:cancel", "cancelSigning", (ctx, [code]) =>
      signing.cancelSigning(ctx, str(code)),
    ),
  },
  drafts: {
    getContractDraft: read("contracts:draft-read", (ctx, [code]) =>
      drafts.currentDraft(ctx, opt(code) as string | undefined),
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
