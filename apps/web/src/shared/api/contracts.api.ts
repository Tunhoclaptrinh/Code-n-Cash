import { workflowCall } from "@/shared/api/workflow";
import type { ContractSummary, Organization } from "./types";
/** Contract summaries visible to everyone in the demo organisation; screens filter further by role. */
export async function listContractSummaries(): Promise<ContractSummary[]> {
  return workflowCall("shared-contracts", "listContractSummaries", []);
}
export async function getContractSummary(
  contractCode: string,
): Promise<ContractSummary> {
  return workflowCall("shared-contracts", "getContractSummary", [contractCode]);
}
/** Shared write path so every feature updates the contract list the same way. */
export async function listOrganizations(): Promise<Organization[]> {
  return workflowCall("shared-contracts", "listOrganizations", []);
}
