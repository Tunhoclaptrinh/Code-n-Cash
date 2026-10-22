import { db } from "../mock/db";
import { ApiError, simulateLatency } from "./client";
import type { ContractSummary, Organization } from "./types";

/** Contract summaries visible to everyone in the demo organisation; screens filter further by role. */
export async function listContractSummaries(): Promise<ContractSummary[]> {
  return simulateLatency(db.contractSummaries);
}

export async function getContractSummary(
  contractCode: string,
): Promise<ContractSummary> {
  const summary = db.contractSummaries.find(
    (candidate) => candidate.code === contractCode,
  );
  if (!summary) throw new ApiError("CONTRACT_NOT_FOUND");
  return simulateLatency(summary);
}

/** Shared write path so every feature updates the contract list the same way. */
export async function updateContractSummary(
  contractCode: string,
  patch: Partial<Omit<ContractSummary, "code">>,
): Promise<ContractSummary> {
  const index = db.contractSummaries.findIndex(
    (candidate) => candidate.code === contractCode,
  );
  if (index < 0) throw new ApiError("CONTRACT_NOT_FOUND");
  db.contractSummaries[index] = { ...db.contractSummaries[index], ...patch };
  return simulateLatency(db.contractSummaries[index]);
}

export async function listOrganizations(): Promise<Organization[]> {
  return simulateLatency(db.organizations);
}
