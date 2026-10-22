import { workflowCall } from "@/shared/api/workflow";
import type { Digitization } from "../types";
export async function getDigitization(
  contractCode: string,
): Promise<Digitization> {
  return workflowCall("signing-digitization", "getDigitization", [
    contractCode,
  ]);
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
  return workflowCall("signing-digitization", "confirmDigitization", [
    contractCode,
    input,
  ]);
}
