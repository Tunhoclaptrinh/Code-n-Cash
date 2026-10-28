import { createHash } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { repoRoot } from "./common/paths";

/**
 * Evidence documents (delivery notes, acceptance records, invoices) stored by their SHA-256, so the
 * same bytes are kept once and a stored file can always be checked against the hash events refer to.
 */
export const EVIDENCE_MAX_BYTES = 20 * 1024 * 1024;

const folder = () =>
  process.env.EVIDENCE_DIR
    ? resolve(repoRoot(), process.env.EVIDENCE_DIR)
    : resolve(
        repoRoot(),
        process.env.DATA_DIR ?? ".data",
        "uploads",
        "evidence",
      );
const pathOf = (sha256: string) => resolve(folder(), sha256);
const SHA256 = /^[a-f0-9]{64}$/;

/** PDF, images and Office files (zip containers); the type comes from the bytes, not the name. */
export function evidenceMediaType(bytes: Buffer, fileName: string) {
  const head = bytes.subarray(0, 8);
  if (head.subarray(0, 5).toString("latin1") === "%PDF-")
    return "application/pdf";
  if (head.equals(Buffer.from("89504e470d0a1a0a", "hex"))) return "image/png";
  if (head.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex")))
    return "image/jpeg";
  if (head.subarray(0, 4).equals(Buffer.from("504b0304", "hex"))) {
    const name = fileName.toLowerCase();
    if (name.endsWith(".docx"))
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    if (name.endsWith(".xlsx"))
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  return null;
}

export async function storeEvidence(bytes: Buffer, fileName: string) {
  const mediaType = evidenceMediaType(bytes, fileName);
  if (!bytes.length || !mediaType) throw new Error("UNSUPPORTED_EVIDENCE_FILE");
  if (bytes.length > EVIDENCE_MAX_BYTES) throw new Error("FILE_TOO_LARGE");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  await mkdir(folder(), { recursive: true });
  try {
    await writeFile(pathOf(sha256), bytes, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  return { sha256, sizeBytes: bytes.length, mediaType };
}

/** Size of a stored document, or null when nothing is stored under that hash. */
export function storedEvidenceSize(sha256: string): number | null {
  if (!SHA256.test(sha256) || !existsSync(pathOf(sha256))) return null;
  return statSync(pathOf(sha256)).size;
}

/** The stored bytes, refused when they no longer hash to `sha256`. */
export async function readEvidence(sha256: string) {
  if (!SHA256.test(sha256)) throw new Error("INVALID_DOCUMENT");
  const bytes = await readFile(pathOf(sha256));
  if (createHash("sha256").update(bytes).digest("hex") !== sha256)
    throw new Error("DOCUMENT_CHANGED");
  return bytes;
}
