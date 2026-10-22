import { workflowCall } from "@/shared/api/workflow";
import type { Dispute, ResolveDisputeInput } from "../types";
export async function getDispute(
  contractCode: string,
  milestoneNo: number,
): Promise<Dispute> {
  return workflowCall("disputes-dispute", "getDispute", [
    contractCode,
    milestoneNo,
  ]);
}
/**
 * Records the contract owner's decision on an open dispute.
 * Accepting or keeping the penalty closes the dispute and sends the milestone to payment approval;
 * asking for more evidence keeps it open and hands the work back to the supplier.
 */
export async function resolveDispute(
  input: ResolveDisputeInput,
): Promise<Dispute> {
  return workflowCall("disputes-dispute", "resolveDispute", [input]);
}
