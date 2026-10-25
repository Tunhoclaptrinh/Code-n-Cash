import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  parseEngineOutput,
  EngineOutputError,
} from "../../apps/api/dist/domain/engine-contract.js";
import { EngineController } from "../../apps/api/dist/engine.js";
import { configuredTermProvider } from "../../apps/api/dist/trust/term-provider.js";

const { stdout } = await promisify(execFile)(
  process.env.PYTHON ?? "python3",
  ["apps/engine/cli.py", "--json"],
  { maxBuffer: 32 * 1024 * 1024 },
);
const reference = JSON.parse(stdout);
const expected = { profile: "BTC_SUBMISSION", rows: reference.rows };
test("the real 405-milestone engine response conforms to integration contract v1", () => {
  assert.equal(parseEngineOutput(reference, expected).rows.length, 405);
});

const badCases = {
  "partial output": (o) => o.rows.pop(),
  "duplicate milestone": (o) => (o.rows[1] = o.rows[0]),
  "changed template metadata": (o) => (o.rows[0].contract_type = "OTHER"),
  "float amount": (o) => (o.rows[0].payable_amount_vnd_mn = 0),
  "confidence outside range": (o) => (o.rows[0].confidence_score = "1.01"),
  "wrong profile": (o) => (o.summary.source.profile = "WORKFLOW"),
  "trace from another input": (o) =>
    (o.traces[0].inputFingerprint = "0".repeat(64)),
  "row and trace disagree": (o) =>
    (o.traces[0].result.reason_code = "UNKNOWN_REASON"),
  "unreported amount": (o) => (o.summary.payableMillion = "0.00"),
  "incorrect decision counts": (o) => (o.summary.decisions.RELEASE = 405),
  "orphan trace": (o) => o.traces.push({ ...o.traces[0], id: "orphan" }),
  "broken workflow facts": (o) =>
    (o.traces[0].result.valid_approval_count = "2"),
  "missing output column": (o) => delete o.rows[0].notes,
  "payment while held": (o) => {
    const row = o.rows.find((r) => r.predicted_decision === "HOLD");
    row.payable_amount_vnd_mn = "0.01";
  },
};
for (const [name, corrupt] of Object.entries(badCases))
  test(`integration gate rejects ${name}`, () => {
    const output = structuredClone(reference);
    corrupt(output);
    assert.throws(() => parseEngineOutput(output, expected), EngineOutputError);
  });

test("a bounded team confidence formula is accepted without replacing the business decision", () => {
  const output = structuredClone(reference);
  output.rows.forEach((r) => (r.confidence_score = "0.73"));
  assert.deepEqual(
    parseEngineOutput(output, expected).rows.map((r) => r.predicted_decision),
    reference.rows.map((r) => r.predicted_decision),
  );
});

test("the HTTP engine boundary rejects incomplete results and never falls back on provider failure", async () => {
  const saved = process.env.ENGINE_URL,
    fetch = globalThis.fetch;
  process.env.ENGINE_URL = "http://engine.test";
  const controller = new EngineController({}, {});
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ rows: [] }));
    await assert.rejects(
      controller.decisions(),
      (e) => e.code === "ENGINE_OUTPUT_INVALID",
    );
    globalThis.fetch = async () => new Response("unavailable", { status: 503 });
    await assert.rejects(controller.decisions(), /ENGINE_UNAVAILABLE/);
    globalThis.fetch = async () => new Response(JSON.stringify(reference));
    assert.equal((await controller.decisions()).rows.length, 405);
  } finally {
    if (saved === undefined) delete process.env.ENGINE_URL;
    else process.env.ENGINE_URL = saved;
    globalThis.fetch = fetch;
  }
});

test("the extraction provider seam returns six grounded local terms and rejects unsupported configuration", async () => {
  const saved = process.env.EXTRACTION_PROVIDER;
  try {
    process.env.EXTRACTION_PROVIDER = "local";
    const provider = configuredTermProvider();
    const result = await provider.extract({
      text: "Giá trị hợp đồng: 1250.50 triệu VND\nÂn hạn: 5 ngày\nPhạt trễ hạn: 0.25% mỗi ngày\nTrần phạt: 8.00%\nNgày bắt đầu: 2026-12-01\nNgày kết thúc: 2027-12-01",
      pageCount: 1,
      jobKey: "integration-test",
    });
    assert.equal(provider.identity.kind, "TEXT_RULES");
    assert.equal(result.fields.length, 6);
    assert.ok(
      result.fields.every(
        (field) =>
          field.value && field.evidence.page === 1 && field.evidence.quote,
      ),
    );
    assert.ok(!("decision" in result));
    process.env.EXTRACTION_PROVIDER = "unknown";
    assert.throws(configuredTermProvider, /EXTRACTION_CONFIG_INVALID/);
  } finally {
    if (saved === undefined) delete process.env.EXTRACTION_PROVIDER;
    else process.env.EXTRACTION_PROVIDER = saved;
  }
});
