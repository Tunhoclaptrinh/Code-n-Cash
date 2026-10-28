import { createHash, randomBytes, verify, X509Certificate } from "node:crypto";
import { readFileSync } from "node:fs";
import { rootCertificates } from "node:tls";
import type { TimestampReceipt } from "./types";

/**
 * RFC 3161 time-stamping of audit anchors by an external Time-Stamp Authority (TSA_URL).
 *
 * The TSA signs the anchor's digest together with the time it saw it, so the operator cannot later
 * claim the chain head existed earlier or differently. Tokens are checked here without third-party
 * code: the signed TSTInfo must carry the digest, the CMS signature must verify with a certificate in
 * the token, and that certificate must be a time-stamping certificate (EKU id-kp-timeStamping) that
 * chains to Node's root store or to TSA_TRUSTED_CERTS (a PEM bundle). Anyone can re-check a token with
 * `openssl ts -verify -digest <hex> -token_in -in token.der -CAfile roots.pem`.
 */
export type { TimestampReceipt };

export interface TimestampCheck {
  /** The token is well formed, signs `digest` and its signature verifies. */
  valid: boolean;
  /** The signing certificate is a time-stamping certificate chaining to a trusted root. */
  trusted: boolean;
  genTime: string | null;
  signer: string | null;
  error: string | null;
}

const OID = {
  signedData: "1.2.840.113549.1.7.2",
  tstInfo: "1.2.840.113549.1.9.16.1.4",
  contentType: "1.2.840.113549.1.9.3",
  messageDigest: "1.2.840.113549.1.9.4",
  sha256: "2.16.840.1.101.3.4.2.1",
  rsaPss: "1.2.840.113549.1.1.10",
  timeStamping: "1.3.6.1.5.5.7.3.8",
};
const DIGESTS: Record<string, string> = {
  [OID.sha256]: "sha256",
  "2.16.840.1.101.3.4.2.2": "sha384",
  "2.16.840.1.101.3.4.2.3": "sha512",
};

// ---- Minimal DER reader: only what a TimeStampResp needs. ----
interface Der {
  tag: number;
  start: number;
  body: number;
  end: number;
  buf: Buffer;
}
function der(buf: Buffer, pos = 0): Der {
  if (pos + 2 > buf.length) throw new Error("DER_TRUNCATED");
  const tag = buf[pos];
  let length = buf[pos + 1];
  let body = pos + 2;
  if (length & 0x80) {
    const bytes = length & 0x7f;
    if (bytes < 1 || bytes > 4) throw new Error("DER_LENGTH");
    length = 0;
    for (let i = 0; i < bytes; i++) length = length * 256 + buf[body + i];
    body += bytes;
  }
  const end = body + length;
  if (end > buf.length) throw new Error("DER_TRUNCATED");
  return { tag, start: pos, body, end, buf };
}
function children(node: Der): Der[] {
  const out: Der[] = [];
  for (let pos = node.body; pos < node.end; pos = out[out.length - 1].end)
    out.push(der(node.buf, pos));
  return out;
}
const content = (node: Der) => node.buf.subarray(node.body, node.end);
const raw = (node: Der) => node.buf.subarray(node.start, node.end);
function expect(node: Der | undefined, tag: number): Der {
  if (!node || node.tag !== tag) throw new Error("DER_STRUCTURE");
  return node;
}
function oid(node: Der): string {
  const bytes = content(expect(node, 0x06));
  const parts = [Math.floor(bytes[0] / 40), bytes[0] % 40];
  let value = 0;
  for (const byte of bytes.subarray(1)) {
    value = value * 128 + (byte & 0x7f);
    if (!(byte & 0x80)) {
      parts.push(value);
      value = 0;
    }
  }
  return parts.join(".");
}
const integerHex = (node: Der) =>
  content(expect(node, 0x02))
    .toString("hex")
    .replace(/^(00)+(?=.)/, "");
function generalizedTime(node: Der): string {
  const text = content(expect(node, 0x18)).toString("latin1");
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\.\d+)?Z$/.exec(text);
  if (!m) throw new Error("DER_TIME");
  return new Date(
    `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${(m[7] ?? "").slice(0, 4)}Z`,
  ).toISOString();
}

// ---- Request ----
function tlv(tag: number, body: Buffer): Buffer {
  let length = Buffer.from([body.length]);
  if (body.length >= 0x80) {
    const hex = body.length.toString(16);
    const bytes = Buffer.from(hex.length % 2 ? `0${hex}` : hex, "hex");
    length = Buffer.concat([Buffer.from([0x80 | bytes.length]), bytes]);
  }
  return Buffer.concat([Buffer.from([tag]), length, body]);
}
const SHA256_ALGORITHM = tlv(
  0x30,
  Buffer.concat([
    Buffer.from("0609608648016503040201", "hex"),
    Buffer.from("0500", "hex"),
  ]),
);

