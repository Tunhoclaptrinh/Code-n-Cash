export { confirmDigitization, getDigitization } from "@/shared/api/domain";

export interface ConfirmDigitizationInput {
  /** Due date (ISO) of the milestone that needed confirmation; null keeps it open and the engine holds it (rule 80). */
  dueDate: string | null;
}
