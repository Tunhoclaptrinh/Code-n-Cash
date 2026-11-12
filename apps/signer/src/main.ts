/**
 * CodeCash Sign: a simulated remote signing provider, run as its own service.
 *
 * It plays the part a commercial CA plays for remote signing (SmartCA, MySign...): it holds each
 * subscriber's key and certificate, receives a hash to sign from a relying party (CodeCash),
 * asks the person to confirm on their device (a phone app or a USB token, both simulated in the
 * browser), signs only after the PIN, and reports back by webhook. Contract: ../openapi.yaml.
 *
 * Two audiences, two credentials:
 * - relying parties call /v1/credentials, /v1/device-sessions, /v1/signatures with HTTP Basic;
 * - devices call /v1/device/* with a short-lived token the relying party obtained for the person.
 */
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { resolve } from "node:path";
import {
  clientOf,
  deviceSubscriber,
  deviceToken,
  type ClientConfig,
} from "./auth";
import { CertificateAuthority, hashPin, pinMatches } from "./ca";
import { JsonStore } from "./store";
import type { Channel, Credential, Transaction } from "./types";
import { deliver } from "./webhook";

const env = (name: string, fallback: string) => process.env[name] || fallback;
const PORT = Number(env("SIGNER_PORT", "3200"));
const DATA_DIR = resolve(env("SIGNER_DATA_DIR", ".data/signer"));
const CLIENTS: ClientConfig[] = [
  {
    clientId: env("SIGNER_CLIENT_ID", "codecash"),
    clientSecret: env("SIGNER_CLIENT_SECRET", "codecash-dev-secret"),
  },
];
const WEBHOOK_SECRET = env("SIGNER_WEBHOOK_SECRET", "codecash-dev-webhook");
const DEVICE_SECRET = env(
  "SIGNER_DEVICE_SECRET",
  randomBytes(32).toString("hex"),
);
/** Every demo subscriber starts with this PIN; the device screen says so. */
const DEFAULT_PIN = env("SIGNER_DEFAULT_PIN", "123456");
const TRANSACTION_TTL_MS = 5 * 60 * 1000;
const DEVICE_SESSION_MS = 12 * 60 * 60 * 1000;
const MAX_PIN_TRIES = 3;
const PIN_LOCK_MS = 5 * 60 * 1000;

const ca = new CertificateAuthority(DATA_DIR);
const store = new JsonStore(resolve(DATA_DIR, "signer.json"));

/* ------------------------------- HTTP helpers ------------------------------- */

class Problem extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  let text = "";
  for await (const chunk of req) {
    text += chunk;
    if (text.length > 64 * 1024) throw new Problem(413, "PAYLOAD_TOO_LARGE");
  }
  if (!text) return {};
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new Problem(400, "INVALID_JSON");
  }
}

const text = (value: unknown, max = 200) =>
  typeof value === "string" && value.trim() && value.length <= max
    ? value.trim()
    : null;

/* ------------------------------- domain views ------------------------------- */

/** What anyone outside the provider sees of a transaction: never the PIN or the key. */
function publicTransaction(t: Transaction, withResult: boolean) {
  const credential = store.read((d) =>
    d.credentials.find((c) => c.id === t.credentialId),
  );
  return {
    id: t.id,
    status: t.status,
    channel: t.channel,
    display: t.display,
    hash: t.hash,
    confirmationCode: t.confirmationCode,
    createdAt: t.createdAt,
    expiresAt: t.expiresAt,
    finishedAt: t.finishedAt,
    ...(withResult && t.status === "SIGNED"
      ? {
          result: {
            algorithm: "Ed25519",
            signature: t.signature,
            certificate: credential?.certificate,
          },
        }
      : {}),
  };
}

function credentialView(c: Credential) {
  return {
    id: c.id,
    subscriberId: c.subscriberId,
    certificate: c.certificate,
    locked: !!c.lockedUntil && Date.parse(c.lockedUntil) > Date.now(),
    lockedUntil: c.lockedUntil,
    triesLeft: Math.max(0, MAX_PIN_TRIES - c.failedPins),
    demoPin: DEFAULT_PIN,
  };
}

/* ---------------------------- device event stream --------------------------- */

