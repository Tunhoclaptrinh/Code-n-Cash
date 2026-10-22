import { workflowCall } from "@/shared/api/workflow";
import { type Proposal } from "../lib/engine";
import type {
  ContractOverview,
  EvidenceFile,
  HistoryEvent,
  Milestone,
  MilestoneDecision,
} from "../types";
export async function getContractOverview(
  contractId: string,
): Promise<ContractOverview> {
  return workflowCall("milestones-contracts", "getContractOverview", [
    contractId,
  ]);
}
export interface DecisionView {
  contractId: string;
  contractTitle: string;
  supplierName: string;
  milestone: Milestone;
  decision: MilestoneDecision;
  /** Penalty working shown in the amount table. */
  calculation: Proposal;
  documents: EvidenceFile[];
  history: HistoryEvent[];
  disputeWindowDays: number;
}
export async function getDecisionView(
  contractId: string,
  milestoneNo: number,
): Promise<DecisionView | null> {
  return workflowCall("milestones-contracts", "getDecisionView", [
    contractId,
    milestoneNo,
  ]);
}
/** Marks the decision as handed to accounting; the payment order itself is outside this app. */
export async function transferToAccounting(
  contractId: string,
  milestoneNo: number,
): Promise<void> {
  return workflowCall("milestones-contracts", "transferToAccounting", [
    contractId,
    milestoneNo,
  ]);
}
