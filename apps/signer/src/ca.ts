import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  scryptSync,
  sign,
  timingSafeEqual,
  verify,
} from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { canonical, sha256 } from "./canonical";
import type { Certificate, Subject } from "./types";

const CA_NAME = "CodeCash Demo CA";
/** Certificates of the demo CA last two years, like common commercial ones. */
const VALIDITY_YEARS = 2;

/** A private key kept in the provider's key folder (the stand-in for its HSM). */
function keyFile(dir: string, name: string) {
  const folder = resolve(dir, "keys");
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  const path = resolve(folder, `${name}.pem`);
  try {
    return readFileSync(path, "utf8");
  } catch {
    const pem = generateKeyPairSync("ed25519")
      .privateKey.export({ type: "pkcs8", format: "pem" })
      .toString();
    writeFileSync(path, pem, { mode: 0o600, flag: "wx" });
    return readFileSync(path, "utf8");
  }
}

const publicPem = (privatePem: string) =>
  createPublicKey(createPrivateKey(privatePem))
    .export({ type: "spki", format: "pem" })
    .toString();

export class CertificateAuthority {
  readonly publicKey: string;
  readonly keyFingerprint: string;
  private readonly privateKey: string;
  constructor(private dir: string) {
    this.privateKey = keyFile(dir, "ca");
    this.publicKey = publicPem(this.privateKey);
    this.keyFingerprint = sha256(this.publicKey);
  }

  /** What the relying party pins: the CA's name and public key. */
  describe() {
    return {
      commonName: CA_NAME,
      publicKey: this.publicKey,
      keyFingerprint: this.keyFingerprint,
      algorithm: "Ed25519",
      trusted: false,
      note: "Demo CA for development and teaching; not a licensed trust service.",
    };
  }

  /** Issues a certificate for a new signing key held by the provider for this subscriber. */
  issue(credentialId: string, subject: Subject, now: Date): Certificate {
    const userKey = keyFile(this.dir, `credential-${credentialId}`);
    const notAfter = new Date(now);
    notAfter.setUTCFullYear(notAfter.getUTCFullYear() + VALIDITY_YEARS);
    const body: Omit<Certificate, "signature"> = {
      version: 1,
      serial: randomBytes(8).toString("hex").toUpperCase(),
      subject,
      issuer: { commonName: CA_NAME, keyFingerprint: this.keyFingerprint },
      publicKey: publicPem(userKey),
      keyFingerprint: sha256(publicPem(userKey)),
      notBefore: now.toISOString(),
      notAfter: notAfter.toISOString(),
      keyUsage: ["digitalSignature", "nonRepudiation"],
      policy: "DEMO_NOT_QUALIFIED",
    };
    return {
      ...body,
      signature: sign(
        null,
        Buffer.from(canonical(body)),
        this.privateKey,
      ).toString("base64"),
    };
  }

  /** Signs a hash with the subscriber's key; only after the person confirmed with their PIN. */
  signHash(credentialId: string, hash: string) {
    const userKey = keyFile(this.dir, `credential-${credentialId}`);
    return sign(null, Buffer.from(hash, "hex"), userKey).toString("base64");
  }

  verifyCertificate(certificate: Certificate) {
    const { signature, ...body } = certificate;
    return verify(
      null,
      Buffer.from(canonical(body)),
      this.publicKey,
      Buffer.from(signature, "base64"),
    );
  }
}

/** PINs are never stored, only a salted scrypt hash. */
export function hashPin(pin: string, salt = randomBytes(16).toString("hex")) {
  return { salt, hash: scryptSync(pin, salt, 32).toString("hex") };
}

export function pinMatches(pin: string, salt: string, hash: string) {
  const candidate = scryptSync(pin, salt, 32);
  const stored = Buffer.from(hash, "hex");
  return (
    candidate.length === stored.length && timingSafeEqual(candidate, stored)
  );
}
