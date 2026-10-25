import { UnprocessableEntityException } from "@nestjs/common";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeCsv } from "./csv";
import { entity } from "./factory";
import {
  COLUMNS,
  TABLE,
  type EngineRunRecord,
  type EvaluationRecord,
  type EventRecord,
  type ExceptionRecord,
  type HistoryRecord,
  type PaymentRecord,
  type Tables,
} from "./records";
import type {
  Evaluation,
  Preview,
  ReasonCode,
  TimelinePoint,
  Trigger,
} from "./types";
import { repoRoot } from "../common/paths";
import { ENGINE_OUTPUT_COLUMNS, parseEngineOutput } from "./engine-contract";

/** Stdout of `apps/engine/cli.py`; exit code 2 means the input was rejected (message on stderr). */
export function python(args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolveOutput, reject) => {
    const child = spawn(
      process.env.PYTHON ?? "python3",
      ["apps/engine/cli.py", ...args],
      { cwd: repoRoot(), env: process.env },
    );
    let out = "",
      err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("ENGINE_TIMEOUT"));
    }, timeoutMs);
    child.stdout.on("data", (x) => (out += x));
    child.stderr.on("data", (x) => (err += x));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolveOutput(out);
      else if (code === 2)
        reject(new UnprocessableEntityException(err.trim().slice(0, 2000)));
      else reject(new Error(err));
    });
  });
}

export interface EngineOutcome {
  runId: string;
  fingerprint: string;
  evaluatedAt: string;
  durationMs: number;
  violations: string[];
  evaluations: Map<string, Evaluation>;
}

/** Event ids voided by an approved two-person exception decision (BR-19). */
const voidedIds = (tables: Tables) =>
  (tables[TABLE.exceptions] as ExceptionRecord[])
    .filter((x) => x.status === "APPROVED")
    .map((x) => x.eventId);