const streams = new Map<string, Set<ServerResponse>>();
function notifyDevice(subscriberId: string, transaction: Transaction) {
  const event = `event: transaction\ndata: ${JSON.stringify(publicTransaction(transaction, false))}\n\n`;
  for (const res of streams.get(subscriberId) ?? []) res.write(event);
}

/** Tells the relying party how a transaction ended, and the person's open devices. */
function finished(transaction: Transaction) {
  notifyDevice(transaction.subscriberId, transaction);
  if (!transaction.callbackUrl) return;
  const type = {
    SIGNED: "signature.completed",
    REJECTED: "signature.rejected",
    EXPIRED: "signature.expired",
    CANCELLED: "signature.cancelled",
    PENDING: "signature.pending",
  }[transaction.status];
  void deliver(
    transaction.callbackUrl,
    WEBHOOK_SECRET,
    { type, transaction: publicTransaction(transaction, true) },
    (attempt) =>
      void store.change((d) => {
        const t = d.transactions.find((x) => x.id === transaction.id);
        if (!t) return;
        t.webhook.attempts += 1;
        t.webhook.lastError = attempt.error;
        if (attempt.ok) t.webhook.deliveredAt = new Date().toISOString();
      }),
  );
}

/* --------------------------------- handlers -------------------------------- */

async function enroll(input: Record<string, unknown>) {
  const subscriberId = text(input.subscriberId, 100);
  const commonName = text(input.commonName);
  const organization = text(input.organization) ?? "";
  if (!subscriberId || !commonName)
    throw new Problem(400, "INVALID_SUBSCRIBER");
  return store.change((d) => {
    const existing = d.credentials.find((c) => c.subscriberId === subscriberId);
    if (existing) return credentialView(existing);
    const id = randomUUID();
    const pin = hashPin(DEFAULT_PIN);
    const credential: Credential = {
      id,
      subscriberId,
      certificate: ca.issue(
        id,
        { subscriberId, commonName, organization },
        new Date(),
      ),
      pinSalt: pin.salt,
      pinHash: pin.hash,
      failedPins: 0,
      lockedUntil: null,
      createdAt: new Date().toISOString(),
    };
    d.credentials.push(credential);
    return credentialView(credential);
  });
}

async function createSignature(
  client: ClientConfig,
  input: Record<string, unknown>,
  idempotencyKey: string | null,
) {
  const subscriberId = text(input.subscriberId, 100);
  const hash = typeof input.hash === "string" ? input.hash.toLowerCase() : "";
  const channel = input.channel === "USB_TOKEN" ? "USB_TOKEN" : "MOBILE_APP";
  const display = (input.display ?? {}) as Record<string, unknown>;
  const callbackUrl = text(input.callbackUrl, 500);
  if (!subscriberId) throw new Problem(400, "INVALID_SUBSCRIBER");
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Problem(400, "INVALID_HASH");
  if (callbackUrl && !/^https?:\/\//.test(callbackUrl))
    throw new Problem(400, "INVALID_CALLBACK");
  const created = await store.change((d) => {
    if (idempotencyKey) {
      const again = d.transactions.find(
        (t) =>
          t.clientId === client.clientId && t.idempotencyKey === idempotencyKey,
      );
      if (again) return { transaction: again, replaced: [] as Transaction[] };
    }
    const credential = d.credentials.find(
      (c) => c.subscriberId === subscriberId,
    );
    if (!credential) throw new Problem(404, "SUBSCRIBER_NOT_ENROLLED");
    // One open request per person and channel, as on a real phone app.
    const replaced: Transaction[] = [];
    for (const open of d.transactions)
      if (
        open.subscriberId === subscriberId &&
        open.clientId === client.clientId &&
        open.status === "PENDING"
      ) {
        open.status = "CANCELLED";
        open.finishedAt = new Date().toISOString();
        replaced.push(open);
      }
    const now = Date.now();
    const transaction: Transaction = {
      id: `TX-${randomBytes(6).toString("hex").toUpperCase()}`,
      clientId: client.clientId,
      credentialId: credential.id,
      subscriberId,
      channel: channel as Channel,
      display: {
        title: text(display.title) ?? "Tài liệu",
        relyingParty: text(display.relyingParty) ?? client.clientId,
        reference: text(display.reference, 100) ?? "",
      },
      hash,
      confirmationCode: String(randomInt(1000, 10000)),
      status: "PENDING",
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + TRANSACTION_TTL_MS).toISOString(),
      finishedAt: null,
      callbackUrl,
      idempotencyKey,
      signature: null,
      webhook: { attempts: 0, deliveredAt: null, lastError: null },
    };
    d.transactions.push(transaction);
    return { transaction, replaced };
  });
  for (const old of created.replaced) notifyDevice(old.subscriberId, old);
  notifyDevice(subscriberId, created.transaction);
  return publicTransaction(created.transaction, false);
}

