/** Run against a disposable API data directory: tests create and clean up their own records. */
import assert from "node:assert/strict";
const base = process.env.API_BASE_URL ?? "http://127.0.0.1:3000/api/v1";
async function request(path, method = "GET", body, token) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}
assert.equal((await request("/resources/users")).status, 401);
const login = await request("/auth/login", "POST", {
  email: "admin@novaan.vn",
  password: "Passw0rd!",
});
assert.equal(login.status, 201);
const admin = login.body.data.token;
const owner = (
  await request("/auth/login", "POST", {
    email: "owner@novaan.vn",
    password: "Passw0rd!",
  })
).body.data.token;
const supplier = (
  await request("/auth/login", "POST", {
    email: "supplier@phuminh.vn",
    password: "Passw0rd!",
  })
).body.data.token;
assert.equal(
  (
    await request(
      "/resources/organizations",
      "POST",
      { name: "Forbidden", code: "X", kind: "BUYER" },
      supplier,
    )
  ).status,
  403,
);
assert.equal(
  (await request("/engine/decisions", "GET", undefined, supplier)).status,
  403,
);
assert.equal(
  (await request("/resources/audit", "POST", { action: "FAKE" }, admin)).status,
  403,
);
assert.equal(
  (await request("/resources/users?limit=999", "GET", undefined, admin)).status,
  400,
);
const created = await request(
  "/resources/contract-drafts",
  "POST",
  {
    code: `SMOKE-${Date.now()}`,
    title: "Smoke draft",
    supplierId: "org-phu-minh",
    contractType: "GOODS_SUPPLY",
  },
  owner,
);
assert.equal(created.status, 201);
const item = created.body.data;
assert.equal(
  (
    await request(
      "/resources/contract-drafts/" + item.id,
      "GET",
      undefined,
      supplier,
    )
  ).status,
  404,
);
const updated = await request(
  "/resources/contract-drafts/" + item.id,
  "PATCH",
  { title: "Updated", version: item.version },
  owner,
);
assert.equal(updated.status, 200);
assert.equal(
  (
    await request(
      "/resources/contract-drafts/" + item.id,
      "PATCH",
      { title: "Stale", version: item.version },
      owner,
    )
  ).status,
  409,
);
assert.equal(
  (
    await request(
      "/resources/contract-drafts/" + item.id,
      "DELETE",
      undefined,
      owner,
    )
  ).status,
  200,
);
const engine = await request("/engine/evaluate", "POST", {}, admin);
assert.equal(engine.status, 201);
assert.equal(engine.body.data.rows.length, 405);
assert.equal(Object.keys(engine.body.data.rows[0]).length, 22);
assert.equal(engine.body.data.summary.sampleMatched, 20);
console.log(
  "API smoke passed: auth, RBAC, scope, CRUD, stale versions, pagination, append-only audit, engine/schema.",
);
