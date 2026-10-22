import { workflowCall } from "@/shared/api/workflow";
import type { SigningConfig, SigningOverview, SlotMap } from "../types";
export const signingKeys = {
  config: (contractCode: string) =>
    ["signing", "config", contractCode] as const,
  overview: (contractCode: string, userId: string) =>
    ["signing", "overview", contractCode, userId] as const,
  request: (contractCode: string, stepNo: number) =>
    ["signing", "request", contractCode, stepNo] as const,
  digitization: (contractCode: string) =>
    ["signing", "digitization", contractCode] as const,
  verification: (contractCode: string) =>
    ["signing", "verification", contractCode] as const,
};
export async function getSigningConfig(
  contractCode: string,
): Promise<SigningConfig> {
  return workflowCall("signing-signingConfig", "getSigningConfig", [
    contractCode,
  ]);
}
export async function getDefaultSignatureSlots(
  contractCode: string,
): Promise<SlotMap> {
  return workflowCall("signing-signingConfig", "getDefaultSignatureSlots", [
    contractCode,
  ]);
}
/** Persists the slot layout of a contract. A started signing sequence can no longer be changed. */
export async function saveSignatureSlots(
  contractCode: string,
  slots: SlotMap,
): Promise<SlotMap> {
  return workflowCall("signing-signingConfig", "saveSignatureSlots", [
    contractCode,
    slots,
  ]);
}
export async function getSigningOverview(
  contractCode: string,
  userId: string,
): Promise<SigningOverview> {
  return workflowCall("signing-signingConfig", "getSigningOverview", [
    contractCode,
    userId,
  ]);
}
