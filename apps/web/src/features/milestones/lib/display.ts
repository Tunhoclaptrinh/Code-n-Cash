import { formatDate, formatTime } from "@/shared/lib/format";

/** "03/07 09:14": day and month (the first five characters of the localised date) followed by the time. */
export function formatShortDateTime(value: string): string {
  return `${formatDate(value).slice(0, 5)} ${formatTime(value)}`;
}

export function lowerCase(value: string, language: string): string {
  return value.toLocaleLowerCase(language);
}
