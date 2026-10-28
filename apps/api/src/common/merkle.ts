import { createHash } from "node:crypto";

/**
 * Merkle tree over the audit chain (RFC 6962 / RFC 9162 section 2.1): the leaves are the entry hashes
 * in sequence order, leaf = SHA-256(0x00 || hash), node = SHA-256(0x01 || left || right). An anchor that
 * stores the root lets anyone check one entry with log2(n) hashes instead of the whole log; the
 * independent verifier tools/verify_audit.py implements the same rules.
 */
const digest = (...parts: Buffer[]) =>
  createHash("sha256").update(Buffer.concat(parts)).digest();
const leaf = (hash: string) =>
  digest(Buffer.from([0]), Buffer.from(hash, "hex"));
const node = (left: Buffer, right: Buffer) =>
  digest(Buffer.from([1]), left, right);

/** Largest power of two strictly below n (n > 1). */
const split = (n: number) => {
  let k = 1;
  while (k * 2 < n) k *= 2;
  return k;
};

function rootOf(leaves: Buffer[]): Buffer {
  if (leaves.length === 0) return digest();
  if (leaves.length === 1) return leaves[0];
  const k = split(leaves.length);
  return node(rootOf(leaves.slice(0, k)), rootOf(leaves.slice(k)));
}

/** Root of the entry hashes, hex. */
export const merkleRoot = (hashes: string[]) =>
  rootOf(hashes.map(leaf)).toString("hex");

/** Audit path of ``hashes[index]``, bottom-up, hex. */
export function inclusionProof(index: number, hashes: string[]): string[] {
  const path = (m: number, leaves: Buffer[]): Buffer[] => {
    if (leaves.length <= 1) return [];
    const k = split(leaves.length);
    return m < k
      ? [...path(m, leaves.slice(0, k)), rootOf(leaves.slice(k))]
      : [...path(m - k, leaves.slice(k)), rootOf(leaves.slice(0, k))];
  };
  if (index < 0 || index >= hashes.length) throw new RangeError("index");
  return path(index, hashes.map(leaf)).map((b) => b.toString("hex"));
}

/** Checks an audit path (RFC 9162 section 2.1.3.2). */
export function verifyInclusion(
  hash: string,
  index: number,
  size: number,
  path: string[],
  root: string,
): boolean {
  if (index < 0 || index >= size) return false;
  let fn = index,
    sn = size - 1,
    r = leaf(hash);
  for (const sibling of path.map((p) => Buffer.from(p, "hex"))) {
    if (sn === 0) return false;
    if (fn % 2 === 1 || fn === sn) {
      r = node(sibling, r);
      if (fn % 2 === 0)
        while (fn % 2 === 0 && fn !== 0) {
          fn >>= 1;
          sn >>= 1;
        }
    } else r = node(r, sibling);
    fn >>= 1;
    sn >>= 1;
  }
  return sn === 0 && r.toString("hex") === root;
}
