import { BadRequestException } from "@nestjs/common";
import { createLocalProof, localKey, verifyLocalProof } from "./crypto";
import { canonical, sha256 } from "../common/audit-chain";
import type { LocalProof } from "./types";

/** Detached signing bridge. CA/PAdES adapters also need independent artifact/chain validation. */
export interface SigningProvider {
  readonly kind: string;
  readonly simulated: boolean;
  sign(
    subject: string,
    payload: Record<string, unknown>,
  ): LocalProof | Promise<LocalProof>;
  verify(subject: string, proof: LocalProof): boolean;
}
export class LocalSigningProvider implements SigningProvider {
  readonly kind = "LOCAL_ED25519";
  readonly simulated = true;
  sign(subject: string, payload: Record<string, unknown>) {
    return createLocalProof(subject, payload);
  }
  verify(subject: string, proof: LocalProof) {
    return verifyLocalProof(proof, localKey(subject).keyFingerprint);
  }
}
/** Real HTTP transport with pinned verification key; never trust a key returned by the provider. */
export class HttpSigningProvider implements SigningProvider {
  readonly kind = "HTTP_ED25519_BRIDGE";
  readonly simulated = false;
  constructor(
    private url: string,
    private token: string,
    private fingerprint: string,
  ) {
    if (!url || !token || !/^[a-f0-9]{64}$/i.test(fingerprint))
      throw new Error(
        "Signing bridge requires URL, token and pinned key fingerprint",
      );
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" &&
      !(
        parsed.protocol === "http:" &&
        ["127.0.0.1", "localhost"].includes(parsed.hostname)
      )
    )
      throw new Error("Signing bridge requires HTTPS");
  }
  async sign(
    subject: string,
    payload: Record<string, unknown>,
  ): Promise<LocalProof> {
    try {
      const response = await fetch(this.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.token}`,
          "Idempotency-Key": sha256(canonical({ subject, payload })),
        },
        body: JSON.stringify({
          schema: "codecash.detached-signature.v1",
          subject,
          payload,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error("PROVIDER_REJECTED");
      const proof = (await response.json()) as LocalProof;
      if (
        canonical(proof.payload) !== canonical(payload) ||
        !this.verify(subject, proof)
      )
        throw new Error("INVALID_PROOF");
      return proof;
    } catch {
      throw new BadRequestException("SIGNATURE_PROVIDER_ERROR");
    }
  }
  verify(_subject: string, proof: LocalProof) {
    return verifyLocalProof(proof, this.fingerprint);
  }
}
let selected: SigningProvider | undefined;
export function getSigningProvider(): SigningProvider {
  if (selected) return selected;
  const mode = process.env.SIGNING_PROVIDER ?? "local";
  if (mode === "local") selected = new LocalSigningProvider();
  else if (mode === "http")
    selected = new HttpSigningProvider(
      process.env.SIGNING_URL ?? "",
      process.env.SIGNING_API_TOKEN ?? "",
      process.env.SIGNING_KEY_FINGERPRINT ?? "",
    );
  else throw new Error("Unsupported SIGNING_PROVIDER; refusing local fallback");
  return selected;
}
