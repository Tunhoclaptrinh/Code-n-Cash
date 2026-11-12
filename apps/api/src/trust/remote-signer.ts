import { BadRequestException } from "@nestjs/common";
import { createHmac, timingSafeEqual, verify } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { canonical, sha256 } from "../common/audit-chain";
import { trustFolder } from "./crypto";

/**
 * Client of the remote signing provider (apps/signer, contract in apps/signer/openapi.yaml).
 * CodeCash is the relying party: it sends the hash of what a person signs, the provider asks the
 * person on their device and signs with the key it holds, and the result comes back by webhook
 * (or by polling when a webhook is lost). Nothing here trusts the provider blindly: the CA key is
 * pinned, every certificate and signature is checked again before a step counts as signed.
 */

export interface RemoteCertificate {
  version: 1;
  serial: string;
  subject: { subscriberId: string; commonName: string; organization: string };
  issuer: { commonName: string; keyFingerprint: string };
  publicKey: string;
  keyFingerprint: string;
  notBefore: string;
  notAfter: string;
  keyUsage: string[];
  policy: string;
  signature: string;
}

export type RemoteStatus =
  "PENDING" | "SIGNED" | "REJECTED" | "EXPIRED" | "CANCELLED";

export interface RemoteTransaction {
  id: string;
  status: RemoteStatus;
  channel: "MOBILE_APP" | "USB_TOKEN";
  hash: string;
  confirmationCode: string;
  createdAt: string;
  expiresAt: string;
  finishedAt: string | null;
  result?: {
    algorithm: "Ed25519";
    signature: string;
    certificate: RemoteCertificate;
  };
}

interface CaInfo {
  commonName: string;
  publicKey: string;
  keyFingerprint: string;
}

const config = () => ({
  url: (process.env.SIGNER_URL || "http://127.0.0.1:3200").replace(/\/+$/, ""),
  clientId: process.env.SIGNER_CLIENT_ID || "codecash",
  clientSecret: process.env.SIGNER_CLIENT_SECRET || "codecash-dev-secret",
  webhookSecret: process.env.SIGNER_WEBHOOK_SECRET || "codecash-dev-webhook",
  callbackUrl:
    process.env.SIGNER_CALLBACK_URL ||
    `http://127.0.0.1:${process.env.PORT || process.env.API_PORT || 3000}/api/v1/signing/callback`,
  pinnedFingerprint: process.env.SIGNER_CA_FINGERPRINT || "",
});

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { url, clientId, clientSecret } = config();
  try {
    const response = await fetch(url + path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization:
          "Basic " +
          Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(8000),
    });
    const body = (await response.json().catch(() => ({}))) as T & {
      code?: string;
    };
    if (!response.ok) throw new Error(body.code ?? `HTTP_${response.status}`);
    return body;
  } catch (error) {
    throw new BadRequestException(
      `SIGNER_UNAVAILABLE:${(error as Error).message}`.slice(0, 120),
    );
  }
}

/* --------------------------------- CA pinning -------------------------------- */

const caFile = () => resolve(trustFolder(), "signer-ca.json");

/** The pinned CA key, read synchronously inside a transaction; undefined until first fetched. */
export function pinnedCa(): CaInfo | undefined {
  try {
    return JSON.parse(readFileSync(caFile(), "utf8")) as CaInfo;
  } catch {
    return undefined;
  }
}

/**
 * Pins the provider's CA key: to SIGNER_CA_FINGERPRINT when configured, otherwise to the first
 * key seen (trust on first use, kept in the trust folder). A different key later is refused.
 */
export async function ensureCa(): Promise<CaInfo> {
  const pinned = pinnedCa();
  if (pinned) return pinned;
  const ca = await call<CaInfo>("/v1/ca", { method: "GET" });
  if (sha256(ca.publicKey) !== ca.keyFingerprint)
    throw new BadRequestException("SIGNER_CA_INVALID");
  const expected = config().pinnedFingerprint;
  if (expected && expected !== ca.keyFingerprint)
    throw new BadRequestException("SIGNER_CA_MISMATCH");
  writeFileSync(
    caFile(),
    JSON.stringify({
      commonName: ca.commonName,
      publicKey: ca.publicKey,
      keyFingerprint: ca.keyFingerprint,
    }),
    { mode: 0o600 },
  );
  return ca;
}

/* ----------------------------------- calls ----------------------------------- */

export const enroll = (subscriber: {
  subscriberId: string;
  commonName: string;
  organization: string;
}) =>
  call<{ id: string; certificate: RemoteCertificate; demoPin: string }>(
    "/v1/credentials",
    { method: "POST", body: JSON.stringify(subscriber) },
  );

export const deviceSession = (subscriberId: string) =>
  call<{ token: string; expiresAt: string }>("/v1/device-sessions", {
    method: "POST",
    body: JSON.stringify({ subscriberId }),
  });

export const createSignature = (
  input: {
    subscriberId: string;
    hash: string;
    channel: "MOBILE_APP" | "USB_TOKEN";
    title: string;
    reference: string;
  },
  idempotencyKey: string,
) =>
  call<RemoteTransaction>("/v1/signatures", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({
      subscriberId: input.subscriberId,
      hash: input.hash,
      channel: input.channel,
      display: {
        title: input.title,
        relyingParty: "CodeCash",
        reference: input.reference,
      },
      callbackUrl: config().callbackUrl,
    }),
  });

export const getSignature = (id: string) =>
  call<RemoteTransaction>(`/v1/signatures/${encodeURIComponent(id)}`, {
    method: "GET",
  });

export const cancelSignature = (id: string) =>
  call<RemoteTransaction>(`/v1/signatures/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
  });

/* -------------------------------- verification ------------------------------- */

/** A webhook is accepted only when its body carries the shared secret's HMAC. */
export function webhookAuthentic(rawBody: Buffer, header: unknown) {
  if (typeof header !== "string") return false;
  const expected =
    "sha256=" +
    createHmac("sha256", config().webhookSecret).update(rawBody).digest("hex");
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Checks a remote signature from first principles: the certificate was issued by the pinned CA,
 * names this signer, was valid when signed, and its key signed exactly the hash of the payload.
 */
export function verifyRemoteSignature(input: {
  payload: Record<string, unknown>;
  hash: string;
  signature: string;
  certificate: RemoteCertificate;
  signerUserId: string;
  signedAt?: string;
}): boolean {
  const ca = pinnedCa();
  if (!ca) return false;
  try {
    const { signature: certSignature, ...certBody } = input.certificate;
    const at = input.signedAt ? Date.parse(input.signedAt) : Date.now();
    return (
      input.certificate.issuer.keyFingerprint === ca.keyFingerprint &&
      verify(
        null,
        Buffer.from(canonical(certBody)),
        ca.publicKey,
        Buffer.from(certSignature, "base64"),
      ) &&
      input.certificate.subject.subscriberId === input.signerUserId &&
      sha256(input.certificate.publicKey) ===
        input.certificate.keyFingerprint &&
      Date.parse(input.certificate.notBefore) <= at &&
      at <= Date.parse(input.certificate.notAfter) &&
      sha256(canonical(input.payload)) === input.hash &&
      verify(
        null,
        Buffer.from(input.hash, "hex"),
        input.certificate.publicKey,
        Buffer.from(input.signature, "base64"),
      )
    );
  } catch {
    return false;
  }
}