async function decide(
  subscriberId: string,
  id: string,
  approve: boolean,
  pin: string | null,
) {
  const outcome = await store.change((d) => {
    const t = d.transactions.find(
      (x) => x.id === id && x.subscriberId === subscriberId,
    );
    if (!t) throw new Problem(404, "TRANSACTION_NOT_FOUND");
    if (t.status !== "PENDING")
      throw new Problem(409, "TRANSACTION_NOT_PENDING");
    if (Date.parse(t.expiresAt) <= Date.now()) {
      t.status = "EXPIRED";
      t.finishedAt = new Date().toISOString();
      return { t, problem: new Problem(409, "TRANSACTION_EXPIRED") };
    }
    if (!approve) {
      t.status = "REJECTED";
      t.finishedAt = new Date().toISOString();
      return { t, problem: null };
    }
    const credential = d.credentials.find((c) => c.id === t.credentialId)!;
    if (
      credential.lockedUntil &&
      Date.parse(credential.lockedUntil) > Date.now()
    )
      return {
        t: null,
        problem: new Problem(423, "PIN_LOCKED", {
          lockedUntil: credential.lockedUntil,
        }),
      };
    if (!pin || !pinMatches(pin, credential.pinSalt, credential.pinHash)) {
      credential.failedPins += 1;
      const triesLeft = MAX_PIN_TRIES - credential.failedPins;
      if (triesLeft <= 0) {
        credential.lockedUntil = new Date(
          Date.now() + PIN_LOCK_MS,
        ).toISOString();
        credential.failedPins = 0;
        return {
          t: null,
          problem: new Problem(423, "PIN_LOCKED", {
            lockedUntil: credential.lockedUntil,
          }),
        };
      }
      return { t: null, problem: new Problem(401, "WRONG_PIN", { triesLeft }) };
    }
    credential.failedPins = 0;
    credential.lockedUntil = null;
    t.signature = ca.signHash(t.credentialId, t.hash);
    t.status = "SIGNED";
    t.finishedAt = new Date().toISOString();
    return { t, problem: null };
  });
  if (outcome.t) finished(outcome.t);
  if (outcome.problem) throw outcome.problem;
  return publicTransaction(outcome.t!, false);
}

/* ---------------------------------- routes ---------------------------------- */

