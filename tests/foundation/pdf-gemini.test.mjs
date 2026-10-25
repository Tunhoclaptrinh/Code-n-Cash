import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import {
  EXTRACTION_PATHS,
  validateGeminiFields,
  geminiExtract,
} from "../../apps/api/dist/trust/gemini-extractor.js";
import { generateSampleDocx } from "../../apps/api/dist/sample-documents.js";
import { previewPdf } from "../../apps/api/dist/document-preview.js";
import { inspectPdf, renderPdfPage } from "../../apps/api/dist/pdf-layout.js";
import {
  assertSlots,
  documentSlots,
} from "../../apps/api/dist/domain/signing-layout.js";
const execute = promisify(execFile);
const empty = () =>
  Object.fromEntries(
    EXTRACTION_PATHS.map((key) => [
      key,
      { value: null, page: null, quote: null },
    ]),
  );
const result = (
  value = "1250.50",
  page = 1,
  quote = "Value: 1250.50 million VND",
) => ({ ...empty(), valueMillion: { value, page, quote } });
test("AI evidence is grounded to the claimed page; invalid or invented values stay empty", () => {
  const source = "Value: 1250.50 million VND\fSecond page";
  assert.equal(
    validateGeminiFields(result(), source, 2).fields[0].evidence.verified,
    true,
  );
  for (const raw of [
    result("1250.501"),
    result("1e3"),
    result("1250.50", 3),
    result("1250.50", 2),
    result("1250.50", 1, "invented quote"),
  ]) {
    assert.equal(validateGeminiFields(raw, source, 2).fields[0].value, null);
  }
  assert.equal(
    validateGeminiFields(result(), "", 1).fields[0].state,
    "NEEDS_REVIEW",
  );
  assert.equal(
    validateGeminiFields(result(), "", 1).fields[0].evidence.verified,
    false,
  );
  assert.throws(
    () => validateGeminiFields({ ...empty(), decision: "RELEASE" }, source, 2),
    /GEMINI_INVALID_RESPONSE/,
  );
  assert.throws(
    () => validateGeminiFields({}, source, 2),
    /GEMINI_INVALID_RESPONSE/,
  );
  assert.throws(
    () =>
      validateGeminiFields(
        {
          ...empty(),
          valueMillion: { ...result().valueMillion, secret: "bad" },
        },
        source,
        2,
      ),
    /GEMINI_INVALID_RESPONSE/,
  );
  const raw = {
    ...empty(),
    startDate: { value: "2027-12-01", page: 1, quote: "dates" },
    endDate: { value: "2026-12-01", page: 1, quote: "dates" },
  };
  assert.ok(
    validateGeminiFields(raw, "dates", 1).fields.every((f) => f.value === null),
  );
});
test("PDF coordinates reject text overlap, cross-signer overlap and page overflow", () => {
  const pages = [
    {
      pageNo: 1,
      width: 520,
      height: 735,
      blockedZones: [{ x: 20, y: 20, w: 480, h: 40 }],
    },
  ];
  const one = { page: 1, x: 30, y: 100, w: 190, h: 88, look: "NAME_AND_TIME" };
  assertSlots({ 1: one }, pages, 1, true);
  for (const [slots, count, error] of [
    [{ 1: null }, 1, "SLOT_REQUIRED"],
    [{ 1: { ...one, y: 700 } }, 1, "SLOT_OUT_OF_BOUNDS"],
    [{ 1: { ...one, y: 25 } }, 1, "SLOT_OVER_TEXT"],
    [{ 1: one, 2: { ...one, x: 40 } }, 2, "SLOT_OVERLAP"],
    [{ 1: { ...one, page: 2 } }, 1, "SLOT_OUT_OF_BOUNDS"],
    [{ 1: { ...one, w: NaN } }, 1, "SLOT_OUT_OF_BOUNDS"],
  ])
    assert.throws(
      () => assertSlots(slots, pages, count, true),
      new RegExp(error),
    );
});
test("Gemini transport sanitizes provider errors, rejects incomplete output and coalesces duplicate jobs", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  process.env.EXTRACTION_PROVIDER = "gemini";
  process.env.GEMINI_API_KEY = "test-secret";
  process.env.GEMINI_MODEL = "gemini-3.5-flash";
  const input = {
    pdf: Buffer.from("%PDF-test"),
    text: "Value: 1250.50 million VND",
    pageCount: 1,
    jobKey: "unit",
  };
  try {
    for (const [status, code] of [
      [429, "GEMINI_RATE_LIMIT"],
      [403, "GEMINI_AUTH_FAILED"],
      [404, "GEMINI_MODEL_UNAVAILABLE"],
      [500, "GEMINI_UNAVAILABLE"],
    ]) {
      globalThis.fetch = async () => new Response("test-secret", { status });
      await assert.rejects(geminiExtract(input), new RegExp(code));
    }
    globalThis.fetch = async () =>
      Response.json({ candidates: [{ finishReason: "MAX_TOKENS" }] });
    await assert.rejects(geminiExtract(input), /GEMINI_INVALID_RESPONSE/);
    let calls = 0;
    globalThis.fetch = async (url, options) => {
      calls++;
      assert.equal(new URL(url).hostname, "generativelanguage.googleapis.com");
      assert.equal(options.headers["x-goog-api-key"], "test-secret");
      await new Promise((resolve) => setTimeout(resolve, 10));
      return Response.json({
        candidates: [
          {
            finishReason: "STOP",
            content: { parts: [{ text: JSON.stringify(result()) }] },
          },
        ],
      });
    };
    const [a, b] = await Promise.all([
      geminiExtract(input),
      geminiExtract(input),
    ]);
    assert.deepEqual(a, b);
    assert.equal(calls, 1);
    await assert.rejects(
      geminiExtract({ ...input, pageCount: 41 }),
      /GEMINI_DOCUMENT_LIMIT/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
  }
});
const live = process.env.RUN_GEMINI_LIVE === "1";
if (live) {
  const require = createRequire(resolve("apps/api/package.json"));
  require("dotenv").config({ path: resolve(".env.gemini.local"), quiet: true });
  process.env.EXTRACTION_PROVIDER = "gemini";
}
const report = [];
for (const count of [1, 2, 3, 4])
  test(`real ${count}-signer PDF has matching page geometry, anchors and optional live AI extraction`, async () => {
    const folder = await mkdtemp(join(tmpdir(), "codecash-pdf-test-"));
    try {
      const input = {
        language: "vi",
        code: `DEMO-${count}`,
        title: `Hợp đồng cung cấp thiết bị ${count} người ký`,
        buyer: "Công ty Minh An",
        supplier: "Công ty Sao Việt",
        valueMillion: "1250.50",
        startDate: "2026-12-01",
        endDate: "2027-12-01",
        graceDays: 5,
        penaltyRatePct: "0.25",
        maxPenaltyPct: "8.00",
        approvalPolicy: "FINANCE_PLUS_OWNER",
        signers: Array.from({ length: count }, (_, i) => ({
          party: i === 1 ? "SUPPLIER" : "BUYER",
          name: [
            "Nguyễn Văn An",
            "Vũ Thanh Hà",
            "Lê Quốc Dũng",
            "Trần Thị Mai",
          ][i],
        })),
        stages: [
          {
            name: "Giao hàng",
            paymentPercent: "100",
            dueDate: "2026-12-31",
            requiredEvents: "DELIVERY, INVOICE, ACCEPTANCE",
          },
        ],
      };
      const docx = await generateSampleDocx(input);
      const pdf = await previewPdf(docx, "DOCX");
      const pages = await inspectPdf(pdf);
      assert.ok(
        pages.length >= 2 && pages.length <= 6,
        `unexpected pages ${pages.length}`,
      );
      assert.equal(pages.flatMap((p) => p.anchors ?? []).length, count);
      const slots = documentSlots(pages, count);
      assertSlots(slots, pages, count, true);
      for (let i = 1; i <= count; i++) {
        const page = pages.find((p) => p.pageNo === slots[i].page);
        const anchor = page.anchors.find((a) => a.stepNo === i);
        assert.ok(anchor, `signer ${i} must use printed area`);
        assert.equal(slots[i].x, anchor.x);
        assert.equal(slots[i].y, anchor.y);
      }
      const reordered = [...input.signers].reverse().map((person, index) => ({
        stepNo: index + 1,
        signerName: person.name,
        party: person.party,
      }));
      const mapped = documentSlots(pages, count, reordered);
      assertSlots(mapped, pages, count, true, reordered);
      for (const signer of reordered) {
        const area = pages
          .flatMap((p) =>
            (p.anchors ?? []).map((a) => ({ ...a, page: p.pageNo })),
          )
          .find((a) => a.signerName === signer.signerName);
        assert.ok(area, "printed name must be recovered from the actual PDF");
        assert.equal(mapped[signer.stepNo].page, area.page);
        assert.equal(mapped[signer.stepNo].y, area.y);
      }
      const stranger = [
        { ...reordered[0], signerName: "Người không có tên trong PDF" },
      ];
      assert.equal(documentSlots(pages, 1, stranger)[1], null);
      assert.throws(
        () => assertSlots({ 1: mapped[1] }, pages, 1, true, stranger),
        /SIGNER_DOCUMENT_MISMATCH/,
      );
      if (count > 1)
        assert.throws(
          () =>
            assertSlots(
              { ...mapped, 1: mapped[2] },
              pages,
              count,
              true,
              reordered,
            ),
          /SLOT_WRONG_SIGNER_AREA/,
        );
      if (count > 1)
        assert.throws(
          () =>
            assertSlots(
              { 1: mapped[1] },
              pages,
              1,
              true,
              reordered.slice(0, 1),
            ),
          /SIGNER_DOCUMENT_MISMATCH/,
        );
      const image = await renderPdfPage(pdf, pages.length);
      assert.equal(image.subarray(1, 4).toString(), "PNG");
      if (live) {
        const out = resolve("artifacts/contract-samples");
        await mkdir(out, { recursive: true });
        await writeFile(join(out, `CodeCash-${count}-signers.docx`), docx);
        await writeFile(join(out, `CodeCash-${count}-signers.pdf`), pdf);
        await writeFile(join(out, `signature-page-${count}.png`), image);
        const pdfPath = join(folder, "source.pdf");
        await writeFile(pdfPath, pdf);
        const { stdout: text } = await execute("pdftotext", [
          "-layout",
          pdfPath,
          "-",
        ]);
        const started = Date.now();
        const ai = await geminiExtract({
          pdf,
          text,
          pageCount: pages.length,
          jobKey: `live-${count}`,
        });
        const expected = {
          valueMillion: "1250.5",
          graceDays: "5",
          penaltyRatePct: "0.25",
          maxPenaltyPct: "8",
          startDate: "2026-12-01",
          endDate: "2027-12-01",
        };
        for (const field of ai.fields) {
          assert.notEqual(field.value, null, JSON.stringify(ai));
          if (field.path.endsWith("Date"))
            assert.equal(field.value, expected[field.path]);
          else assert.equal(Number(field.value), Number(expected[field.path]));
          assert.equal(field.evidence.verified, true, JSON.stringify(field));
        }
        report.push({
          signerCount: count,
          pages: pages.length,
          slots,
          fields: ai.fields,
          warnings: ai.warnings,
          usage: ai.usage,
          elapsedMs: Date.now() - started,
        });
        await writeFile(
          join(out, "gemini-verification.json"),
          JSON.stringify({ model: process.env.GEMINI_MODEL, report }, null, 2) +
            "\n",
        );
      }
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });
