/** Run against a disposable API data directory: tests create and clean up their own records. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
assert.equal(
  (await request("/health")).body.data.storage,
  process.env.SMOKE_STORAGE_DRIVER ?? "file",
  "Run against an isolated fixture; Mongo CI must opt in with SMOKE_STORAGE_DRIVER=mongo",
);
assert.equal((await request("/resources/users")).status, 401);
const login = await request("/auth/login", "POST", {
  email: "controller@novaan.vn",
  password: "Passw0rd!",
});
assert.equal(login.status, 201);
// The buyer's own controller (ADMIN_AUDITOR of B010): reads its contracts, takes no business action.
const admin = login.body.data.token;
// Accounts and configuration belong to the system administrator, not the controller (SoD-1).
const sysadmin = (
  await request("/auth/login", "POST", {
    email: "sysadmin@codecash.vn",
    password: "Passw0rd!",
  })
).body.data.token;
// Full versions exceed the default 100 kB JSON limit; exercise real HTTP rather than only services.
const catalog = await request(
  "/trust/rules/language",
  "GET",
  undefined,
  sysadmin,
);
assert.equal(catalog.status, 200);
assert.equal(catalog.body.data.variables.length, 22);
const ruleDraft = await request(
  "/trust/rules",
  "POST",
  {
    name: "HTTP rule diagnostics",
    reason: "Validate complete payload and preview",
  },
  sysadmin,
);
assert.equal(ruleDraft.status, 201);
const ruleVersion = ruleDraft.body.data;
const validRules = await request(
  "/trust/rules/validate",
  "POST",
  { rules: ruleVersion.rules },
  sysadmin,
);
assert.equal(validRules.status, 201);
assert.equal(validRules.body.data.checked, 384);
assert.equal(validRules.body.data.valid, true);
const invalidRules = structuredClone(ruleVersion.rules);
invalidRules[0].condition_expression = "open_dispute == 1";
const invalidRuleResult = await request(
  "/trust/rules/validate",
  "POST",
  { rules: invalidRules },
  sysadmin,
);
assert.equal(invalidRuleResult.status, 201);
assert.equal(invalidRuleResult.body.data.issues[0].code, "TYPE_MISMATCH");
for (const [expression, code] of [
  ["planned_payment_vnd_mn + grace_period_days", "UNIT_MISMATCH"],
  ["max_penalty_pct * planned_payment_vnd_mn", "PERCENT_CONVERSION_REQUIRED"],
  ["0 - 1", "NEGATIVE_AMOUNT"],
]) {
  const changed = structuredClone(ruleVersion.rules);
  changed[0].payable_amount_formula = expression;
  const checked = await request(
    "/trust/rules/validate",
    "POST",
    { rules: changed },
    sysadmin,
  );
  assert.equal(checked.status, 201);
  assert.equal(checked.body.data.issues[0].code, code);
}
const impossible = structuredClone(ruleVersion.rules);
impossible.find((row) => row.rule_id === "PR0023").payable_amount_formula =
  "planned_payment_vnd_mn / (required_event_completion_rate - required_event_completion_rate)";
const failedPreview = await request(
  `/trust/rules/${ruleVersion.id}/preview`,
  "POST",
  {
    version: ruleVersion.version,
    rules: impossible,
    templates: ruleVersion.templates,
  },
  sysadmin,
);
assert.equal(failedPreview.status, 400);
assert.equal(failedPreview.body.code, "RULE_EVALUATION_FAILED");
const previewRules = await request(
  `/trust/rules/${ruleVersion.id}/preview`,
  "POST",
  {
    version: ruleVersion.version,
    rules: ruleVersion.rules,
    templates: ruleVersion.templates,
  },
  sysadmin,
);
assert.equal(previewRules.status, 201);
assert.equal(previewRules.body.data.canSubmit, true);
assert.equal(previewRules.body.data.evaluated, 405);
const saveRules = await request(
  `/trust/rules/${ruleVersion.id}`,
  "PATCH",
  {
    version: ruleVersion.version,
    rules: ruleVersion.rules,
    templates: ruleVersion.templates,
  },
  sysadmin,
);
assert.equal(saveRules.status, 200);
assert.equal(
  (
    await request(
      "/trust/rules",
      "POST",
      { padding: "x".repeat(4 * 1024 * 1024) },
      sysadmin,
    )
  ).status,
  413,
);
const invalidJson = await fetch(base + "/trust/rules", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${sysadmin}`,
  },
  body: "{",
});
assert.equal(invalidJson.status, 400);
assert.equal((await invalidJson.json()).code, "INVALID_JSON");
assert.equal(
  (await request("/resources/users", "GET", undefined, admin)).status,
  403,
);
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
for (const [path, method, body] of [
  ["/trust/rules/language", "GET", undefined],
  ["/trust/rules/validate", "POST", { rules: ruleVersion.rules }],
  [
    `/trust/rules/${ruleVersion.id}/preview`,
    "POST",
    {
      version: ruleVersion.version,
      rules: ruleVersion.rules,
      templates: ruleVersion.templates,
    },
  ],
]) {
  assert.equal((await request(path, method, body, supplier)).status, 403);
}
assert.equal(
  (await request("/trust/rules/language", "GET", undefined, supplier)).status,
  403,
);
assert.equal(
  (
    await request(
      "/trust/rules/validate",
      "POST",
      { rules: ruleVersion.rules },
      supplier,
    )
  ).status,
  403,
);
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
  (await request("/resources/users?limit=999", "GET", undefined, sysadmin))
    .status,
  400,
);
const created = await request(
  "/resources/contract-drafts",
  "POST",
  {
    code: `SMOKE-${Date.now()}`,
    title: "Smoke draft",
    supplierId: "S015",
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
  // Suppliers hold no contract-drafts:read permission (packages/contracts/permissions.json).
  403,
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
// Data Pack and workflow records change only through their own actions (managedOrigins).
const dataPackBuyer = (
  await request("/resources/organizations/B010", "GET", undefined, sysadmin)
).body.data;
const renamed = await request(
  "/resources/organizations/B010",
  "PATCH",
  { name: "Renamed", version: dataPackBuyer.version },
  sysadmin,
);
assert.equal(renamed.status, 403);
assert.equal(renamed.body.code, "MANAGED_RECORD");
// Workflow over the Data Pack: the API decides nothing itself, the engine does.
const workflow = (module, action, args, token) =>
  request(`/workflow/${module}/${action}`, "POST", { args }, token);
const finance = (
  await request("/auth/login", "POST", {
    email: "finance@novaan.vn",
    password: "Passw0rd!",
  })
).body.data.token;
// Dynamic contract templates use the same CRUD guard, versions and workflow catalog over HTTP.
const templateBody = {
  code: `HTTP_TEMPLATE_${Date.now()}`,
  name: "HTTP dynamic template",
  contractType: "SERVICES",
  approvalPolicy: "FINANCE_PLUS_OWNER",
  valueMillion: "1200.50",
  graceDays: 7,
  penaltyRatePct: "0.25",
  maxPenaltyPct: "8.00",
  signerRoles: "CONTRACT_OWNER",
  documentBody: "Terms for {{buyer}}",
  active: true,
};
assert.equal(
  (await request("/resources/contract-templates", "POST", templateBody, admin))
    .status,
  403,
);
assert.equal(
  (await request("/resources/contract-templates", "POST", templateBody, owner))
    .status,
  403,
);
const templateCreated = await request(
  "/resources/contract-templates",
  "POST",
  templateBody,
  sysadmin,
);
assert.equal(templateCreated.status, 201);
const templateId = templateCreated.body.data.id;
const activePresets = await workflow(
  "drafts",
  "getUploadFormOptions",
  [],
  owner,
);
assert.equal(
  activePresets.body.data.presets.find((row) => row.id === templateId).defaults
    .documentBody,
  templateBody.documentBody,
);
const templateUpdated = await request(
  `/resources/contract-templates/${templateId}`,
  "PATCH",
  { version: 1, documentBody: "Revised text", active: false },
  sysadmin,
);
assert.equal(templateUpdated.status, 200);
assert.equal(
  (
    await request(
      `/resources/contract-templates/${templateId}`,
      "PATCH",
      { version: 1, name: "stale" },
      sysadmin,
    )
  ).status,
  409,
);
assert.ok(
  !(
    await workflow("drafts", "getUploadFormOptions", [], owner)
  ).body.data.presets.some((row) => row.id === templateId),
);
assert.equal(
  (
    await request(
      `/resources/contract-templates/${templateId}`,
      "DELETE",
      undefined,
      sysadmin,
    )
  ).status,
  200,
);
const ownerList = await workflow("contracts", "getContractList", [], owner);
assert.equal(ownerList.status, 201);
assert.ok(ownerList.body.data.contracts.some((c) => c.id === "CT0019"));
assert.ok(ownerList.body.data.contracts.every((c) => c.buyer.id === "B010"));
const supplierList = await workflow(
  "contracts",
  "getContractList",
  [],
  supplier,
);
assert.ok(
  supplierList.body.data.contracts.every((c) => c.supplier.id === "S015"),
);
assert.equal(
  (await workflow("contracts", "getContractOverview", ["CT0001"], supplier))
    .status,
  403,
);
const tasks = await workflow("tasks", "getTaskInbox", [], finance);
assert.ok(
  tasks.body.data.some(
    (t) => t.kind === "APPROVE_PAYMENT" && t.contractId === "CT0103",
  ),
);
const vote = await workflow(
  "approvals",
  "castVote",
  [{ contractId: "CT0103", sequence: 2, choice: "APPROVE" }],
  finance,
);
assert.equal(vote.status, 201);
assert.equal(vote.body.data.evaluation.decision, "PENALTY");
assert.equal(
  (
    await workflow(
      "approvals",
      "castVote",
      [{ contractId: "CT0103", sequence: 2, choice: "APPROVE" }],
      supplier,
    )
  ).status,
  403,
);

// Lists are read page by page; search ignores accents, the total covers every page.
const paged = await workflow(
  "contracts",
  "listContracts",
  [
    {
      page: 1,
      limit: 5,
      search: "thiet bi",
      sortBy: "valueMillion",
      sortOrder: "desc",
    },
  ],
  owner,
);
assert.equal(paged.status, 201);
assert.ok(paged.body.data.items.length <= 5);
assert.ok(paged.body.data.total >= paged.body.data.items.length);
assert.ok(paged.body.data.items.every((c) => /thiết bị/i.test(c.title)));
assert.equal(
  (
    await workflow(
      "contracts",
      "listContracts",
      [{ filters: { secret: ["x"] } }],
      owner,
    )
  ).status,
  400,
);
// Replay of one milestone, and the integrity check over the audit chain, evidence and decisions.
const timeline = await workflow(
  "contracts",
  "getMilestoneTimeline",
  ["CT0103", 2],
  owner,
);
assert.equal(timeline.status, 201);
assert.ok(timeline.body.data.length >= 2);
// The integrity check belongs to the platform's integrity checker (audit:read), not to a party.
const auditor = (
  await request("/auth/login", "POST", {
    email: "auditor@codecash.vn",
    password: "Passw0rd!",
  })
).body.data.token;
assert.equal(
  (await workflow("integrity", "verifyIntegrity", [], admin)).status,
  403,
);
const integrity = await workflow("integrity", "verifyIntegrity", [], auditor);
assert.equal(integrity.status, 201);
assert.equal(integrity.body.data.chain.ok, true);
assert.equal(
  integrity.body.data.decisions.matched,
  integrity.body.data.decisions.checked,
);
assert.equal(
  (await workflow("integrity", "verifyIntegrity", [], supplier)).status,
  403,
);
const engine = await request("/engine/evaluate", "POST", {}, admin);
assert.equal(engine.status, 201);
assert.equal(engine.body.data.rows.length, 405);
assert.equal(Object.keys(engine.body.data.rows[0]).length, 22);
assert.equal(engine.body.data.summary.sampleMatched, 20);

// Hidden-test style run: upload the five data files (no template), evaluate, download the output.
const upload = new FormData();
for (const name of [
  "contracts",
  "parties",
  "milestones",
  "events",
  "payment_rules",
])
  upload.append(
    "files",
    new Blob([
      await readFile(
        `BangD-Case4/DataPack-CASE4_SmartContractWorkflow/01_data/${name}.csv`,
      ),
    ]),
    `${name}.csv`,
  );
upload.append("name", "smoke dataset");
const uploaded = await fetch(base + "/engine/datasets", {
  method: "POST",
  headers: { Authorization: `Bearer ${owner}` },
  body: upload,
}).then(async (r) => ({ status: r.status, body: await r.json() }));
assert.equal(uploaded.status, 201);
assert.equal(uploaded.body.data.report.ok, true);
const datasetId = uploaded.body.data.id;
assert.equal(
  (await request("/engine/datasets", "GET", undefined, supplier)).status,
  403,
);
const run = await request(
  `/engine/datasets/${datasetId}/evaluate`,
  "POST",
  {},
  owner,
);
assert.equal(run.status, 201);
assert.equal(run.body.data.rows.length, 405);
assert.equal(run.body.data.summary.source.generatedTemplate, true);
const output = await fetch(
  `${base}/engine/datasets/${datasetId}/files/submission_output.csv`,
  { headers: { Authorization: `Bearer ${owner}` } },
);
assert.equal(output.status, 200);
const lines = (await output.text()).trim().split(/\r?\n/);
assert.equal(lines.length, 406);
assert.equal(lines[0].replace(/^\uFEFF/, "").split(",").length, 22);
assert.equal(
  (await request(`/engine/datasets/${datasetId}`, "DELETE", undefined, owner))
    .status,
  200,
);
console.log(
  "API smoke passed: full-size rule save/preview, JSON size/parse errors, auth, RBAC, scope, CRUD, dynamic template catalog, stale versions, pagination, append-only audit, workflow on the Data Pack (scope, paged lists, tasks, approval → engine, replay, integrity), engine/schema, dataset upload/run/download.",
);
