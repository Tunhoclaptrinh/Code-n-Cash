import i18n from "@/i18n";

const locale = () => (i18n.language?.startsWith("vi") ? "vi-VN" : "en-US");

export function formatNumber(value: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat(locale(), { maximumFractionDigits }).format(
    value,
  );
}

export function formatDate(value: string | Date): string {
  return new Intl.DateTimeFormat(locale(), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

export function formatTime(value: string | Date): string {
  return new Intl.DateTimeFormat(locale(), {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function formatDateTime(value: string | Date): string {
  return `${formatDate(value)} ${formatTime(value)}`;
}

/**
 * Groups a decimal string such as "365785.87" for display without converting it to a float,
 * so Data Pack amounts keep the exact digits the engine produced.
 */
export function formatDecimalString(value: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) return value;
  const [, sign, whole, fraction] = match;
  const format = new Intl.NumberFormat(locale());
  const decimal =
    format.formatToParts(1.1).find((part) => part.type === "decimal")?.value ??
    ".";
  return `${sign}${format.format(BigInt(whole))}${fraction ? decimal + fraction : ""}`;
}

/** Exact sum of decimal strings ("1290.00" + "0.10"), computed in hundredths without floats. */
export function sumDecimalStrings(values: string[]): string {
  const cents = values.reduce((total, value) => {
    const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
    if (!match) return total;
    const amount =
      BigInt(match[2]) * 100n + BigInt((match[3] ?? "").padEnd(2, "0"));
    return total + (match[1] ? -amount : amount);
  }, 0n);
  const sign = cents < 0n ? "-" : "";
  const abs = cents < 0n ? -cents : cents;
  return `${sign}${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`;
}