async function route(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://signer");
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = req.method ?? "GET";

  if (method === "GET" && path === "/health")
    return send(res, 200, { status: "ok", service: "codecash-signer" });
  if (method === "GET" && path === "/v1/ca")
    return send(res, 200, ca.describe());

  // Device side: the person's own app or token, identified by a device session token.
  if (path.startsWith("/v1/device/")) {
    const subscriberId = deviceSubscriber(req, DEVICE_SECRET);
    if (!subscriberId) throw new Problem(401, "DEVICE_SESSION_REQUIRED");
    if (method === "GET" && path === "/v1/device/credential") {
      const credential = store.read((d) =>
        d.credentials.find((c) => c.subscriberId === subscriberId),
      );
      if (!credential) throw new Problem(404, "SUBSCRIBER_NOT_ENROLLED");
      return send(res, 200, credentialView(credential));
    }
    if (method === "GET" && path === "/v1/device/transactions") {
      const list = store.read((d) =>
        d.transactions
          .filter((t) => t.subscriberId === subscriberId)
          .slice(-10)
          .reverse()
          .map((t) => publicTransaction(t, false)),
      );
      return send(res, 200, { items: list });
    }
    if (method === "GET" && path === "/v1/device/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      res.write("retry: 5000\n\nevent: ready\ndata: {}\n\n");
      const set = streams.get(subscriberId) ?? new Set();
      set.add(res);
      streams.set(subscriberId, set);
      const ping = setInterval(() => res.write(": ping\n\n"), 25_000);
      req.on("close", () => {
        clearInterval(ping);
        set.delete(res);
      });
      return;
    }
    const match =
      /^\/v1\/device\/transactions\/([\w-]+)\/(approve|reject)$/.exec(path);
    if (method === "POST" && match) {
      const input = await body(req);
      return send(
        res,
        200,
        await decide(
          subscriberId,
          match[1],
          match[2] === "approve",
          typeof input.pin === "string" ? input.pin : null,
        ),
      );
    }
    throw new Problem(404, "NOT_FOUND");
  }

  // Relying party side.
  const client = clientOf(req, CLIENTS);
  if (!client) throw new Problem(401, "CLIENT_AUTH_REQUIRED");
  if (method === "POST" && path === "/v1/credentials")
    return send(res, 200, await enroll(await body(req)));
  const credentialMatch = /^\/v1\/credentials\/([^/]+)$/.exec(path);
  if (method === "GET" && credentialMatch) {
    const credential = store.read((d) =>
      d.credentials.find(
        (c) => c.subscriberId === decodeURIComponent(credentialMatch[1]),
      ),
    );
    if (!credential) throw new Problem(404, "SUBSCRIBER_NOT_ENROLLED");
    return send(res, 200, credentialView(credential));
  }
  if (method === "POST" && path === "/v1/device-sessions") {
    const input = await body(req);
    const subscriberId = text(input.subscriberId, 100);
    if (!subscriberId) throw new Problem(400, "INVALID_SUBSCRIBER");
    return send(res, 200, {
      token: deviceToken(DEVICE_SECRET, subscriberId, DEVICE_SESSION_MS),
      expiresAt: new Date(Date.now() + DEVICE_SESSION_MS).toISOString(),
    });
  }
  if (method === "POST" && path === "/v1/signatures") {
    const key = req.headers["idempotency-key"];
    return send(
      res,
      201,
      await createSignature(
        client,
        await body(req),
        typeof key === "string" ? key.slice(0, 100) : null,
      ),
    );
  }
  const signatureMatch = /^\/v1\/signatures\/([\w-]+)(\/cancel)?$/.exec(path);
  if (signatureMatch) {
    const id = signatureMatch[1];
    const found = store.read((d) =>
      d.transactions.find((t) => t.id === id && t.clientId === client.clientId),
    );
    if (!found) throw new Problem(404, "TRANSACTION_NOT_FOUND");
    if (method === "GET" && !signatureMatch[2])
      return send(res, 200, publicTransaction(found, true));
    if (method === "POST" && signatureMatch[2]) {
      const cancelled = await store.change((d) => {
        const t = d.transactions.find((x) => x.id === id)!;
        if (t.status === "PENDING") {
          t.status = "CANCELLED";
          t.finishedAt = new Date().toISOString();
        }
        return t;
      });
      notifyDevice(cancelled.subscriberId, cancelled);
      return send(res, 200, publicTransaction(cancelled, false));
    }
  }
  throw new Problem(404, "NOT_FOUND");
}

/** Pending requests past their time expire, and the relying party hears about it. */
setInterval(() => {
  void store
    .change((d) => {
      const expired: Transaction[] = [];
      for (const t of d.transactions)
        if (t.status === "PENDING" && Date.parse(t.expiresAt) <= Date.now()) {
          t.status = "EXPIRED";
          t.finishedAt = new Date().toISOString();
          expired.push(t);
        }
      return expired;
    })
    .then((expired) => expired.forEach(finished));
}, 5000).unref();

createServer((req, res) => {
  route(req, res).catch((error: unknown) => {
    if (error instanceof Problem)
      return send(res, error.status, { code: error.code, ...error.extra });
    console.error(error);
    send(res, 500, { code: "INTERNAL_ERROR" });
  });
}).listen(PORT, () => {
  console.log(
    `codecash-signer on :${PORT} · data ${DATA_DIR} · CA ${ca.keyFingerprint.slice(0, 16)}`,
  );
  if (!process.env.SIGNER_CLIENT_SECRET)
    console.warn("SIGNER_CLIENT_SECRET not set: using the development secret");
});
