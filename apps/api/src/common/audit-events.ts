import { AsyncLocalStorage } from "node:async_hooks";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Actor, RecordEntity } from "./types";
import { canonical, sha256 } from "./audit-chain";
import { repoRoot } from "./paths";

export const auditContext = new AsyncLocalStorage<{
  requestId: string;
  method: string;
  path: string;
  actor?: Actor;
}>();

const SECRET =
  /^(password|passwordHash|tokenVersion|token|accessToken|refreshToken|authorization|privateKey|clientSecret|secret|pin|otp|apiKey|geminiApiKey|GEMINI_API_KEY|x-goog-api-key)$/i;
/** Values about a person. The sealed log cannot forget, so it keeps a keyed digest of them only. */
const PERSONAL =
  /^(email|displayName|fullName|phone|phoneNumber|signerName|signerEmail|citizenId|personalId|address)$/i;

/**
 * Key of the personal-value digests: AUDIT_PERSONAL_KEY, or a random key kept beside the other
 * trust keys. Destroying it makes every digest in the log unlinkable to a person (crypto-shredding)
 * while the chain itself stays verifiable.
 */
const personalKeys = new Map<string, Buffer>();
function personalKey(): Buffer {
  if (process.env.AUDIT_PERSONAL_KEY)
    return Buffer.from(process.env.AUDIT_PERSONAL_KEY);
  const dir = resolve(
    repoRoot(),
    process.env.TRUST_DIR ?? `${process.env.DATA_DIR ?? ".data"}-trust`,
    "keys",
  );
  const path = resolve(dir, "audit-personal.key");
  const cached = personalKeys.get(path);
  if (cached) return cached;
  try {
    personalKeys.set(path, readFileSync(path));
    return personalKeys.get(path)!;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    writeFileSync(path, randomBytes(32), { flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  personalKeys.set(path, readFileSync(path));
  return personalKeys.get(path)!;
}

/** Keyed digest of a personal value; the same value always gives the same digest. */
export const personalDigest = (value: unknown) =>
  value === null || value === undefined || value === ""
    ? value
    : `hmac-sha256:${createHmac("sha256", personalKey())
        .update(canonical(value))
        .digest("hex")}`;

/** Fields never written to the log, at any depth. */
const hidden = (key: string, resource: string) =>
  SECRET.test(key) || (resource === "signing-requests" && key === "code");

/** One field as the log keeps it: personal values digested, secrets below it removed. */
const safeField = (key: string, value: unknown, resource: string) =>
  PERSONAL.test(key) ? personalDigest(value) : auditSafe(value, resource);

export function auditSafe(value: unknown, resource = ""): unknown {
  if (Array.isArray(value)) return value.map((v) => auditSafe(v, resource));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !hidden(key, resource))
        .map(([key, item]) => [key, safeField(key, item, resource)]),
    );
  return value;
}

export interface AuditChange {
  resource: string;
  recordId: string;
  operation: "CREATE" | "UPDATE" | "DELETE";
  fields: Record<string, { before: unknown; after: unknown }>;
}

/** Store actual business changes, excluding counters/timestamps and every credential. */
export function auditChanges(
  originals: Record<string, RecordEntity[]>,
  tables: Record<string, RecordEntity[]>,
): AuditChange[] {
  const changes: AuditChange[] = [];
  for (const [resource, rows] of Object.entries(tables)) {
    if (resource === "audit") continue;
    const old = new Map((originals[resource] ?? []).map((r) => [r.id, r]));
    const next = new Map(rows.map((r) => [r.id, r]));
    for (const id of new Set([...old.keys(), ...next.keys()])) {
      const before = (old.get(id) ?? {}) as Record<string, unknown>;
      const after = (next.get(id) ?? {}) as Record<string, unknown>;
      const fields: AuditChange["fields"] = {};
      for (const key of new Set([
        ...Object.keys(before),
        ...Object.keys(after),
      ])) {
        if (
          ["id", "version", "updatedAt", "createdAt", "runId"].includes(key) ||
          hidden(key, resource) ||
          canonical(before[key]) === canonical(after[key])
        )
          continue;
        // Only a changed field is made safe for the log (and its personal values digested).
        const safeBefore = safeField(key, before[key], resource) ?? null;
        const safeAfter = safeField(key, after[key], resource) ?? null;
        if (canonical(safeBefore) !== canonical(safeAfter))
          fields[key] = { before: safeBefore, after: safeAfter };
      }
      if (Object.keys(fields).length)
        changes.push({
          resource,
          recordId: id,
          operation: !old.has(id)
            ? "CREATE"
            : !next.has(id)
              ? "DELETE"
              : "UPDATE",
          fields,
        });
    }
  }
  return changes;
}

export function enrichAudit(
  entries: RecordEntity[],
  changes: AuditChange[],
): RecordEntity[] {
  const context = auditContext.getStore();
  const transactionId = randomUUID();
  const now = new Date().toISOString();
  if (!entries.length && changes.length)
    entries = [
      {
        id: randomUUID(),
        version: 1,
        createdAt: now,
        updatedAt: now,
        organizationId: context?.actor?.organizationId ?? "OPS",
        actorId: context?.actor?.id ?? "system",
        action: "SYSTEM_WRITE",
        resource: changes[0].resource,
        recordId: changes[0].recordId,
      },
    ];
  return entries
    .filter(
      (entry) => entry.action !== "getSigningRequest" || changes.length > 0,
    )
    .map((entry, index) => ({
      ...entry,
      transactionId,
      outcome: entry.outcome ?? "SUCCESS",
      actorName:
        entry.actorName ?? context?.actor?.displayName ?? entry.actorId,
      actorRole: entry.actorRole ?? context?.actor?.role ?? "SYSTEM",
      ...(context
        ? {
            requestId: context.requestId,
            method: context.method,
            path: context.path,
          }
        : {}),
      ...(index === 0 && changes.length
        ? entry.action === "IMPORT_DATA_PACK" || entry.action === "SYSTEM_WRITE"
          ? {
              changeSummary: {
                count: changes.length,
                resources: [...new Set(changes.map((c) => c.resource))],
                digest: sha256(canonical(changes)),
              },
            }
          : { changes }
        : {}),
    }));
}
