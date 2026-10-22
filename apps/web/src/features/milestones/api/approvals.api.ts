import type { Role } from "@/shared/api/types";
import { workflowCall } from "@/shared/api/workflow";
import { type Proposal } from "../lib/engine";
import type {
  ApprovalCase,
  ApprovalStepRole,
  EvidenceFile,
  Milestone,
  VoteChoice,
} from "../types";
export type ApprovalStepState =
  "APPROVED" | "HELD" | "REJECTED" | "CURRENT" | "PENDING";
export interface ApprovalStep {
  role: ApprovalStepRole;
  required: boolean;
  state: ApprovalStepState;
  /** Name of whoever acted, or of the person the step is assigned to. */
  personName?: string;
  /** True when this step is waiting for the signed-in user. */
  isYou: boolean;
  signedAt?: string;
}
export interface ApprovalView {
  contractId: string;
  milestone: Milestone;
  status: ApprovalCase["status"];
  proposal: Proposal;
  quorum: number;
  distinctRoles: number;
  steps: ApprovalStep[];
  documents: EvidenceFile[];
}
export async function getApprovalView(
  userId: string,
  userRole: Role,
  contractId?: string,
  milestoneNo?: number,
): Promise<ApprovalView> {
  return workflowCall("milestones-approvals", "getApprovalView", [
    userId,
    userRole,
    contractId,
    milestoneNo,
  ]);
}
export async function markDocumentViewed(
  contractId: string,
  milestoneNo: number,
  fileId: string,
): Promise<void> {
  return workflowCall("milestones-approvals", "markDocumentViewed", [
    contractId,
    milestoneNo,
    fileId,
  ]);
}
export interface CastVoteInput {
  userId: string;
  role: Role;
  actorName: string;
  contractId: string;
  milestoneNo: number;
  choice: VoteChoice;
  note?: string;
}
export interface CastVoteResult {
  /** True once the approvals reached a final decision; the caller then opens the decision screen. */
  finalized: boolean;
}
export async function castVote(input: CastVoteInput): Promise<CastVoteResult> {
  return workflowCall("milestones-approvals", "castVote", [input]);
}