/** Writes the live tables as a Data Pack folder for the evaluator, runs `fn` on it, removes it. */
async function withDataset<T>(
  tables: Tables,
  extraEvents: EventRecord[],
  fn: (dir: string) => Promise<T>,
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "codecash-live-"));
  try {
    const write = (name: string, columns: readonly string[], rows: unknown[]) =>
      writeFile(
        join(dir, name),
        writeCsv([...columns], rows as Record<string, unknown>[]),
      );
    await Promise.all([
      write("contracts.csv", COLUMNS.contracts, tables[TABLE.contracts]),
      write("parties.csv", COLUMNS.parties, tables[TABLE.parties]),
      write("milestones.csv", COLUMNS.milestones, tables[TABLE.milestones]),
      write("events.csv", COLUMNS.events, [
        ...tables[TABLE.events],
        ...extraEvents,
      ]),
      write("payment_rules.csv", COLUMNS.payment_rules, tables[TABLE.rules]),
      write(
        "voided_events.csv",
        ["event_id"],
        voidedIds(tables).map((event_id) => ({ event_id })),
      ),
    ]);
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** One point of `cli.py --timeline`: the evaluator's answer right after `eventIds` happened. */
export interface TimelineResult {
  at: string;
  eventIds: string[];
  decision: Evaluation["decision"];
  reason_code: ReasonCode;
  rule_id: string;
  status: TimelinePoint["status"];
  payable: string;
  penalty: string;
  days_late: number;
  missing: Evaluation["missing"];
  valid_approval_count: number;
  quorum: number;
  open_dispute_ids: string[];
}

/** Replays one milestone event by event on the live data (as-of evaluation, BR-16). */
export const runTimeline = (
  tables: Tables,
  milestoneId: string,
): Promise<TimelineResult[]> =>
  withDataset(tables, [], async (dir) =>
    JSON.parse(
      await python(
        ["--data", dir, "--workflow", "--timeline", milestoneId],
        60000,
      ),
    ),
  );

/**
 * Evaluates the live database with the tested Python evaluator. The browser and the API never
 * decide a milestone themselves; they record events and read what the evaluator concludes.
 */
export async function runEngine(
  tables: Tables,
  extraEvents: EventRecord[] = [],
): Promise<EngineOutcome> {
  const started = Date.now();
  return withDataset(tables, extraEvents, async (dir) => {
    const contractTypes = new Map(
      tables[TABLE.contracts].map((c) => [c.contract_id, c.contract_type]),
    );
    const expected = tables[TABLE.milestones].map((m) =>
      Object.fromEntries(
        ENGINE_OUTPUT_COLUMNS.slice(0, 6).map((key) => [
          key,
          String(
            key === "contract_type" ? contractTypes.get(m.contract_id) : m[key],
          ),
        ]),
      ),
    );
    const raw = JSON.parse(
      await python(["--data", dir, "--workflow", "--json"], 60000),
    );
    const output = parseEngineOutput(raw, {
      profile: "WORKFLOW",
      rows: expected,
      diagnostic: true,
    });
    const evaluatedAt = new Date().toISOString();
    const confidence = new Map<string, string>(
      output.rows.map((row: Record<string, string>) => [
        row.milestone_id,
        row.confidence_score,
      ]),
    );
    const evaluations = new Map<string, Evaluation>();
    for (const trace of output.traces) {
      const r = trace.result;
      evaluations.set(r.milestone_id, {
        milestoneId: r.milestone_id,
        contractId: r.contract_id,
        runId: output.runId,
        evaluatedAt,
        decision: r.decision,
        reasonCode: r.reason_code,
        ruleId: r.rule_id,
        status: r.status,
        payableMillion: String(r.payable),
        penaltyMillion: String(r.penalty),
        rawPenaltyMillion: String(r.raw_penalty),
        evidence: r.evidence,
        missing: r.missing,
        unauthorized: r.unauthorized,
        duplicates: r.duplicates,
        unrelated: r.unrelated,
        voided: r.voided,
        openDisputeIds: r.open_dispute_ids,
        validRejectionCount: r.valid_rejection_count,
        approvalRequired: r.approval_required,
        validApprovalCount: r.valid_approval_count,
        quorum: r.quorum,
        daysLate: r.days_late,
        completedAt: r.completion_ts,
        conditionsMet: r.conditions_met,
        missingConditions: r.missing_conditions,
        issues: r.issues,
        notes: r.notes,
        confidence: confidence.get(r.milestone_id) ?? "",
        specVersion: trace.specVersion,
      });
    }
    return {
      runId: output.runId,
      fingerprint: output.inputFingerprint,
      evaluatedAt,
      durationMs: Date.now() - started,
      violations: output.summary.invariantViolations ?? [],
      evaluations,
    };
  });
}

/** Invalid engine results must not become live decisions or hypothetical payment previews. */
export function assertEngineOutcome(outcome: EngineOutcome): void {
  if (outcome.violations.length)
    throw new UnprocessableEntityException("ENGINE_INVARIANT_VIOLATION");
}

/** Facts that make two evaluations different; run id and time alone are not a change. */
const factsOf = (evaluation: Evaluation) =>
  JSON.stringify({ ...evaluation, runId: "", evaluatedAt: "" });

const snapshotOf = (evaluation: Evaluation) => ({
  status: evaluation.status,
  decision: evaluation.decision,
  reasonCode: evaluation.reasonCode,
});

/**
 * Stores a run: changed evaluations are replaced and every status change is appended to the
 * history with its trigger (spec 9.4). REJECTED and paid (COMPLETED) milestones are final.
 */
export function applyRun(
  tables: Tables,
  outcome: EngineOutcome,
  trigger: Trigger,
): { changed: string[] } {
  assertEngineOutcome(outcome);
  const evaluations = tables[TABLE.evaluations] as EvaluationRecord[];
  const history = tables[TABLE.history] as HistoryRecord[];
  const paid = new Set(
    (tables[TABLE.payments] as PaymentRecord[]).map((p) => p.milestoneId),
  );
  const byId = new Map(evaluations.map((e) => [e.milestoneId, e]));
  const changed: string[] = [];
  const now = new Date().toISOString();
  for (const [milestoneId, next] of outcome.evaluations) {
    const current = byId.get(milestoneId);
    if (current && (paid.has(milestoneId) || current.status === "REJECTED"))
      continue;
    if (current && factsOf(current) === factsOf(next)) continue;
    const previous = current ? snapshotOf(current) : null;
    const statusChanged =
      !previous ||
      JSON.stringify(previous) !== JSON.stringify(snapshotOf(next));
    if (current) {
      Object.assign(current, next, {
        version: current.version + 1,
        updatedAt: now,
      });
    } else {
      const record = entity(milestoneId, next) as EvaluationRecord;
      evaluations.push(record);
      byId.set(milestoneId, record);
    }
    if (statusChanged) {
      changed.push(milestoneId);
      const id = `${outcome.runId}:${milestoneId}`;
      if (!history.some((h) => h.id === id))
        history.push(
          entity(id, {
            milestoneId,
            contractId: next.contractId,
            runId: outcome.runId,
            at: now,
            from: previous,
            to: snapshotOf(next),
            trigger,
          }) as HistoryRecord,
        );
    }
  }
  (tables[TABLE.runs] as EngineRunRecord[]).push(
    entity(`${outcome.runId}:${Date.now().toString(36)}`, {
      runId: outcome.runId,
      inputFingerprint: outcome.fingerprint,
      trigger: trigger.kind,
      milestones: outcome.evaluations.size,
      changed: changed.length,
      durationMs: outcome.durationMs,
      invariantViolations: outcome.violations,
    }) as EngineRunRecord,
  );
  return { changed };
}

export const previewOf = (
  evaluation: Evaluation | undefined,
): Preview | null =>
  evaluation
    ? {
        decision: evaluation.decision,
        reasonCode: evaluation.reasonCode,
        status: evaluation.status,
        payableMillion: evaluation.payableMillion,
        penaltyMillion: evaluation.penaltyMillion,
        daysLate: evaluation.daysLate,
      }
    : null;
