import { BadRequestException } from "@nestjs/common";
/** Only resource-declared fields may enter a filter; organization scope is applied independently. */
export function parseFilters(
  raw: unknown,
  allowed: string[],
): Record<string, string | number | boolean> {
  if (!raw) return {};
  let value: unknown;
  try {
    value = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    throw new BadRequestException("INVALID_FILTER");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new BadRequestException("INVALID_FILTER");
  for (const [key, item] of Object.entries(value))
    if (
      !allowed.includes(key) ||
      !["string", "number", "boolean"].includes(typeof item)
    )
      throw new BadRequestException("INVALID_FILTER");
  return value as Record<string, string | number | boolean>;
}
