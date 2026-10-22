import { ApiError, simulateLatency } from "../../../shared/api/client";
import { getContractSummary } from "../../../shared/api/contracts.api";
import { signingDb } from "../mock/signingDb";
import type { FileCheckResult, VerificationResult } from "../types";
import { storedSigning } from "./signingConfig.api";

export async function getVerification(
  contractCode: string,
): Promise<VerificationResult> {
  const stored = storedSigning(contractCode);
  const summary = await getContractSummary(contractCode);
  const signatures = [...(signingDb.verifications[contractCode] ?? [])].sort(
    (a, b) => a.stepNo - b.stepNo,
  );
  const complete =
    signatures.length >= stored.steps.length &&
    signatures.every((s) => s.status === "VALID");
  const latest = Math.max(
    ...signatures.map((signature) => new Date(signature.signedAt).getTime()),
  );
  return simulateLatency(
    {
      contractCode,
      stepCount: stored.steps.length,
      signatures,
      effectiveAt: complete ? new Date(latest).toISOString() : null,
      milestonesOpened: summary.milestonesTotal,
    },
    40,
  );
}

/** Checks a file chosen by a third party by looking for embedded PDF signature dictionaries. */
export async function checkFile(
  contractCode: string | null,
  file: File,
): Promise<FileCheckResult> {
  const head = await file.slice(0, 5).text();
  if (head !== "%PDF-") throw new ApiError("NOT_PDF");
  const known = contractCode ? signingDb.contracts[contractCode] : undefined;
  if (known && known.fileName === file.name) {
    const count = signingDb.verifications[known.contractCode]?.length ?? 0;
    return simulateLatency(
      { outcome: count > 0 ? "VALID" : "NO_SIGNATURE", signatureCount: count },
      300,
    );
  }
  const text = await file.text();
  const count = (text.match(/\/ByteRange/g) ?? []).length;
  return simulateLatency(
    { outcome: count > 0 ? "VALID" : "NO_SIGNATURE", signatureCount: count },
    300,
  );
}
