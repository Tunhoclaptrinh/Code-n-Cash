import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * The remote signing service as a separate process (apps/signer, built to dist), checked against
 * its contract (apps/signer/openapi.yaml), and CodeCash's side of it (trust/remote-signer).
 */
const PORT = 3290 + Math.floor(Math.random() * 9);
const HOOK_PORT = PORT + 100;
const base = `http://127.0.0.1:${PORT}`;
const basic = "Basic " + Buffer.from("codecash:test-secret").toString("base64");
let dir, trust, child, hookServer;
const hooks = [];

const call = async (path, init = {}) => {
  const res = await fetch(base + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const rp = (path, body, extra = {}) =>
  call(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: basic, ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const hashOf = (text) => createHash("sha256").update(text).digest("hex");

before(async () => {
  dir = await mkdtemp(join(tmpdir(), "codecash-signer-"));
  trust = await mkdtemp(join(tmpdir(), "codecash-signer-trust-"));
  hookServer = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      hooks.push({ signature: req.headers["x-signer-signature"], body });
      res.end("ok");
    });
  }).listen(HOOK_PORT);
  child = spawn(process.execPath, ["apps/signer/dist/main.js"], {
    env: {
      ...process.env,
      SIGNER_PORT: String(PORT),
      SIGNER_DATA_DIR: dir,
      SIGNER_CLIENT_SECRET: "test-secret",
      SIGNER_WEBHOOK_SECRET: "test-webhook",
      SIGNER_DEVICE_SECRET: "test-device",
    },
    stdio: "ignore",
  });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(base + "/health")).ok) break;
    } catch {
      /* starting */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  // CodeCash's client of the service reads its configuration from the environment.
  Object.assign(process.env, {
    SIGNER_URL: base,
    SIGNER_CLIENT_SECRET: "test-secret",
    SIGNER_WEBHOOK_SECRET: "test-webhook",
    TRUST_DIR: trust,
  });
});
after(async () => {
  child?.kill();
  hookServer?.close();
  await rm(dir, { recursive: true, force: true });
  await rm(trust, { recursive: true, force: true });
});

test("relying party calls need the client credentials; discovery does not", async () => {
  assert.equal((await call("/health")).status, 200);
  assert.equal((await call("/v1/ca")).body.trusted, false);
  assert.equal((await call("/v1/credentials/u-1")).status, 401);
  const wrong = await call("/v1/credentials/u-1", {
    headers: {
      Authorization: "Basic " + Buffer.from("codecash:nope").toString("base64"),
    },
  });
  assert.equal(wrong.status, 401);
  assert.equal((await call("/v1/device/transactions")).status, 401);
});

