import { ApiError } from "@/shared/api/client";
import { workflowCall } from "@/shared/api/workflow";
import type { FileCheckResult, VerificationResult } from "../types";
export async function getVerification(
  contractCode: string,
): Promise<VerificationResult> {
  return workflowCall("signing-verification", "getVerification", [
    contractCode,
  ]);
}
/** A PDF marker is not cryptographic verification. A provider must verify the signed byte ranges. */
export async function checkFile(
  _contractCode: string | null,
  file: File,
): Promise<FileCheckResult> {
  if ((await file.slice(0, 5).text()) !== "%PDF-")
    throw new ApiError("NOT_PDF");
  const count = ((await file.text()).match(/\/ByteRange/g) ?? []).length;
  return {
    outcome: count ? "UNVERIFIED" : "NO_SIGNATURE",
    signatureCount: count,
  };
}
