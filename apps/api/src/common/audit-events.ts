import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { Actor, RecordEntity } from "./types";
import { canonical, sha256 } from "./audit-chain";

export const auditContext = new AsyncLocalStorage<{
  requestId: string;
  method: string;
  path: string;
  actor?: Actor;
}>();

const SECRET =
  /^(password|passwordHash|tokenVersion|token|accessToken|refreshToken|authorization|privateKey|clientSecret|secret|pin|otp|apiKey|geminiApiKey|GEMINI_API_KEY|x-goog-api-key)$/i;
export function auditSafe(value: unknown, resource = ""): unknown {
  if (Array.isArray(value)) return value.map((v) => auditSafe(v, resource));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            !SECRET.test(key) &&
            !(resource === "signing-requests" && key === "code"),
        )
        .map(([key, item]) => [key, auditSafe(item, resource)]),
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
      const before = (auditSafe(old.get(id), resource) ?? {}) as Record<
        string,
        unknown
      >;
      const after = (auditSafe(next.get(id), resource) ?? {}) as Record<
        string,
        unknown
      >;
      const fields: AuditChange["fields"] = {};
      for (const key of new Set([
        ...Object.keys(before),
        ...Object.keys(after),
      ])) {
        if (["id", "version", "updatedAt", "createdAt", "runId"].includes(key))
          continue;
        if (canonical(before[key]) !== canonical(after[key]))
          fields[key] = {
            before: before[key] ?? null,
            after: after[key] ?? null,
          };
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
