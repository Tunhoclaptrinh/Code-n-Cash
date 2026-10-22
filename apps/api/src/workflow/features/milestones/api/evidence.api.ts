import { ApiError, simulateLatency } from "../../../shared/api/client";
import { adjustPendingTaskCount } from "../../../shared/api/tasks.api";
import { daysBetween } from "../lib/dates";
import { evaluateProposal, type Proposal } from "../lib/engine";
import { businessTimestamp, businessToday, milestoneDb } from "../mock/seed";
import type {
  ApprovalCase,
  EvidenceFile,
  EvidenceType,
  Milestone,
} from "../types";
import { findMilestone, keyOf, resolveRef } from "./store";

export interface EvidenceWorkspace {
  contractId: string;
  milestone: Milestone;
  overdueDays: number;
  /** What the penalty would be if the milestone stays late; shown before the supplier submits. */
  penaltyEstimate: Proposal;
  approverCount: number;
  files: EvidenceFile[];
  /** True once every required type has a file and nothing else blocks submission. */
  canSubmit: boolean;
}

function draftOf(contractId: string, milestoneNo: number): EvidenceFile[] {
  return (milestoneDb.evidenceDraft[keyOf(contractId, milestoneNo)] ??= []);
}

export async function getEvidenceWorkspace(
  userId: string,
  contractId?: string,
  milestoneNo?: number,
): Promise<EvidenceWorkspace> {
  const ref = resolveRef(userId, "SUBMIT_EVIDENCE", contractId, milestoneNo);
  const milestone = findMilestone(ref.contractId, ref.milestoneNo);
  const files = draftOf(ref.contractId, ref.milestoneNo);
  const overdueDays = Math.max(
    0,
    daysBetween(milestone.dueDate, businessToday()),
  );
  const approvalCase =
    milestoneDb.approvalCases[keyOf(ref.contractId, ref.milestoneNo)];
  return simulateLatency({
    contractId: ref.contractId,
    milestone,
    overdueDays,
    penaltyEstimate: evaluateProposal(milestone, overdueDays),
    approverCount: approvalCase?.policy.quorum ?? 2,
    files,
    canSubmit: milestone.requiredEvidence.every((type) =>
      files.some((file) => file.type === type),
    ),
  });
}

export interface AttachEvidenceInput {
  contractId: string;
  milestoneNo: number;
  type: EvidenceType;
  fileName: string;
  sizeMb: number;
}

export async function attachEvidenceFile(
  input: AttachEvidenceInput,
): Promise<EvidenceFile> {
  const files = draftOf(input.contractId, input.milestoneNo);
  const isRequired = findMilestone(
    input.contractId,
    input.milestoneNo,
  ).requiredEvidence.includes(input.type);
  if (isRequired && files.some((file) => file.type === input.type))
    throw new ApiError("EVIDENCE_ALREADY_ATTACHED");
  const file: EvidenceFile = {
    id: `f-${Date.now().toString(36)}-${files.length}`,
    type: input.type,
    fileName: input.fileName,
    sizeMb: input.sizeMb,
    signingMethod: "VIETTEL_MYSIGN",
  };
  files.push(file);
  return simulateLatency(file);
}

export async function removeEvidenceFile(
  contractId: string,
  milestoneNo: number,
  fileId: string,
): Promise<void> {
  const files = draftOf(contractId, milestoneNo);
  const index = files.findIndex((file) => file.id === fileId);
  if (index < 0) throw new ApiError("EVIDENCE_NOT_FOUND");
  if (files[index].signature) throw new ApiError("EVIDENCE_LOCKED");
  files.splice(index, 1);
  return simulateLatency(undefined);
}

export interface SubmitEvidenceInput {
  userId: string;
  signerName: string;
  contractId: string;
  milestoneNo: number;
}

/** Signs every unsigned file, hands the package to the approvers and closes the supplier's task. */
export async function signAndSubmitEvidence(
  input: SubmitEvidenceInput,
): Promise<void> {
  const { contractId, milestoneNo } = input;
  const milestone = findMilestone(contractId, milestoneNo);
  const files = draftOf(contractId, milestoneNo);
  if (
    !milestone.requiredEvidence.every((type) =>
      files.some((file) => file.type === type),
    )
  ) {
    throw new ApiError("EVIDENCE_INCOMPLETE");
  }

  const now = businessTimestamp();
  const history = (milestoneDb.history[keyOf(contractId, milestoneNo)] ??= []);
  for (const file of files) {
    if (file.signature) continue;
    file.signature = {
      signerName: input.signerName,
      signedAt: now,
      valid: true,
    };
    history.push({
      at: now,
      category: "SIGNATURE",
      kind: "DOCUMENT_SIGNED",
      actorName: input.signerName,
      document: file.type,
    });
  }

  const lateDays = Math.max(0, daysBetween(milestone.dueDate, businessToday()));
  const proposal = evaluateProposal(milestone, lateDays);
  history.push({
    at: now,
    category: "SYSTEM",
    kind: "EVIDENCE_RECEIVED",
    code: proposal.code,
    penaltyMillion: proposal.penaltyMillion,
  });

  const key = keyOf(contractId, milestoneNo);
  const existing = milestoneDb.approvalCases[key];
  const documents = files.map((file) => ({ ...file, viewedByApprover: false }));
  const fresh: ApprovalCase = existing
    ? { ...existing, documents }
    : {
        contractId,
        milestoneNo,
        status: "OPEN",
        policy: {
          requiredRoles: ["CONTRACT_OWNER", "FINANCE_APPROVER"],
          quorum: 2,
          hasOptionalSecondApprover: true,
        },
        documents,
        votes: [],
      };
  if (existing?.status === "CLOSED") fresh.votes = [];
  fresh.status = "OPEN";
  milestoneDb.approvalCases[key] = fresh;
  delete milestoneDb.decisions[key];

  milestone.status = "AWAITING_APPROVAL";
  milestone.deliveredOn = businessToday();

  for (const task of milestoneDb.tasks) {
    const isSupplierTask =
      task.userId === input.userId &&
      task.status === "OPEN" &&
      (task.kind === "SUBMIT_EVIDENCE" || task.kind === "RESUBMIT_EVIDENCE") &&
      task.contractId === contractId &&
      task.milestoneNo === milestoneNo;
    if (isSupplierTask) {
      task.status = "DONE";
      adjustPendingTaskCount(input.userId, -1);
    }
  }

  const alreadyAssigned = milestoneDb.tasks.some(
    (task) =>
      task.kind === "APPROVE_PAYMENT" &&
      task.status === "OPEN" &&
      task.contractId === contractId &&
      task.milestoneNo === milestoneNo,
  );
  if (!alreadyAssigned) {
    milestoneDb.tasks.push({
      id: `t-approve-${contractId.toLowerCase()}-${milestoneNo}-${Date.now().toString(36)}`,
      userId: "u-finance",
      kind: "APPROVE_PAYMENT",
      status: "OPEN",
      contractId,
      milestoneNo,
      milestoneKind: milestone.kind,
      dueDate: now.slice(0, 10),
      requirements: milestone.requiredEvidence,
      target: { screen: "APPROVAL", contractId, milestoneNo },
    });
    adjustPendingTaskCount("u-finance", 1);
  }
  return simulateLatency(undefined);
}
