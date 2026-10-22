import { ApiError, simulateLatency } from "../../../shared/api/client";
import { getContractSummary } from "../../../shared/api/contracts.api";
import { signingDb } from "../mock/signingDb";
import type { Digitization } from "../types";

function storedDigitization(contractCode: string): Digitization {
  const stored = signingDb.digitizations[contractCode];
  if (!stored) throw new ApiError("CONTRACT_NOT_FOUND");
  return stored;
}

export async function getDigitization(
  contractCode: string,
): Promise<Digitization> {
  const stored = storedDigitization(contractCode);
  const summary = await getContractSummary(contractCode);
  return simulateLatency(
    { ...stored, contractValueMillion: summary.valueMillion },
    40,
  );
}

export interface ConfirmDigitizationInput {
  /** Due date (ISO) for the milestone that needed confirmation; null leaves it open, so the milestone stays on HOLD. */
  dueDate: string | null;
}

/** Locks the digitised terms. Changing them afterwards needs a new version and new signatures. */
export async function confirmDigitization(
  contractCode: string,
  input: ConfirmDigitizationInput,
): Promise<Digitization> {
  const stored = storedDigitization(contractCode);
  for (const milestone of stored.milestones) {
    if (milestone.source !== "NEEDS_CONFIRMATION") continue;
    milestone.dueDate = input.dueDate;
    milestone.source = "CONFIRMED";
  }
  stored.locked = true;
  return simulateLatency(stored);
}
