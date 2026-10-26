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
  let previous = typeof head?.hash === "string" ? head.hash : GENESIS;
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

export type ChainReport = IntegrityReport["chain"];
type ChainProblem = NonNullable<ChainReport["firstBroken"]>["problem"];

/** Recomputes the chain from its first entry and, optionally, checks a saved head hash. */
export function verifyChain(
  entries: RecordEntity[],
  anchor?: { seq: number; hash: string },
): ChainReport {
  const sealed = entries
    .filter((entry) => typeof entry.hash === "string")
    .sort((a, b) => Number(a.seq) - Number(b.seq));
  let previous = GENESIS;
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
