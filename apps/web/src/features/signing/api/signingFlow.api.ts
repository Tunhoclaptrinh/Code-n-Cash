import { workflowCall } from "@/shared/api/workflow";
import type { SignMethod, SigningRequest } from "../types";
/** Reading a request also lets the simulated phone side progress (expiry, auto-confirmation). */
export async function getSigningRequest(
  contractCode: string,
  stepNo: number,
): Promise<SigningRequest | null> {
  return workflowCall("signing-signingFlow", "getSigningRequest", [
    contractCode,
    stepNo,
  ]);
}
export async function sendSigningRequest(
  contractCode: string,
  stepNo: number,
  method: SignMethod,
): Promise<SigningRequest> {
  return workflowCall("signing-signingFlow", "sendSigningRequest", [
    contractCode,
    stepNo,
    method,
  ]);
}
/** The signer approves on their phone. */
export async function confirmSigningRequest(
  contractCode: string,
  stepNo: number,
): Promise<SigningRequest> {
  return workflowCall("signing-signingFlow", "confirmSigningRequest", [
    contractCode,
    stepNo,
  ]);
}
/** The signer rejects on their phone. */
export async function rejectSigningRequest(
  contractCode: string,
  stepNo: number,
): Promise<SigningRequest> {
  return workflowCall("signing-signingFlow", "rejectSigningRequest", [
    contractCode,
    stepNo,
  ]);
}
/** The requester withdraws the pending request, which unlocks the file. */
export async function cancelSigningRequest(
  contractCode: string,
  stepNo: number,
): Promise<SigningRequest> {
  return workflowCall("signing-signingFlow", "cancelSigningRequest", [
    contractCode,
    stepNo,
  ]);
}
/** Cancels the whole signing sequence. Only possible while nobody has signed. */
export async function cancelSigning(contractCode: string): Promise<void> {
  return workflowCall("signing-signingFlow", "cancelSigning", [contractCode]);
}
