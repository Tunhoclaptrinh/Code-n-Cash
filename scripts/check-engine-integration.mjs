/** Integration gate for candidate JSON; baseline compatibility is not hidden ground-truth accuracy. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { parseArgs } from "node:util";
import { parseEngineOutput } from "../apps/api/dist/domain/engine-contract.js";
import { readRecords } from "../apps/api/dist/domain/csv.js";

const { values } = parseArgs({
  options: {
    candidate: { type: "string" },
    out: { type: "string", default: "artifacts/integration" },
  },
});
const out = resolve(values.out);
if (values.candidate) {
  const reserved = [
    "engine-response.example.json",
    "report.json",
    "reference/submission_output.csv",
    "reference/audit.json",
    "reference/metrics.json",
  ];
  if (reserved.some((name) => join(out, name) === resolve(values.candidate)))
    throw new Error(
      "CANDIDATE_OUTPUT_COLLISION: choose a different --out directory",
    );
}
await mkdir(out, { recursive: true });
const data = resolve("BangD-Case4/DataPack-CASE4_SmartContractWorkflow");
const csv = async (name) =>
  readRecords(await readFile(join(data, name), "utf8")).rows;
const template = await csv(
  "04_output_templates/submission_output_template.csv",
);
const { stdout } = await promisify(execFile)(
  process.env.PYTHON ?? "python3",
  ["apps/engine/cli.py", "--json", "--output", join(out, "reference")],
  { timeout: 60000, maxBuffer: 32 * 1024 * 1024 },
);
const baseline = parseEngineOutput(JSON.parse(stdout), {
  profile: "BTC_SUBMISSION",
  rows: template,
});
await writeFile(
  join(out, "engine-response.example.json"),
  JSON.stringify(baseline, null, 2) + "\n",
);
const labels = await csv("03_labels_sample/decision_sample.csv");
const report = {
  contractVersion: 1,
  candidate: values.candidate ? resolve(values.candidate) : "CURRENT_ENGINE",
  baselineKind: "TEAM_ENGINE_NOT_GROUND_TRUTH",
  inputFingerprint: baseline.inputFingerprint,
  expectedMilestones: template.length,
  labelledMilestones: labels.length,
  hiddenLabelsAvailable: false,
  passed: false,
  schemaValid: false,
  publicMatched: 0,
  baselineDifferences: [],
  errors: [],
};
try {
  const candidate = values.candidate
    ? JSON.parse(await readFile(values.candidate, "utf8"))
    : baseline;
  const result = parseEngineOutput(candidate, {
    profile: "BTC_SUBMISSION",
    rows: template,
  });
  report.schemaValid = true;
  if (result.inputFingerprint !== baseline.inputFingerprint)
    report.errors.push("INPUT_FINGERPRINT_MISMATCH");
  if (result.summary.invariantViolations.length)
    report.errors.push("ENGINE_INVARIANT_VIOLATION");
  const byId = new Map(result.rows.map((r) => [r.milestone_id, r]));
  // Confidence and explanatory prose are intentionally excluded: BTC allows the team's formula.
  const fields = [
    "predicted_decision",
    "predicted_milestone_status",
    "reason_code",
    "rule_id_applied",
    "payable_amount_vnd_mn",
    "penalty_amount_vnd_mn",
    "conditions_met",
    "missing_conditions",
    "evidence_event_ids",
  ];
  const lists = new Set([
    "conditions_met",
    "missing_conditions",
    "evidence_event_ids",
  ]);
  const normalized = (key, value) =>
    lists.has(key) ? value.split(";").filter(Boolean).sort().join(";") : value;
  for (const row of baseline.rows) {
    const actual = byId.get(row.milestone_id);
    const changed = fields.filter(
      (key) => normalized(key, row[key]) !== normalized(key, actual[key]),
    );
    if (changed.length)
      report.baselineDifferences.push({
        milestoneId: row.milestone_id,
        fields: changed,
      });
  }
  for (const label of labels) {
    const actual = byId.get(label.milestone_id);
    if (
      actual.predicted_decision === label.expected_decision &&
      actual.reason_code === label.reason_code &&
      actual.payable_amount_vnd_mn === label.payable_amount_vnd_mn &&
      actual.penalty_amount_vnd_mn === label.penalty_amount_vnd_mn
    )
      report.publicMatched++;
  }
  if (report.publicMatched !== labels.length)
    report.errors.push("PUBLIC_SAMPLE_MISMATCH");
  if (report.baselineDifferences.length)
    report.errors.push("BASELINE_REVIEW_REQUIRED");
  report.passed = !report.errors.length;
} catch (error) {
  report.errors.push(
    error.code === "ENGINE_OUTPUT_INVALID"
      ? `${error.code}:${error.location}`
      : error.message,
  );
}
await writeFile(
  join(out, "report.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    passed: report.passed,
    schemaValid: report.schemaValid,
    milestones: template.length,
    publicMatched: report.publicMatched,
    publicTotal: labels.length,
    baselineDifferences: report.baselineDifferences.length,
    errors: report.errors,
    report: join(out, "report.json"),
  }),
);
if (!report.passed) process.exitCode = 1;
