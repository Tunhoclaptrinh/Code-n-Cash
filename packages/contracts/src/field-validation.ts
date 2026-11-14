/** Shared field constraints used by API validation and inline form feedback. */
export interface FieldRule {
  key: string;
  type: string;
  required?: boolean;
  options?: string[];
  min?: number;
  max?: number;
  integer?: boolean;
  maxLength?: number;
  pattern?: string;
}

export function normalizeField(field: FieldRule, value: unknown): unknown {
  if (typeof value !== "string") return value;
  const text = value.trim();
  return field.type === "email" ? text.toLowerCase() : text;
}

export function fieldProblem(field: FieldRule, raw: unknown): string | null {
  const value = normalizeField(field, raw);
  if (value === undefined || value === null || value === "")
    return field.required ? `REQUIRED:${field.key}` : null;
  if (field.type === "number") {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < (field.min ?? 0) ||
      (field.max !== undefined && value > field.max) ||
      (field.integer && !Number.isInteger(value))
    )
      return `INVALID_NUMBER:${field.key}`;
  } else if (field.type === "boolean") {
    if (typeof value !== "boolean") return `INVALID_BOOLEAN:${field.key}`;
  } else {
    if (typeof value !== "string" || value.length > (field.maxLength ?? 2000))
      return `INVALID_STRING:${field.key}`;
    if (field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
      return "INVALID_EMAIL";
    if (field.options && !field.options.includes(value))
      return `INVALID_OPTION:${field.key}`;
    if (field.pattern && !new RegExp(field.pattern).test(value))
      return `INVALID_STRING:${field.key}`;
  }
  return null;
}

export function exactDecimal(
  value: unknown,
  max: string,
  positive = false,
): boolean {
  if (
    typeof value !== "string" ||
    value.length > 24 ||
    !/^\d+(?:[.,]\d{1,2})?$/.test(value.trim())
  )
    return false;
  const cents = (text: string) => {
    const [whole, fraction = ""] = text.replace(",", ".").split(".");
    return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  };
  const amount = cents(value.trim());
  return amount <= cents(max) && (!positive || amount > 0n);
}

export function validIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(value);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

/**
 * Luật Thương mại 2005, Điều 301: in a commercial contract the penalty may not exceed 8% of the
 * value of the breached obligation. Every contract type drafted here is commerce between
 * traders (goods, services, software, maintenance), so the cap applies to all of them.
 */
export const LEGAL_PENALTY_CAP_PCT = "8";

export function draftProblems(input: {
  title: string;
  valueMillion: string;
  startDate: string;
  endDate: string;
  graceDays: number;
  penaltyRatePct: string;
  maxPenaltyPct: string;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  if (typeof input.title !== "string" || !input.title.trim())
    errors.title = "TITLE_REQUIRED";
  else if (input.title.trim().length > 250) errors.title = "INVALID_TITLE";
  if (!exactDecimal(input.valueMillion, "1000000", true))
    errors.valueMillion = "INVALID_VALUE";
  if (!validIsoDate(input.startDate)) errors.startDate = "INVALID_DATES";
  if (
    !validIsoDate(input.endDate) ||
    // Milestones are spread over the period, so it must last at least a day.
    (validIsoDate(input.startDate) && input.endDate <= input.startDate)
  )
    errors.endDate = "INVALID_DATES";
  if (
    !Number.isInteger(input.graceDays) ||
    input.graceDays < 0 ||
    input.graceDays > 60
  )
    errors.graceDays = "INVALID_PENALTY";
  if (!exactDecimal(input.penaltyRatePct, "5"))
    errors.penaltyRatePct = "INVALID_PENALTY";
  if (!exactDecimal(input.maxPenaltyPct, "100"))
    errors.maxPenaltyPct = "INVALID_PENALTY";
  else if (!exactDecimal(input.maxPenaltyPct, LEGAL_PENALTY_CAP_PCT))
    errors.maxPenaltyPct = "PENALTY_OVER_LEGAL_CAP";
  // A daily rate with a zero cap (or a cap with no rate) states a penalty that can never apply.
  const zero = (value: string) => /^0+(?:[.,]0+)?$/.test(value.trim());
  if (
    !errors.penaltyRatePct &&
    !errors.maxPenaltyPct &&
    zero(input.penaltyRatePct) !== zero(input.maxPenaltyPct)
  )
    errors.maxPenaltyPct = "PENALTY_INCONSISTENT";
  return errors;
}

/**
 * Format checks of an invoice's own data (Thông tư 78/2021/TT-BTC): template symbol of seven
 * characters (kind 1-9, C or K, two-digit year, type letter, two letters of the seller), a number
 * of at most eight digits, a real issue date in the symbol's year, a tax code of ten digits (with
 * a three-digit branch suffix) or a twelve-digit personal number, and a positive total. Shared by
 * the API and the form; the API adds the checks that need the contract (amount, dates, duplicates).
 */
export function invoiceProblems(input: {
  symbol?: unknown;
  number?: unknown;
  issueDate?: unknown;
  sellerTaxCode?: unknown;
  amountMillion?: unknown;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  const symbol = typeof input.symbol === "string" ? input.symbol.trim() : "";
  if (!/^[1-9][CK]\d{2}[TDLMNBGH][A-Z]{2}$/.test(symbol))
    errors.symbol = "INVOICE_SYMBOL_INVALID";
  const number = typeof input.number === "string" ? input.number.trim() : "";
  if (!/^\d{1,8}$/.test(number) || /^0+$/.test(number))
    errors.number = "INVOICE_NUMBER_INVALID";
  if (!validIsoDate(input.issueDate)) errors.issueDate = "INVOICE_DATE_INVALID";
  else if (!errors.symbol && input.issueDate.slice(2, 4) !== symbol.slice(2, 4))
    errors.issueDate = "INVOICE_YEAR_MISMATCH";
  const taxCode =
    typeof input.sellerTaxCode === "string" ? input.sellerTaxCode.trim() : "";
  if (!/^(\d{10}(-\d{3})?|\d{12})$/.test(taxCode))
    errors.sellerTaxCode = "INVOICE_TAX_CODE_INVALID";
  if (!exactDecimal(input.amountMillion, "1000000", true))
    errors.amountMillion = "INVOICE_AMOUNT_INVALID";
  return errors;
}
