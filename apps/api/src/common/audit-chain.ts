import { createHash } from "node:crypto";
import type { IntegrityReport } from "../domain/types";
import type { RecordEntity } from "./types";

/**
 * Hash chain over the append-only audit log (docs/NGHIEP_VU.md section 9):
 * hash_i = SHA256(canonical_JSON(entry_i without hash)), where entry_i carries seq and prevHash.
 * It detects an edited, removed or reordered entry. Rewriting the whole chain is detected only
 * against a head hash saved somewhere else (the anchor).
 */
export const GENESIS = "0".repeat(64);

/**
 * The hash the first entry of a chain links to: GENESIS, or, after a demo reset, the head of the
 * archived chain. The reset entry is then the first entry and carries that head, so the new chain
 * continues the old one instead of starting from nothing.
 */
export const chainOrigin = (first: RecordEntity | undefined) =>
  first?.action === "RESET_DEMO_DATA" &&
  typeof first.archivedHeadHash === "string"
    ? first.archivedHeadHash
    : GENESIS;

/** JSON with object keys sorted at every level: the exact bytes a hash covers. */
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

export const sha256 = (text: string) =>
  createHash("sha256").update(text).digest("hex");

/** Hash of a stored record as it is (used to seal events the app records). */
export const recordHash = (record: RecordEntity) => sha256(canonical(record));

/** What platform roles see of an audit entry: enough to check the chain, nothing of its content. */
const DIGEST_FIELDS = [
  "id",
  "seq",
  "prevHash",
  "hash",
  "action",
  "resource",
  "recordId",
  "createdAt",
] as const;

/**
 * An audit entry without its content (who, what changed, amounts, sealed hashes of records). The
 * chain still verifies: each digest keeps its own hash and the previous one (spec 2.2).
 */
export function auditDigest(entry: RecordEntity): RecordEntity {
  return Object.fromEntries(
    DIGEST_FIELDS.filter((key) => key in entry).map((key) => [key, entry[key]]),
  ) as RecordEntity;
}

/** Hash of an audit entry: every field except the hash itself, so the link is covered too. */
export function entryHash(entry: RecordEntity) {
  const rest: Record<string, unknown> = { ...entry };
  delete rest.hash;
  return sha256(canonical(rest));
}

/** Last entry of the chain, or undefined when nothing has been sealed yet. */
export const chainHead = (entries: RecordEntity[]) =>
  entries.reduce<RecordEntity | undefined>(
    (head, entry) =>
      typeof entry.hash === "string" &&
      Number(entry.seq) > Number(head?.seq ?? 0)
        ? entry
        : head,
    undefined,
  );

/** Links new entries to the chain: next sequence number, previous hash, own hash. */
export function seal(
  entries: RecordEntity[],
  head: RecordEntity | undefined,
): RecordEntity[] {
  let seq = Number(head?.seq ?? 0);
  let previous =
    typeof head?.hash === "string" ? head.hash : chainOrigin(entries[0]);
  return entries.map((entry) => {
    // Round-trip first so the stored record and the hashed bytes match (no undefined fields).
    const linked = JSON.parse(
      JSON.stringify({ ...entry, seq: ++seq, prevHash: previous }),
    ) as RecordEntity;
    linked.hash = entryHash(linked);
    previous = linked.hash as string;
    return linked;
  });
}

export type ChainReport = Omit<IntegrityReport["chain"], "lastAnchor">;
type ChainProblem = NonNullable<ChainReport["firstBroken"]>["problem"];

/** Recomputes the chain from its first entry and, optionally, checks a saved head hash. */
export function verifyChain(
  entries: RecordEntity[],
  anchor?: { seq: number; hash: string },
): ChainReport {
  const sealed = entries
    .filter((entry) => typeof entry.hash === "string")
    .sort((a, b) => Number(a.seq) - Number(b.seq));
  let previous = chainOrigin(sealed[0]);
  let firstBroken: ChainReport["firstBroken"] = null;
  for (const [index, entry] of sealed.entries()) {
    const problem: ChainProblem | null =
      Number(entry.seq) !== index + 1
        ? "SEQUENCE_GAP"
        : entry.prevHash !== previous
          ? "LINK_BROKEN"
          : entryHash(entry) !== entry.hash
            ? "CONTENT_CHANGED"
            : null;
    if (problem) {
      firstBroken = { seq: Number(entry.seq), id: entry.id, problem };
      break;
    }
    previous = String(entry.hash);
  }
  const last = sealed.at(-1);
  const saved = anchor
    ? sealed.find((entry) => Number(entry.seq) === anchor.seq)
    : undefined;
  return {
    ok: !firstBroken && sealed.length === entries.length,
    sealed: sealed.length,
    unsealed: entries.length - sealed.length,
    head: last ? { seq: Number(last.seq), hash: String(last.hash) } : null,
    continuesFrom:
      sealed[0] && chainOrigin(sealed[0]) !== GENESIS
        ? {
            archive: String(sealed[0].recordId),
            headHash: chainOrigin(sealed[0]),
          }
        : null,
    firstBroken,
    anchor: !anchor
      ? null
      : !saved
        ? "NOT_FOUND"
        : saved.hash === anchor.hash
          ? "MATCH"
          : "MISMATCH",
  };
}
