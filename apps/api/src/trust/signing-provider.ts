import { createLocalProof, localKey, verifyLocalProof } from "./crypto";
import type { LocalProof } from "./types";

/** Detached proof boundary. A CA adapter must additionally validate its artifact and trust chain. */
export interface SigningProvider {
  readonly kind: string;
  sign(subject: string, payload: Record<string, unknown>): LocalProof;
  verify(subject: string, proof: LocalProof): boolean;
}

export class LocalSigningProvider implements SigningProvider {
  readonly kind = "LOCAL_ED25519";
  sign(subject: string, payload: Record<string, unknown>) {
    return createLocalProof(subject, payload);
  }
  verify(subject: string, proof: LocalProof) {
    return verifyLocalProof(proof, localKey(subject).keyFingerprint);
  }
}
