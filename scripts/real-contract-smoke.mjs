/** Real HTTP document flow. Mongo requires explicit opt-in for an isolated CI database. */
import assert from "node:assert/strict";
const base = process.env.API_BASE_URL ?? "http://127.0.0.1:3000/api/v1";
let token;
async function request(path, body, method = "POST") {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
    },
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
  });
  const value = await response.json();
  return {
    status: response.status,
    value: value.data,
    error: value.code ?? value.message,
  };
}
async function post(path, body) {
  const result = await request(path, body);
  assert.ok(result.status < 300, `${path}: ${result.status} ${result.error}`);
  return result.value;
}
const health = await request("/health", undefined, "GET");
assert.equal(health.value.storage, "file", "ISOLATED_FILE_STORAGE_REQUIRED");
token = (
  await post("/auth/login", { email: "legal@novaan.vn", password: "Passw0rd!" })
).token;
const call = (module, action, ...args) =>
  post(`/workflow/${module}/${action}`, { args });
const options = await call("drafts", "getUploadFormOptions");
const supplierId = "S015";
const people = [
  { party: "BUYER", userId: options.buyerSigners[0].userId },
  { party: "SUPPLIER", userId: options.supplierSigners[supplierId][0].userId },
  ...options.buyerSigners
    .slice(1, 3)
    .map((p) => ({ party: "BUYER", userId: p.userId })),
];
const counts = process.env.REAL_CONTRACT_COUNTS?.split(",").map(Number) ?? [
  1, 2, 3, 4,
];
const report = [];
for (const count of counts) {
  const fresh = await call("drafts", "getContractDraft", undefined, true);
  const draft = {
    ...fresh,
    title: `HTTP test ${count} signers`,
    supplierId,
    type: options.types[0],
    approvalPolicy: options.policies[0],
    valueMillion: "1250.50",
    startDate: "2026-12-01",
    endDate: "2027-12-01",
    graceDays: 5,
    penaltyRatePct: "0.25",
    maxPenaltyPct: "8.00",
    signers: people.slice(0, count),
  };
  const sample = await post("/contract-samples", { draft, language: "vi" });
  const bytes = Buffer.from(sample.base64, "base64");
  const saved = await call("drafts", "saveContractDraft", {
    ...draft,
    file: {
      name: sample.fileName,
      kind: "DOCX",
      sizeBytes: bytes.length,
      pages: 999,
    },
  });
  const body = new FormData();
  body.append(
    process.env.SMOKE_STORAGE_DRIVER ?? "file",
    new Blob([bytes], { type: sample.mimeType }),
    sample.fileName,
  );
  const uploaded = await post(`/documents/${saved.code}`, body);
  const config = await call("signing", "getSigningConfig", saved.code);
  assert.ok(config.pageCount > 1 && config.pageCount < 999);
  assert.equal(config.documentSha256, uploaded.sha256);
  const slots = await call("signing", "getDefaultSignatureSlots", saved.code);
  assert.ok(Object.values(slots).every(Boolean));
  const image = await fetch(
    `${base}/contract-files/${saved.code}/${uploaded.id}/pages/${slots[1].page}/image`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  assert.equal(image.status, 200);
  assert.match(image.headers.get("content-type"), /^image\/png/);
  assert.equal(
    Buffer.from(await image.arrayBuffer())
      .subarray(1, 4)
      .toString(),
    "PNG",
  );
  const stale = await request("/workflow/signing/saveSignatureSlots", {
    args: [
      saved.code,
      slots,
      { documentSha256: "stale", version: config.layoutVersion },
    ],
  });
  assert.equal(stale.status, 400);
  assert.equal(stale.error, "DOCUMENT_CHANGED");
  await call("signing", "saveSignatureSlots", saved.code, slots, {
    documentSha256: config.documentSha256,
    version: config.layoutVersion,
  });
  const proposal = await post(`/trust/contracts/${saved.code}/extraction`);
  const expected = {
    valueMillion: "1250.50",
    graceDays: "5",
    penaltyRatePct: "0.25",
    maxPenaltyPct: "8.00",
    startDate: "2026-12-01",
    endDate: "2027-12-01",
  };
  for (const field of proposal.fields) {
    assert.notEqual(field.value, null, JSON.stringify(proposal));
    if (field.path.endsWith("Date"))
      assert.equal(field.value, expected[field.path]);
    else assert.equal(Number(field.value), Number(expected[field.path]));
    if (proposal.extractor.kind === "GEMINI")
      assert.equal(field.evidence.verified, true);
  }
  await post(
    `/trust/contracts/${saved.code}/extraction/${proposal.id}/confirm`,
    {
      values: Object.fromEntries(proposal.fields.map((f) => [f.path, f.value])),
    },
  );
  await call("drafts", "confirmDigitization", saved.code, {
    dueDate: draft.endDate,
  });
  const locked = await call("drafts", "getContractDraft", saved.code);
  assert.notEqual(locked.state, "DRAFT");
  report.push({
    code: saved.code,
    signers: count,
    pages: config.pageCount,
    provider: proposal.extractor.kind,
    fields: proposal.fields.length,
  });
}
console.log("Real contract HTTP smoke passed:", JSON.stringify(report));
