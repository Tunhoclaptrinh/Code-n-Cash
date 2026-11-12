import { BadRequestException } from "@nestjs/common";
/** Only resource-declared fields may enter a filter; organization scope is applied independently. */
type Scalar = string | number | boolean;
const isScalar = (v: unknown): v is Scalar =>
  ["string", "number", "boolean"].includes(typeof v);

/**
 * `filters` of a resource list: field -> one value or a non-empty list of values (a record
 * matches any value of a field, and every field). Always returned as lists.
 */
export function parseFilters(
  raw: unknown,
  allowed: string[],
): Record<string, Scalar[]> {
  if (!raw) return {};
  let value: unknown;
  try {
    value = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    throw new BadRequestException("INVALID_FILTER");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new BadRequestException("INVALID_FILTER");
  const out: Record<string, Scalar[]> = {};
  for (const [key, item] of Object.entries(value)) {
    const values = Array.isArray(item) ? item : [item];
    if (
      !allowed.includes(key) ||
      values.length === 0 ||
      values.length > 50 ||
      !values.every(isScalar)
    )
      throw new BadRequestException("INVALID_FILTER");
    out[key] = values;
  }
  return out;
}
