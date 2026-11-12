/** Who the certificate names: the relying party's user, enrolled with this provider. */
export interface Subject {
  subscriberId: string;
  commonName: string;
  organization: string;
}

/** A demo X.509-like certificate in canonical JSON, signed by the provider's CA key. */
export interface Certificate {
  version: 1;
  serial: string;
  subject: Subject;
  issuer: { commonName: string; keyFingerprint: string };
  publicKey: string;
  keyFingerprint: string;
  notBefore: string;
  notAfter: string;
  keyUsage: ["digitalSignature", "nonRepudiation"];
  /** Never a qualified certificate: the CA is a demo and is not in any trust list. */
  policy: "DEMO_NOT_QUALIFIED";
  signature: string;
}

export interface Credential {
  id: string;
  subscriberId: string;
  certificate: Certificate;
  pinSalt: string;
  pinHash: string;
  failedPins: number;
  lockedUntil: string | null;
  createdAt: string;
}

export type Channel = "MOBILE_APP" | "USB_TOKEN";
export type TransactionStatus =
  "PENDING" | "SIGNED" | "REJECTED" | "EXPIRED" | "CANCELLED";

export interface Transaction {
  id: string;
  clientId: string;
  credentialId: string;
  subscriberId: string;
  channel: Channel;
  /** What the device shows: the document and who asks. */
  display: { title: string; relyingParty: string; reference: string };
  /** SHA-256 (hex) of the data to sign; the provider never sees the document itself. */
  hash: string;
  /** Short code shown on both screens so the person knows the requests match. */
  confirmationCode: string;
  status: TransactionStatus;
  createdAt: string;
  expiresAt: string;
  finishedAt: string | null;
  callbackUrl: string | null;
  idempotencyKey: string | null;
  signature: string | null;
  webhook: {
    attempts: number;
    deliveredAt: string | null;
    lastError: string | null;
  };
}

export interface Store {
  credentials: Credential[];
  transactions: Transaction[];
}
