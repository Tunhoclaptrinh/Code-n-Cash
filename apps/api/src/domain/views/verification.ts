import { canonical, sha256 } from "../../common/audit-chain";
import type { Ctx } from "../context";
import { writeCsv } from "../csv";
import { decisionHash } from "../engine";
import { policySha256 } from "../policy";
import {
  COLUMNS,
  type ExceptionRecord,
  type PartyRecord,
  type RuleRecord,
  TABLE,
} from "../records";
import type { Evaluation } from "../types";

export const VERIFICATION_FORMAT = "CODECASH_VERIFICATION_V1";

/**
 * Everything needed to check one contract's decisions without trusting CodeCash: the evaluator's input
 * restricted to the contract (the same six CSV files the engine reads), the stored decisions and the hash
 * the audit chain sealed for each. `python3 tools/verify_decision.py <bundle>` re-hashes every stored
 * decision against its seal and re-runs the evaluator on the input to compare decision, reason, rule and
 * amounts. Only this contract's rows are included, read in the actor's scope.
 */
export function verificationBundle(ctx: Ctx, contractId: string) {
  const contract = ctx.contract(contractId);
  const milestones = ctx.milestonesOf(contractId);
  const milestoneIds = new Set(milestones.map((m) => m.milestone_id));
  const events = ctx.events.filter((e) => milestoneIds.has(e.milestone_id));
  const eventIds = new Set(events.map((e) => e.event_id));
  // The two sides, their approvers and anyone who recorded an event on the contract.
  const sides = new Set([contract.buyer_id, contract.supplier_id]);
  const actors = new Set(events.map((e) => e.actor_party_id));
  const parties = (ctx.t[TABLE.parties] as PartyRecord[]).filter(
    (p) =>
      sides.has(p.party_id) ||
      sides.has(p.parent_party_id) ||
      actors.has(p.party_id),
  );
  const scopes = new Set(milestones.map((m) => m.release_rule_code));
  const rules = (ctx.t[TABLE.rules] as RuleRecord[]).filter((r) =>
    scopes.has(r.release_rule_code),
  );
  const voided = (ctx.t[TABLE.exceptions] as ExceptionRecord[])
    .filter((x) => x.status === "APPROVED" && eventIds.has(x.eventId))
    .map((x) => ({ event_id: x.eventId }));
  // The latest hash the chain sealed for each milestone's decision, in chain order.
  const sealed = new Map<string, string>();
  for (const entry of [...(ctx.t["audit"] ?? [])].sort(
    (a, b) => Number(a.seq) - Number(b.seq),
  ))
    for (const [id, hash] of Object.entries(
      (entry.decisionHashes ?? {}) as Record<string, string>,
    ))
      if (milestoneIds.has(id)) sealed.set(id, hash);
  const decisions = milestones
    .filter((m) => ctx.hasEvaluation(m.milestone_id))
    .map((m) => {
      const evaluation: Evaluation = ctx.evaluation(m.milestone_id);
      return {
        milestoneId: m.milestone_id,
        // Paid and rejected milestones are frozen: a re-run may decide otherwise without any fault.
        frozen: ctx.paid(m.milestone_id) || evaluation.status === "REJECTED",
        sealedHash: sealed.get(m.milestone_id) ?? null,
        storedHash: decisionHash(evaluation),
        evaluation,
      };
    });
  const activeRules = rules
    .filter((r) => r.active === "TRUE")
    .sort(
      (a, b) =>
        a.release_rule_code.localeCompare(b.release_rule_code) ||
        Number(a.priority) - Number(b.priority),
    );
  return {
    format: VERIFICATION_FORMAT,
    contractId,
    generatedAt: new Date().toISOString(),
    engine: {
      profile: "WORKFLOW",
      policySha256,
      rulesSha256: sha256(canonical(activeRules)),
    },
    data: {
      "contracts.csv": writeCsv([...COLUMNS.contracts], [contract]),
      "parties.csv": writeCsv([...COLUMNS.parties], parties),
      "milestones.csv": writeCsv([...COLUMNS.milestones], milestones),
      "events.csv": writeCsv([...COLUMNS.events], events),
      "payment_rules.csv": writeCsv([...COLUMNS.payment_rules], rules),
      "voided_events.csv": writeCsv(["event_id"], voided),
    },
    decisions,
  };
}
