import { recordHash, verifyChain } from "../../common/audit-chain";
import type { RecordEntity } from "../../common/types";
import type { Ctx } from "../context";
import { decisionHash, runEngine } from "../engine";
import { dataPackSeal, TABLE } from "../records";
import type { DecisionFacts, Evaluation, IntegrityReport } from "../types";

const factsOf = (e: Evaluation): DecisionFacts => ({
  decision: e.decision,
  reasonCode: e.reasonCode,
  ruleId: e.ruleId,
  payableMillion: e.payableMillion,
  penaltyMillion: e.penaltyMillion,
});

/**
 * Integrity check for controllers and auditors: the audit hash chain, each app event against the
 * hash sealed with it, and each stored decision against a fresh run of the engine on the same data.
 * Nothing is written.
 */
export async function integrityReport(
  ctx: Ctx,
  anchor?: { seq: number; hash: string },
): Promise<IntegrityReport> {
  const audit = ctx.t["audit"] ?? [];
  const sealed = new Map<string, string>();
  for (const entry of audit)
    for (const [id, hash] of Object.entries(
      (entry.eventHashes ?? {}) as Record<string, string>,
    ))
      sealed.set(id, hash);
  const byId = new Map(ctx.events.map((e) => [e.event_id, e]));
  const problems: IntegrityReport["evidence"]["problems"] = [];
  for (const [eventId, hash] of sealed) {
    const event = byId.get(eventId);
    if (!event || recordHash(event) !== hash)
      problems.push({
        eventId,
        contractId: event?.contract_id ?? null,
        problem: event ? "CHANGED" : "MISSING",
      });
  }
  // The latest sealed hash of each decision, in chain order.
  const sealedDecisions = new Map<string, string>();
  for (const entry of [...audit].sort((a, b) => Number(a.seq) - Number(b.seq)))
    for (const [id, hash] of Object.entries(
      (entry.decisionHashes ?? {}) as Record<string, string>,
    ))
      sealedDecisions.set(id, hash);
  const fresh = await runEngine(ctx.t);
  const stored = ctx.t[TABLE.evaluations] as Array<RecordEntity & Evaluation>;
  const mismatches: IntegrityReport["decisions"]["mismatches"] = [];
  for (const evaluation of stored) {
    const now = fresh.evaluations.get(evaluation.milestoneId);
    if (
      now &&
      JSON.stringify(factsOf(now)) === JSON.stringify(factsOf(evaluation))
    )
      continue;
    const m = ctx.milestones.find(
      (x) => x.milestone_id === evaluation.milestoneId,
    );
    mismatches.push({
      milestoneId: evaluation.milestoneId,
      contractId: evaluation.contractId,
      sequence: Number(m?.milestone_sequence ?? 0),
      frozen:
        ctx.paid(evaluation.milestoneId) || evaluation.status === "REJECTED",
      stored: factsOf(evaluation),
      fresh: now ? factsOf(now) : null,
    });
  }
  const sealProblems: IntegrityReport["decisions"]["sealProblems"] = [];
  for (const evaluation of stored) {
    const sealed = sealedDecisions.get(evaluation.milestoneId);
    if (!sealed || sealed === decisionHash(evaluation)) continue;
    const m = ctx.milestones.find(
      (x) => x.milestone_id === evaluation.milestoneId,
    );
    sealProblems.push({
      milestoneId: evaluation.milestoneId,
      contractId: evaluation.contractId,
      sequence: Number(m?.milestone_sequence ?? 0),
    });
  }
  const imported = audit
    .filter((entry) => entry.action === "IMPORT_DATA_PACK" && entry.seal)
    .at(-1);
  const current = dataPackSeal(ctx.t);
  const seal = (imported?.seal ?? {}) as ReturnType<typeof dataPackSeal>;
  return {
    checkedAt: new Date().toISOString(),
    chain: verifyChain(audit, anchor),
    dataPack: imported
      ? {
          sealedAt: imported.createdAt,
          tables: Object.entries(seal).map(([name, sealed]) => ({
            name,
            sealedRows: sealed.rows,
            rows: current[name]?.rows ?? 0,
            ok: current[name]?.hash === sealed.hash,
          })),
        }
      : null,
    evidence: {
      sealed: sealed.size,
      unsealed: ctx.events.filter(
        (e) => e.origin === "APP" && !sealed.has(e.event_id),
      ).length,
      problems,
    },
    decisions: {
      checked: stored.length,
      matched: stored.length - mismatches.length,
      sealed: stored.filter((e) => sealedDecisions.has(e.milestoneId)).length,
      sealProblems,
      runId: fresh.runId,
      fingerprint: fresh.fingerprint,
      mismatches,
    },
  };
}
