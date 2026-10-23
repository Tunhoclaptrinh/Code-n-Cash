import { ApiError } from "@/shared/api/client";
import type { FileCheckResult } from "../types";

export { getVerification } from "@/shared/api/domain";

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
