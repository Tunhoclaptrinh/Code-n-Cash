import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { canonical, sha256 } from "../common/audit-chain";
import {
  createLocalProof,
  localKey,
  trustFolder,
  verifyLocalProof,
} from "./crypto";
import type { AnchorPayload, LocalProof } from "./types";

/** Provider boundary: a real TSA/ledger must verify its own remote receipt before confirming. */
export interface AnchorProvider {
  readonly kind: string;
  submit(payload: AnchorPayload): Promise<LocalProof>;
  verify(payload: AnchorPayload, receipt: LocalProof): Promise<boolean>;
}

export class LocalWitnessProvider implements AnchorProvider {
  readonly kind = "LOCAL_WITNESS";
  private receiptPath(payload: AnchorPayload) {
    return resolve(
      trustFolder(),
      "receipts",
      sha256(canonical(payload)) + ".json",
    );
  }
  async submit(payload: AnchorPayload) {
    const path = this.receiptPath(payload);
    await mkdir(resolve(trustFolder(), "receipts"), { recursive: true });
    try {
      return JSON.parse(await readFile(path, "utf8")) as LocalProof;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const proof = createLocalProof("audit-witness", {
      kind: "AUDIT_ANCHOR",
      payload,
      observedAt: new Date().toISOString(),
      timestampTrusted: false,
    });
    try {
      await writeFile(path, JSON.stringify(proof), { flag: "wx", mode: 0o600 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    return JSON.parse(await readFile(path, "utf8")) as LocalProof;
  }
  async verify(payload: AnchorPayload, receipt: LocalProof) {
    const saved = JSON.parse(
      await readFile(this.receiptPath(payload), "utf8"),
    ) as LocalProof;
    return (
      canonical(receipt) === canonical(saved) &&
      canonical(receipt.payload.payload) === canonical(payload) &&
      verifyLocalProof(receipt, localKey("audit-witness").keyFingerprint)
    );
  }
}