/** Minimal DER INTEGER content: no redundant leading zero, one added when the high bit is set. */
function positiveInteger(bytes: Buffer): Buffer {
  let start = 0;
  while (start < bytes.length - 1 && bytes[start] === 0) start++;
  const value = bytes.subarray(start);
  return value[0] & 0x80 ? Buffer.concat([Buffer.from([0]), value]) : value;
}

/** DER TimeStampReq for a SHA-256 digest, asking for the TSA certificate in the token. */
export function timestampRequest(digestHex: string, nonce: Buffer): Buffer {
  return tlv(
    0x30,
    Buffer.concat([
      tlv(0x02, Buffer.from([1])),
      tlv(
        0x30,
        Buffer.concat([
          SHA256_ALGORITHM,
          tlv(0x04, Buffer.from(digestHex, "hex")),
        ]),
      ),
      tlv(0x02, positiveInteger(nonce)),
      tlv(0x01, Buffer.from([0xff])),
    ]),
  );
}

// ---- Token parsing and checks ----
interface ParsedToken {
  tstInfo: Buffer;
  digest: string;
  genTime: string;
  serial: string;
  nonce: string | null;
  certificates: X509Certificate[];
  signer: {
    digestAlgorithm: string;
    signatureAlgorithm: string;
    signedAttrs: Buffer;
    messageDigest: Buffer;
    contentType: string;
    signature: Buffer;
  };
}

function parseToken(token: Buffer): ParsedToken {
  const [type, wrapped] = children(expect(der(token), 0x30));
  if (oid(type) !== OID.signedData) throw new Error("NOT_SIGNED_DATA");
  const signedData = children(expect(children(expect(wrapped, 0xa0))[0], 0x30));
  const [eType, eWrapped] = children(expect(signedData[2], 0x30));
  if (oid(eType) !== OID.tstInfo) throw new Error("NOT_TST_INFO");
  const tstNode = expect(children(expect(eWrapped, 0xa0))[0], 0x04);
  const tstInfo = Buffer.from(content(tstNode));
  const certificates = signedData
    .filter((node) => node.tag === 0xa0)
    .flatMap((node) => children(node))
    .filter((node) => node.tag === 0x30)
    .map((node) => new X509Certificate(raw(node)));
  const signerInfo = children(
    expect(children(expect(signedData.at(-1), 0x31))[0], 0x30),
  );
  const attrsNode = expect(signerInfo[3], 0xa0);
  const attrs = new Map(
    children(attrsNode).map((attr) => {
      const [type, values] = children(expect(attr, 0x30));
      return [oid(type), children(expect(values, 0x31))[0]];
    }),
  );
  const messageDigest = attrs.get(OID.messageDigest);
  const contentType = attrs.get(OID.contentType);
  if (!messageDigest || !contentType) throw new Error("SIGNED_ATTRS");
  // The signature covers the attributes as a SET OF, not as the [0] IMPLICIT field.
  const signedAttrs = Buffer.from(raw(attrsNode));
  signedAttrs[0] = 0x31;
  const tst = children(expect(der(tstInfo), 0x30));
  const [imprintAlgorithm, hashed] = children(expect(tst[2], 0x30));
  if (oid(children(expect(imprintAlgorithm, 0x30))[0]) !== OID.sha256)
    throw new Error("IMPRINT_ALGORITHM");
  const timeIndex = tst.findIndex((node) => node.tag === 0x18);
  const nonce = tst.slice(timeIndex + 1).find((node) => node.tag === 0x02);
  return {
    tstInfo,
    digest: content(expect(hashed, 0x04)).toString("hex"),
    genTime: generalizedTime(tst[timeIndex]),
    serial: integerHex(tst[3]),
    nonce: nonce ? integerHex(nonce) : null,
    certificates,
    signer: {
      digestAlgorithm: oid(children(expect(signerInfo[2], 0x30))[0]),
      signatureAlgorithm: oid(children(expect(signerInfo[4], 0x30))[0]),
      signedAttrs,
      messageDigest: Buffer.from(content(expect(messageDigest, 0x04))),
      contentType: oid(contentType),
      signature: Buffer.from(content(expect(signerInfo[5], 0x04))),
    },
  };
}

const validAt = (cert: X509Certificate, at: Date) =>
  new Date(cert.validFrom) <= at && at <= new Date(cert.validTo);

let roots: X509Certificate[] | null = null;
function trustedRoots(): X509Certificate[] {
  if (roots) return roots;
  const pems = [...rootCertificates];
  const extra = process.env.TSA_TRUSTED_CERTS;
  if (extra)
    pems.push(
      ...(readFileSync(extra, "utf8").match(
        /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g,
      ) ?? []),
    );
  roots = pems.flatMap((pem) => {
    try {
      return [new X509Certificate(pem)];
    } catch {
      return [];
    }
  });
  return roots;
}

