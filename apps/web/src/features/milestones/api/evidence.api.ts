import { workflowCall } from "@/shared/api/workflow";
import { type Proposal } from "../lib/engine";
import type { EvidenceFile, EvidenceType, Milestone } from "../types";
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
export async function getEvidenceWorkspace(
  userId: string,
  contractId?: string,
  milestoneNo?: number,
): Promise<EvidenceWorkspace> {
  return workflowCall("milestones-evidence", "getEvidenceWorkspace", [
    userId,
    contractId,
    milestoneNo,
  ]);
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
  return workflowCall("milestones-evidence", "attachEvidenceFile", [input]);
}
export async function removeEvidenceFile(
  contractId: string,
  milestoneNo: number,
  fileId: string,
): Promise<void> {
  return workflowCall("milestones-evidence", "removeEvidenceFile", [
    contractId,
    milestoneNo,
    fileId,
  ]);
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
  return workflowCall("milestones-evidence", "signAndSubmitEvidence", [input]);
}
