import {
  createHash,
  generateKeyPairSync,
  createPublicKey,
  sign,
  verify,
} from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { canonical } from "../common/audit-chain";
import { repoRoot } from "../common/paths";
import type { LocalProof } from "./types";

export const trustFolder = () =>
  resolve(
    repoRoot(),
    process.env.TRUST_DIR ?? `${process.env.DATA_DIR ?? ".data"}-trust`,
  );
export const digestBytes = (bytes: Buffer | string) =>
  createHash("sha256").update(bytes).digest("hex");

/** Demo key store, separate from the workflow database. Exported proofs contain public keys only. */
export function localKey(subject: string) {
  const dir = resolve(trustFolder(), "keys");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = resolve(dir, digestBytes(subject) + ".pem");
  let privateKey: string;
  try {
    privateKey = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const generated = generateKeyPairSync("ed25519")
      .privateKey.export({ type: "pkcs8", format: "pem" })
      .toString();
    try {
      writeFileSync(path, generated, { flag: "wx", mode: 0o600 });
    } catch (writeError) {
      if ((writeError as NodeJS.ErrnoException).code !== "EEXIST")
        throw writeError;
    }
    privateKey = readFileSync(path, "utf8");
  }
  const publicKey = createPublicKey(privateKey)
    .export({ type: "spki", format: "pem" })
    .toString();
  return { privateKey, publicKey, keyFingerprint: digestBytes(publicKey) };
}

export function createLocalProof(
  subject: string,
  payload: Record<string, unknown>,
): LocalProof {
  const key = localKey(subject);
  return {
    provider: "LOCAL_ED25519",
    payload,
    publicKey: key.publicKey,
    keyFingerprint: key.keyFingerprint,
    signature: sign(
      null,
      Buffer.from(canonical(payload)),
      key.privateKey,
    ).toString("base64"),
  };
}

export function verifyLocalProof(
  proof: LocalProof,
  expectedFingerprint?: string,
): boolean {
  try {
    return (
      proof.provider === "LOCAL_ED25519" &&
      digestBytes(proof.publicKey) === proof.keyFingerprint &&
      (!expectedFingerprint || expectedFingerprint === proof.keyFingerprint) &&
      verify(
        null,
        Buffer.from(canonical(proof.payload)),
        proof.publicKey,
        Buffer.from(proof.signature, "base64"),
      )
    );
  } catch {
    return false;
  }
}
