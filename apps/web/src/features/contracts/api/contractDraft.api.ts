import { workflowCall } from "@/shared/api/workflow";
import type { ContractDraft, UploadFormOptions } from "../types";
export async function getContractDraft(): Promise<ContractDraft> {
  return workflowCall("contracts-contractDraft", "getContractDraft", []);
}
export async function getUploadFormOptions(
  buyerOrganizationId: string,
): Promise<UploadFormOptions> {
  return workflowCall("contracts-contractDraft", "getUploadFormOptions", [
    buyerOrganizationId,
  ]);
}
/** Persists the wizard's step 1 and keeps the contract list in sync with the edited fields. */
export async function saveContractDraft(
  next: ContractDraft,
): Promise<ContractDraft> {
  return workflowCall("contracts-contractDraft", "saveContractDraft", [next]);
}