test("a person confirms on the device; the service signs only after the right PIN", async () => {
  const first = await rp("/v1/credentials", {
    subscriberId: "u-1",
    commonName: "Nguyễn Văn An",
    organization: "Nova An",
  });
  const again = await rp("/v1/credentials", {
    subscriberId: "u-1",
    commonName: "Other",
  });
  assert.equal(again.body.id, first.body.id, "enrolment is idempotent");
  assert.equal(first.body.certificate.policy, "DEMO_NOT_QUALIFIED");

  const payload = {
    kind: "CONTRACT_SIGNATURE",
    contractCode: "CT1",
    stepNo: 1,
  };
  const { canonical } =
    await import("../../apps/api/dist/common/audit-chain.js");
  const hash = hashOf(canonical(payload));
  const created = await rp(
    "/v1/signatures",
    {
      subscriberId: "u-1",
      hash,
      display: { title: "CT1" },
      callbackUrl: `http://127.0.0.1:${HOOK_PORT}/cb`,
    },
    { "Idempotency-Key": "RQ-1" },
  );
  assert.equal(created.status, 201);
  assert.equal(created.body.status, "PENDING");
  assert.match(created.body.confirmationCode, /^\d{4}$/);
  const repeat = await rp(
    "/v1/signatures",
    { subscriberId: "u-1", hash },
    { "Idempotency-Key": "RQ-1" },
  );
  assert.equal(
    repeat.body.id,
    created.body.id,
    "same idempotency key, same transaction",
  );
  assert.equal(
    (await rp("/v1/signatures", { subscriberId: "u-1", hash: "abc" })).body
      .code,
    "INVALID_HASH",
  );

  const session = await rp("/v1/device-sessions", { subscriberId: "u-1" });
  const device = { Authorization: "Bearer " + session.body.token };
  const list = await call("/v1/device/transactions", { headers: device });
  assert.equal(list.body.items[0].id, created.body.id);
  assert.equal(
    list.body.items[0].result,
    undefined,
    "devices never read the signature",
  );

  const id = created.body.id;
  const wrong = await call(`/v1/device/transactions/${id}/approve`, {
    method: "POST",
    headers: device,
    body: JSON.stringify({ pin: "000000" }),
  });
  assert.deepEqual(
    [wrong.status, wrong.body.code, wrong.body.triesLeft],
    [401, "WRONG_PIN", 2],
  );
  const ok = await call(`/v1/device/transactions/${id}/approve`, {
    method: "POST",
    headers: device,
    body: JSON.stringify({ pin: "123456" }),
  });
  assert.equal(ok.body.status, "SIGNED");
  const done = await rp(`/v1/signatures/${id}`);
  assert.equal(done.body.result.algorithm, "Ed25519");

  // CodeCash's side: pin the CA, then check the signature from first principles.
  const remote = await import("../../apps/api/dist/trust/remote-signer.js");
  await remote.ensureCa();
  const input = {
    payload,
    hash,
    signature: done.body.result.signature,
    certificate: done.body.result.certificate,
    signerUserId: "u-1",
  };
  assert.equal(remote.verifyRemoteSignature(input), true);
  assert.equal(
    remote.verifyRemoteSignature({
      ...input,
      payload: { ...payload, stepNo: 2 },
    }),
    false,
    "a changed payload no longer matches the signed hash",
  );
  assert.equal(
    remote.verifyRemoteSignature({ ...input, signerUserId: "u-2" }),
    false,
    "the certificate names another person",
  );
  assert.equal(
    remote.verifyRemoteSignature({
      ...input,
      certificate: {
        ...input.certificate,
        notAfter: "2000-01-01T00:00:00.000Z",
      },
    }),
    false,
    "an edited certificate fails the CA signature",
  );

  // The webhook arrives signed with the shared secret.
  for (let i = 0; i < 30 && !hooks.length; i++)
    await new Promise((r) => setTimeout(r, 100));
  const hook = hooks.find((h) => JSON.parse(h.body).transaction.id === id);
  assert.ok(hook, "webhook delivered");
  assert.equal(JSON.parse(hook.body).type, "signature.completed");
  assert.equal(
    remote.webhookAuthentic(Buffer.from(hook.body), hook.signature),
    true,
  );
  assert.equal(
    remote.webhookAuthentic(Buffer.from(hook.body + " "), hook.signature),
    false,
  );
  assert.equal(
    hook.signature,
    "sha256=" +
      createHmac("sha256", "test-webhook").update(hook.body).digest("hex"),
  );
  const twice = await call(`/v1/device/transactions/${id}/approve`, {
    method: "POST",
    headers: device,
    body: JSON.stringify({ pin: "123456" }),
  });
  assert.equal(twice.body.code, "TRANSACTION_NOT_PENDING");
});

test("three wrong PINs lock the device; a new request replaces the old one", async () => {
  await rp("/v1/credentials", {
    subscriberId: "u-3",
    commonName: "Trần Thị Mai",
  });
  const device = {
    Authorization:
      "Bearer " +
      (await rp("/v1/device-sessions", { subscriberId: "u-3" })).body.token,
  };
  const a = await rp("/v1/signatures", {
    subscriberId: "u-3",
    hash: hashOf("a"),
  });
  const b = await rp("/v1/signatures", {
    subscriberId: "u-3",
    hash: hashOf("b"),
  });
  const items = (await call("/v1/device/transactions", { headers: device }))
    .body.items;
  assert.equal(items.find((t) => t.id === a.body.id).status, "CANCELLED");
  const codes = [];
  for (let i = 0; i < 3; i++)
    codes.push(
      (
        await call(`/v1/device/transactions/${b.body.id}/approve`, {
          method: "POST",
          headers: device,
          body: JSON.stringify({ pin: "999999" }),
        })
      ).status,
    );
  assert.deepEqual(codes, [401, 401, 423]);
  const locked = await call(`/v1/device/transactions/${b.body.id}/approve`, {
    method: "POST",
    headers: device,
    body: JSON.stringify({ pin: "123456" }),
  });
  assert.equal(
    locked.body.code,
    "PIN_LOCKED",
    "even the right PIN waits for the lock",
  );
  const rejected = await call(`/v1/device/transactions/${b.body.id}/reject`, {
    method: "POST",
    headers: device,
  });
  assert.equal(rejected.body.status, "REJECTED");
  // Another person's device cannot see or decide these requests.
  const other = {
    Authorization:
      "Bearer " +
      (await rp("/v1/device-sessions", { subscriberId: "u-1" })).body.token,
  };
  const foreign = await call(`/v1/device/transactions/${b.body.id}/reject`, {
    method: "POST",
    headers: other,
  });
  assert.equal(foreign.status, 404);
});
