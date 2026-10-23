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
    (validIsoDate(input.startDate) && input.endDate < input.startDate)
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
  return errors;
}
