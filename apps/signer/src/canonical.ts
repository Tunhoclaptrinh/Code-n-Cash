import { createHash } from "node:crypto";

/**
 * Canonical JSON (keys sorted, undefined dropped). Certificates and signed payloads are hashed in
 * this form on both sides of the contract, so the relying party can check them byte for byte.
 */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, v]) => `${JSON.stringify(key)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

export const sha256 = (text: string | Buffer) =>
  createHash("sha256").update(text).digest("hex");