/** Test hook: forget the cached roots after TSA_TRUSTED_CERTS changes. */
export const resetTrustedRoots = () => {
  roots = null;
};

/** Walks issuer links inside the token up to a trusted root; every link valid at the stamping time. */
function chainsToRoot(
  signer: X509Certificate,
  pool: X509Certificate[],
  at: Date,
): boolean {
  const anchors = trustedRoots();
  let current = signer;
  for (let depth = 0; depth < 6; depth++) {
    if (!validAt(current, at)) return false;
    if (anchors.some((root) => root.fingerprint256 === current.fingerprint256))
      return true;
    const root = anchors.find(
      (r) => current.checkIssued(r) && current.verify(r.publicKey),
    );
    if (root) return true;
    const next = pool.find(
      (c) =>
        c.fingerprint256 !== current.fingerprint256 &&
        current.checkIssued(c) &&
        current.verify(c.publicKey),
    );
    if (!next) return false;
    current = next;
  }
  return false;
}

const commonName = (cert: X509Certificate) =>
  /(?:^|\n)CN=([^\n]+)/.exec(cert.subject)?.[1] ?? cert.subject;

/** Checks a DER TimeStampToken against the digest it should sign. */
export function checkTimestamp(
  tokenBase64: string,
  digestHex: string,
): TimestampCheck {
  try {
    const token = parseToken(Buffer.from(tokenBase64, "base64"));
    const hash = DIGESTS[token.signer.digestAlgorithm];
    if (!hash) throw new Error("DIGEST_ALGORITHM");
    if (token.digest !== digestHex.toLowerCase())
      throw new Error("IMPRINT_MISMATCH");
    if (token.signer.contentType !== OID.tstInfo)
      throw new Error("CONTENT_TYPE");
    if (
      !createHash(hash)
        .update(token.tstInfo)
        .digest()
        .equals(token.signer.messageDigest)
    )
      throw new Error("MESSAGE_DIGEST");
    const pss = token.signer.signatureAlgorithm === OID.rsaPss;
    const signer = token.certificates.find((cert) => {
      try {
        return verify(
          hash,
          token.signer.signedAttrs,
          pss
            ? { key: cert.publicKey, padding: 6, saltLength: -2 }
            : cert.publicKey,
          token.signer.signature,
        );
      } catch {
        return false;
      }
    });
    if (!signer) throw new Error("SIGNATURE");
    const at = new Date(token.genTime);
    const trusted =
      (signer.keyUsage ?? []).includes(OID.timeStamping) &&
      chainsToRoot(signer, token.certificates, at);
    return {
      valid: true,
      trusted,
      genTime: token.genTime,
      signer: commonName(signer),
      error: trusted ? null : "UNTRUSTED_TSA",
    };
  } catch (error) {
    return {
      valid: false,
      trusted: false,
      genTime: null,
      signer: null,
      error: error instanceof Error ? error.message : "INVALID_TOKEN",
    };
  }
}

/** Extracts the token from a TimeStampResp; a refused request throws with the PKI status. */
export function tokenOf(response: Buffer): Buffer {
  const [statusInfo, token] = children(expect(der(response), 0x30));
  const status = Number.parseInt(
    integerHex(children(expect(statusInfo, 0x30))[0]),
    16,
  );
  if (status > 1 || !token) throw new Error(`TSA_STATUS_${status}`);
  return Buffer.from(raw(token));
}

const TIMEOUT_MS = 15_000;

/** Asks the TSA at `url` to stamp a SHA-256 digest and checks the answer before keeping it. */
export async function requestTimestamp(
  url: string,
  digestHex: string,
): Promise<TimestampReceipt> {
  const nonce = randomBytes(8);
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/timestamp-query" },
    body: new Uint8Array(timestampRequest(digestHex, nonce)),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`TSA_HTTP_${response.status}`);
  const token = tokenOf(Buffer.from(await response.arrayBuffer()));
  const parsed = parseToken(token);
  if (parsed.nonce !== nonce.toString("hex").replace(/^(00)+(?=.)/, ""))
    throw new Error("TSA_NONCE");
  const base64 = token.toString("base64");
  const check = checkTimestamp(base64, digestHex);
  if (!check.valid || !check.trusted)
    throw new Error(check.error ?? "INVALID_TOKEN");
  const signer = parsed.certificates.find(
    (cert) => commonName(cert) === check.signer,
  )!;
  return {
    kind: "RFC3161",
    tsa: url,
    token: base64,
    digest: digestHex,
    genTime: check.genTime!,
    serial: parsed.serial,
    signer: check.signer!,
    signerFingerprint: signer.fingerprint256.replaceAll(":", "").toLowerCase(),
  };
}
