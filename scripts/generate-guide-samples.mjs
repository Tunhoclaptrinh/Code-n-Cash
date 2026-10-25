/** Reproducible unsigned demo kit. Build the API first; no API key or running server is required. */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { generateSampleDocx } from "../apps/api/dist/sample-documents.js";
import { previewPdf } from "../apps/api/dist/document-preview.js";
import { inspectPdf } from "../apps/api/dist/pdf-layout.js";
const execute = promisify(execFile);
const folder = resolve("apps/web/public/guide/samples");
await mkdir(folder, { recursive: true });
const people = [
  { party: "BUYER", name: "Nguyễn Văn An", email: "owner@novaan.vn" },
  { party: "SUPPLIER", name: "Vũ Thanh Hà", email: "supplier@phuminh.vn" },
  { party: "BUYER", name: "Lê Quốc Dũng", email: "finance@novaan.vn" },
  { party: "BUYER", name: "Trần Thị Mai", email: "legal@novaan.vn" },
];
const manifest = [];
for (const count of [1, 2, 3, 4]) {
  const input = {
    language: "vi",
    code: `DEMO-${count}`,
    title: `Hợp đồng cung cấp thiết bị — ${count} người ký`,
    buyer: "Nova An Business JSC",
    supplier: "Phú Minh Technology JSC",
    valueMillion: "1250.50",
    startDate: "2026-12-01",
    endDate: "2027-12-01",
    graceDays: 5,
    penaltyRatePct: "0.25",
    maxPenaltyPct: "8.00",
    approvalPolicy: "FINANCE_PLUS_OWNER",
    signers: people.slice(0, count),
    stages: [
      {
        name: "Ký hợp đồng",
        paymentPercent: "20",
        dueDate: "2026-12-01",
        requiredEvents: "CONTRACT_SIGNED",
      },
      {
        name: "Giao hàng",
        paymentPercent: "40",
        dueDate: "2026-12-15",
        requiredEvents: "DELIVERY, INVOICE",
      },
      {
        name: "Nghiệm thu",
        paymentPercent: "30",
        dueDate: "2026-12-20",
        requiredEvents: "ACCEPTANCE",
      },
      {
        name: "Hoàn tất bảo hành",
        paymentPercent: "10",
        dueDate: "2027-12-01",
        requiredEvents: "WARRANTY_COMPLETED",
      },
    ],
  };
  const docx = await generateSampleDocx(input);
  const pdf = await previewPdf(docx, "DOCX");
  const pages = await inspectPdf(pdf);
  for (const [extension, bytes] of [
    ["docx", docx],
    ["pdf", pdf],
  ])
    await writeFile(
      join(folder, `CodeCash-${count}-signers.${extension}`),
      bytes,
    );
  manifest.push({
    signerCount: count,
    pdf: `CodeCash-${count}-signers.pdf`,
    docx: `CodeCash-${count}-signers.docx`,
    pages: pages.length,
    sha256: createHash("sha256").update(pdf).digest("hex"),
    supplierId: "S015",
    signers: people.slice(0, count),
    unsigned: true,
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
  join(folder, "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
await execute("python3", [
  "-c",
  "import zipfile,sys,pathlib\np=pathlib.Path(sys.argv[1])\nwith zipfile.ZipFile(p/'CodeCash-PDF-1-4-nguoi-ky.zip','w',zipfile.ZIP_DEFLATED) as z:\n for f in sorted(p.glob('*')):\n  if f.suffix in ('.pdf','.docx','.json'): z.write(f,f.name)",
  folder,
]);
console.log(
  "Generated public unsigned PDF/DOCX demo kit:",
  manifest.map((m) => ({ signers: m.signerCount, pages: m.pages })),
);
