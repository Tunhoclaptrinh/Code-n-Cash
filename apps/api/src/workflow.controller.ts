import * as m0 from "./workflow/features/contracts/api/contractDraft.api";
import * as m1 from "./workflow/features/contracts/api/contractList.api";
import * as m2 from "./workflow/features/signing/api/digitization.api";
import * as m3 from "./workflow/features/signing/api/signingConfig.api";
import * as m4 from "./workflow/features/signing/api/signingFlow.api";
import * as m5 from "./workflow/features/signing/api/verification.api";
import * as m6 from "./workflow/features/milestones/api/approvals.api";
import * as m7 from "./workflow/features/milestones/api/contracts.api";
import * as m8 from "./workflow/features/milestones/api/evidence.api";
import * as m9 from "./workflow/features/milestones/api/tasks.api";
import * as m10 from "./workflow/features/disputes/api/dispute.api";
import * as m11 from "./workflow/features/audit/api/activity.api";
import * as m12 from "./workflow/shared/api/contracts.api";
import * as m13 from "./workflow/shared/api/tasks.api";
import {
  Injectable,
  Inject,
  Controller,
  Post,
  Param,
  Body,
  Req,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { Repository } from "./common/repository";
import { BaseService } from "./common/services/base.service";
import type { Actor, SessionRequest } from "./common/types";
import { db } from "./workflow/shared/mock/db";
import { milestoneDb } from "./workflow/features/milestones/mock/seed";
import { signingDb } from "./workflow/features/signing/mock/signingDb";
import {
  exportDraft,
  restoreDraft,
} from "./workflow/features/contracts/api/contractDraft.api";
import {
  exportDisputes,
  restoreDisputes,
} from "./workflow/features/disputes/api/dispute.api";
const modules: Record<string, Record<string, (...args: any[]) => any>> = {
  "contracts-contractDraft": {
    getContractDraft: m0.getContractDraft,
    getUploadFormOptions: m0.getUploadFormOptions,
    saveContractDraft: m0.saveContractDraft,
  },
  "contracts-contractList": { getContractList: m1.getContractList },
  "signing-digitization": {
    getDigitization: m2.getDigitization,
    confirmDigitization: m2.confirmDigitization,
  },
  "signing-signingConfig": {
    getSigningConfig: m3.getSigningConfig,
    getDefaultSignatureSlots: m3.getDefaultSignatureSlots,
    saveSignatureSlots: m3.saveSignatureSlots,
    getSigningOverview: m3.getSigningOverview,
  },
  "signing-signingFlow": {
    getSigningRequest: m4.getSigningRequest,
    sendSigningRequest: m4.sendSigningRequest,
    confirmSigningRequest: m4.confirmSigningRequest,
    rejectSigningRequest: m4.rejectSigningRequest,
    cancelSigningRequest: m4.cancelSigningRequest,
    cancelSigning: m4.cancelSigning,
  },
  "signing-verification": { getVerification: m5.getVerification },
  "milestones-approvals": {
    getApprovalView: m6.getApprovalView,
    markDocumentViewed: m6.markDocumentViewed,
    castVote: m6.castVote,
  },
  "milestones-contracts": {
    getContractOverview: m7.getContractOverview,
    getDecisionView: m7.getDecisionView,
    transferToAccounting: m7.transferToAccounting,
  },
  "milestones-evidence": {
    getEvidenceWorkspace: m8.getEvidenceWorkspace,
    attachEvidenceFile: m8.attachEvidenceFile,
    removeEvidenceFile: m8.removeEvidenceFile,
    signAndSubmitEvidence: m8.signAndSubmitEvidence,
  },
  "milestones-tasks": { getTaskInbox: m9.getTaskInbox },
  "disputes-dispute": {
    getDispute: m10.getDispute,
    resolveDispute: m10.resolveDispute,
  },
  "audit-activity": {
    listActivityEntries: m11.listActivityEntries,
    getDefaultActivityRange: m11.getDefaultActivityRange,
  },
  "shared-contracts": {
    listContractSummaries: m12.listContractSummaries,
    getContractSummary: m12.getContractSummary,
    listOrganizations: m12.listOrganizations,
  },
  "shared-tasks": { getPendingTaskCount: m13.getPendingTaskCount },
};
const snapshot = () =>
  structuredClone({
    db,
    milestoneDb,
    signingDb,
    draft: exportDraft(),
    disputes: exportDisputes(),
  });
function restore(state: ReturnType<typeof snapshot>) {
  Object.assign(db, state.db);
  Object.assign(milestoneDb, state.milestoneDb);
  Object.assign(signingDb, state.signingDb);
  restoreDraft(state.draft);
  restoreDisputes(state.disputes);
}
@Injectable()
export class WorkflowService {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    @Inject(Repository) private repo: Repository,
    @Inject(BaseService) private base: BaseService,
  ) {}
  private scope(id: string, actor: Actor) {
    const contract = db.contractSummaries.find((x) => x.code === id);
    if (!contract) throw new NotFoundException("CONTRACT_NOT_FOUND");
    if (
      actor.role === "SUPPLIER"
        ? contract.supplierId !== actor.organizationId
        : actor.role !== "ADMIN_AUDITOR" &&
          actor.organizationId !== "org-nova-an"
    )
      throw new ForbiddenException("CONTRACT_ACCESS_DENIED");
  }
  call(module: string, action: string, input: unknown, actor: Actor) {
    const task = this.queue.then(async () => {
      const stored = (await this.repo.list("workflow-state"))[0];
      const expectedVersion = stored?.version ?? 0;
      if (stored?.state) restore(stored.state as ReturnType<typeof snapshot>);
      if (
        !Object.hasOwn(modules, module) ||
        !Object.hasOwn(modules[module], action)
      )
        throw new NotFoundException("ACTION_NOT_FOUND");
      const fn = modules[module]?.[action];
      if (!fn) throw new NotFoundException("ACTION_NOT_FOUND");
      const raw = (input as { args?: unknown[] })?.args;
      if (!Array.isArray(raw) || raw.length > 6)
        throw new BadRequestException("INVALID_ARGUMENTS");
      const args: any[] = structuredClone(raw);
      if (module === "contracts-contractList")
        args[0] = {
          id: actor.id,
          role: actor.role,
          organizationId: actor.organizationId,
        };
      if (
        [
          "getTaskInbox",
          "getPendingTaskCount",
          "getEvidenceWorkspace",
          "getApprovalView",
        ].includes(action)
      )
        args[0] = actor.id;
      if (action === "getApprovalView") {
        if (
          !["CONTRACT_OWNER", "FINANCE_APPROVER", "ADMIN_AUDITOR"].includes(
            actor.role,
          )
        )
          throw new ForbiddenException();
        args[1] = actor.role;
      }
      if (action === "getSigningOverview") args[1] = actor.id;
      if (action === "getUploadFormOptions") args[0] = actor.organizationId;
      const reference =
        typeof args[0] === "string" && args[0].startsWith("CT")
          ? args[0]
          : args[0] && typeof args[0] === "object"
            ? (args[0].contractId ?? args[0].contractCode ?? args[0].code)
            : action === "getApprovalView"
              ? args[2]
              : action === "getEvidenceWorkspace"
                ? args[1]
                : undefined;
      if (reference) this.scope(reference, actor);
      if (module === "contracts-contractDraft" && actor.role === "SUPPLIER")
        throw new ForbiddenException("ACTION_FORBIDDEN");
      if (action === "castVote" && args[0] && typeof args[0] === "object") {
        const approval =
          milestoneDb.approvalCases[
            `${args[0].contractId}:${args[0].milestoneNo}`
          ];
        if (approval?.votes.some((vote) => vote.userId === actor.id))
          throw new ConflictException("ALREADY_VOTED");
      }
      const writes = !/^(get|list)/.test(action);
      if (writes) {
        const allowed =
          action === "castVote"
            ? ["CONTRACT_OWNER", "FINANCE_APPROVER"]
            : [
                  "attachEvidenceFile",
                  "removeEvidenceFile",
                  "signAndSubmitEvidence",
                ].includes(action)
              ? ["SUPPLIER"]
              : action === "transferToAccounting"
                ? ["FINANCE_APPROVER"]
                : [
                      "sendSigningRequest",
                      "confirmSigningRequest",
                      "rejectSigningRequest",
                      "cancelSigningRequest",
                    ].includes(action)
                  ? ["CONTRACT_OWNER", "SUPPLIER"]
                  : action === "markDocumentViewed"
                    ? ["CONTRACT_OWNER", "FINANCE_APPROVER", "ADMIN_AUDITOR"]
                    : action === "resolveDispute" || action === "cancelSigning"
                      ? ["CONTRACT_OWNER"]
                      : ["CONTRACT_OWNER", "LEGAL_REVIEWER"];
        if (!allowed.includes(actor.role))
          throw new ForbiddenException("ACTION_FORBIDDEN");
        if (["castVote", "signAndSubmitEvidence"].includes(action)) {
          if (!args[0] || typeof args[0] !== "object")
            throw new BadRequestException("INVALID_INPUT");
          args[0] = {
            ...args[0],
            userId: actor.id,
            role: actor.role,
            actorName: actor.displayName,
            signerName: actor.displayName,
          };
        }
        if (
          action === "castVote" &&
          !["APPROVE", "HOLD", "REJECT"].includes(args[0].choice)
        )
          throw new BadRequestException("INVALID_VOTE");
        if (action === "resolveDispute") {
          if (
            !args[0] ||
            ![
              "ACCEPT_WAIVE_PENALTY",
              "KEEP_PENALTY",
              "REQUEST_MORE_EVIDENCE",
            ].includes(args[0].option)
          )
            throw new BadRequestException("INVALID_RESOLUTION");
          args[0].actor = { id: actor.id, displayName: actor.displayName };
        }
        if (
          action === "attachEvidenceFile" &&
          (!args[0] ||
            typeof args[0].fileName !== "string" ||
            args[0].fileName.length > 255 ||
            typeof args[0].sizeMb !== "number" ||
            args[0].sizeMb < 0 ||
            args[0].sizeMb > 20)
        )
          throw new BadRequestException("INVALID_FILE");
        if (
          [
            "sendSigningRequest",
            "confirmSigningRequest",
            "rejectSigningRequest",
            "cancelSigningRequest",
          ].includes(action)
        ) {
          const stored = signingDb.contracts[args[0]];
          const step = stored?.steps.find((x) => x.stepNo === args[1]);
          if (step?.signerUserId !== actor.id)
            throw new ForbiddenException("NOT_ASSIGNED_SIGNER");
        }
      }
      const before = snapshot();
      try {
        let result = await fn(...args);
        if (action === "listActivityEntries") {
          const log = (await this.repo.list("audit")).filter(
            (entry) =>
              String(entry.recordId).startsWith("CT") &&
              !/^(get|list)/.test(String(entry.action)),
          );
          const users = await this.repo.list("users");
          result = [
            ...result,
            ...log.map((entry) => {
              const user =
                users.find((user) => user.id === entry.actorId) ??
                (entry.actorId === actor.id ? actor : undefined);
              const module = String(entry.resource);
              return {
                id: entry.id,
                at: entry.createdAt,
                actor: {
                  id: entry.actorId,
                  displayName: user?.displayName ?? entry.actorId,
                  role:
                    user?.role === "LEGAL_REVIEWER"
                      ? "LEGAL"
                      : (user?.role ?? "SYSTEM"),
                },
                category: module.startsWith("signing")
                  ? "SIGN"
                  : module.startsWith("disputes")
                    ? "DISPUTE"
                    : module.endsWith("approvals")
                      ? "APPROVAL"
                      : module.endsWith("evidence")
                        ? "EVIDENCE"
                        : "SYSTEM",
                action: { kind: "WORKFLOW_ACTION", code: entry.action },
                contractCode: entry.recordId,
              };
            }),
          ];
        }
        if (action === "getDefaultActivityRange")
          result = { ...result, to: new Date().toISOString().slice(0, 10) };

        if (result && typeof result === "object") {
          const id = result.contractId ?? result.contractCode;
          if (id) this.scope(id, actor);
        }
        if (
          actor.role === "SUPPLIER" &&
          ["listContractSummaries", "listActivityEntries"].includes(action)
        )
          result = result.filter((item: any) => {
            const id = item.code ?? item.contractCode;
            return db.contractSummaries.some(
              (c) => c.code === id && c.supplierId === actor.organizationId,
            );
          });
        const state = snapshot();
        if (writes || JSON.stringify(before) !== JSON.stringify(state)) {
          const now = new Date().toISOString();
          await this.repo.mutate(
            "workflow-state",
            (items) => {
              const previous = items[0];
              if ((previous?.version ?? 0) !== expectedVersion)
                throw new ConflictException("WORKFLOW_VERSION_CONFLICT");
              items.splice(0, items.length, {
                id: "workflow",
                state,
                version: (previous?.version ?? 0) + 1,
                createdAt: previous?.createdAt ?? now,
                updatedAt: now,
              });
            },
            this.base.auditRecord(
              action,
              module,
              String(reference ?? ""),
              actor,
            ),
          );
        }
        return structuredClone(result);
      } catch (error) {
        restore(before);
        if (
          error instanceof Error &&
          error.name === "Error" &&
          /^[A-Z_]+$/.test(error.message)
        )
          throw new BadRequestException(error.message);
        throw error;
      }
    });
    this.queue = task.catch(() => {});
    return task;
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
