import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

export interface ClientConfig {
  clientId: string;
  clientSecret: string;
}

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Relying party (service to service): HTTP Basic with the client id and secret. */
export function clientOf(req: IncomingMessage, clients: ClientConfig[]) {
  const header = req.headers.authorization ?? "";
  if (!header.startsWith("Basic ")) return null;
  const [id, secret] = Buffer.from(header.slice(6), "base64")
    .toString("utf8")
    .split(":");
  const client = clients.find((c) => c.clientId === id);
  return client && secret && safeEqual(secret, client.clientSecret)
    ? client
    : null;
}

/**
 * Device sessions: a short-lived token naming one subscriber, minted at the relying party's
 * request after it signed the person in. HMAC-signed, so the provider stores no session table.
 */
export function deviceToken(
  secret: string,
  subscriberId: string,
  ttlMs: number,
) {
  const body = Buffer.from(
    JSON.stringify({ sub: subscriberId, exp: Date.now() + ttlMs }),
  ).toString("base64url");
  const mac = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function deviceSubscriber(req: IncomingMessage, secret: string) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", secret)
    .update(body)
    .digest("base64url");
  if (!safeEqual(mac, expected)) return null;
  try {
    const claims = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as {
      sub: string;
      exp: number;
    };
    return claims.exp > Date.now() ? claims.sub : null;
  } catch {
    return null;
  }
}

/** Webhook bodies are signed so the relying party can tell they come from this provider. */
export const webhookSignature = (secret: string, body: string) =>
  "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
