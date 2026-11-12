import { ApiClient } from "@codecash/api-client";
import { platform } from "@/shared/api/platform";

/** A device session: issued by CodeCash for the signed-in person, used against the signing service. */
export interface DeviceSession {
  token: string;
  expiresAt: string;
  /** Gateway path of the signing service, e.g. /signer-api. */
  baseUrl: string;
  certificate: {
    serial: string;
    commonName: string;
    issuer: string;
    notAfter: string;
  };
}

export type DeviceChannel = "MOBILE_APP" | "USB_TOKEN";
export type DeviceStatus =
  "PENDING" | "SIGNED" | "REJECTED" | "EXPIRED" | "CANCELLED";

/** A signing request as the person's device sees it (from the signing service, not CodeCash). */
export interface DeviceTransaction {
  id: string;
  status: DeviceStatus;
  channel: DeviceChannel;
  display: { title: string; relyingParty: string; reference: string };
  hash: string;
  confirmationCode: string;
  createdAt: string;
  expiresAt: string;
  finishedAt: string | null;
}

export interface DeviceCredential {
  id: string;
  certificate: {
    serial: string;
    subject: { commonName: string; organization: string };
    issuer: { commonName: string };
    notBefore: string;
    notAfter: string;
    keyFingerprint: string;
  };
  locked: boolean;
  lockedUntil: string | null;
  triesLeft: number;
  /** The demo PIN every subscriber starts with; shown on the simulated device. */
  demoPin: string;
}

/** 404 SIGNER_DISABLED when CodeCash does not sign through the remote service. */
export const getDeviceSession = () =>
  platform.get<DeviceSession>("/signing/device-session");

/** A client of the signing service's device API, authenticated by the device session token. */
export const deviceClient = (session: DeviceSession) =>
  new ApiClient({ baseUrl: session.baseUrl, getToken: () => session.token });
