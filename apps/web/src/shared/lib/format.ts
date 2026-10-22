import i18n from "@/i18n";

const locale = () => (i18n.language?.startsWith("vi") ? "vi-VN" : "en-US");

/** Money in this product is always expressed in millions of VND with two decimals. */
export function formatMillionVnd(value: number): string {
  return new Intl.NumberFormat(locale(), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

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
