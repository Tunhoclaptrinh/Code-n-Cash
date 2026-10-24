/** Download test documents only; this command does not save or activate contracts. */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const base = process.env.API_BASE_URL ?? "http://127.0.0.1:3000/api/v1";
const language = process.env.SAMPLE_LANGUAGE ?? "vi";
let token = process.env.SAMPLE_ACCESS_TOKEN;
async function post(path, body) {
  const response = await fetch(base + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      `${path}: ${result.code ?? result.message ?? response.status}`,
    );
  return result.data;
}
if (!token) {
  const response = await fetch(base + "/health");
  const health = await response.json();
  if (!response.ok || (health.data?.storage ?? health.storage) !== "file")
    throw new Error(
      "ISOLATED_FILE_STORAGE_REQUIRED: use a test API with STORAGE_DRIVER=file and a fresh DATA_DIR.",
    );
  token = (await post("/auth/demo-login", { email: "legal@novaan.vn" })).token;
}
const call = (action, ...args) => post(`/workflow/drafts/${action}`, { args });
const draft = await call("getContractDraft", undefined, true);
const options = await call("getUploadFormOptions");
const supplier = options.suppliers.find(
  (party) => options.supplierSigners[party.id]?.length,
);
const buyerPeople = [...options.buyerSigners].sort(
  (a, b) =>
    (a.role === "CONTRACT_OWNER" ? -1 : 0) -
    (b.role === "CONTRACT_OWNER" ? -1 : 0),
);
if (!supplier || buyerPeople.length < 3)
  throw new Error(
    "Four-signer fixtures require three buyer accounts and one supplier account",
  );
const people = [
  buyerPeople[0],
  options.supplierSigners[supplier.id][0],
  buyerPeople[1],
  buyerPeople[2],
];
const signers = people.map((person, index) => ({
  party: index === 1 ? "SUPPLIER" : "BUYER",
  userId: person.userId,
}));
const folder = resolve("artifacts/contract-samples");
await mkdir(folder, { recursive: true });
const manifest = [];
for (const count of [1, 2, 3, 4]) {
  const input = {
    ...draft,
    title:
      language === "vi"
        ? `Hợp đồng kiểm thử ${count} người ký`
        : `Test contract with ${count} signers`,
    supplierId: supplier.id,
    signers: signers.slice(0, count),
  };
  const sample = await post("/contract-samples", { draft: input, language });
  await writeFile(
    resolve(folder, sample.fileName),
    Buffer.from(sample.base64, "base64"),
  );
  const document = Buffer.from(sample.base64, "base64");
  const body = new FormData();
  body.append(
    "file",
    new Blob([document], { type: sample.mimeType }),
    sample.fileName,
  );
  const rendered = await fetch(base + "/documents/preview", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body,
  });
  if (!rendered.ok)
    throw new Error(`PDF_CONVERSION_FAILED: ${rendered.status}`);
  const pdf = Buffer.from(await rendered.arrayBuffer());
  if (pdf.subarray(0, 5).toString() !== "%PDF-")
    throw new Error("INVALID_PDF_PREVIEW");
  const pdfName = sample.fileName.replace(/\.docx$/i, ".pdf");
  await writeFile(resolve(folder, pdfName), pdf);
  manifest.push({
    file: sample.fileName,
    pdf: pdfName,
    signerCount: count,
    title: input.title,
    supplier: supplier.name,
    signers: people.slice(0, count).map((person, index) => ({
      step: index + 1,
      name: person.name,
      role: person.role,
      userId: person.userId,
    })),
    terms: {
      valueMillion: input.valueMillion,
      startDate: input.startDate,
      endDate: input.endDate,
      graceDays: input.graceDays,
      penaltyRatePct: input.penaltyRatePct,
      maxPenaltyPct: input.maxPenaltyPct,
    },
  });
}
await writeFile(
  resolve(folder, "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(
  `Generated 4 unsigned DOCX + 4 PDF fixtures and manifest in ${folder}`,
);
