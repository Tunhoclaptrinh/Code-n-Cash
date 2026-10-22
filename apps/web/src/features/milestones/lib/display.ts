import type { TFunction } from "i18next";
import { formatDate, formatTime } from "@/shared/lib/format";
import type { EvidenceType } from "../types";

/** "03/07 09:14": day and month (the first five characters of the localised date) followed by the time. */
export function formatShortDateTime(value: string): string {
  return `${formatDate(value).slice(0, 5)} ${formatTime(value)}`;
}

export function lowerCase(value: string, language: string): string {
  return value.toLocaleLowerCase(language);
}

/** Capitalised number word ("Hai") for small counts, falling back to the digits. */
export function numberWord(t: TFunction<"milestones">, value: number): string {
  return t(`numberWord.${value}`, { defaultValue: String(value) });
}

export function evidenceName(
  t: TFunction<"milestones">,
  type: EvidenceType | "OWN_DIGITAL_SIGNATURE",
): string {
  return t(`evidenceType.${type}`);
}
