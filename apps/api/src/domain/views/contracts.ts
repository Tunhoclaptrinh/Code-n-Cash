import { canonical, sha256 } from "../../common/audit-chain";
import type { Ctx } from "../context";
import { enginePolicy, policySha256 } from "../policy";
import {
  type ContractRecord,
  type PaymentRecord,
  type RuleRecord,
  TABLE,
} from "../records";
import { signingDigest } from "../signing";
import { sumMillion } from "../templates";
import type {
  ContractLifecycle,
  ContractList,
  ContractOverview,
  LifecycleStage,
  LifecycleStageState,
  MilestoneRow,
  Participant,
  SignStepView,
  StatusChange,
  SmartContractView,
  TimelineEntry,
} from "../types";
import { INTERNAL_ROLES } from "../vocabulary";
import { ruleRows } from "./milestones";
import { historyOf } from "./shared";

export function contractList(ctx: Ctx): ContractList {
  return {
    organizationName: INTERNAL_ROLES.includes(ctx.actor.role)
      ? ctx.actor.roleChipOrganization
      : ctx.partyName(ctx.actor.organizationId),
    contracts: ctx
      .visibleContracts()
      .map((c) => ctx.contractRow(c))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}

function participants(ctx: Ctx, contractId: string): Participant[] {
  const contract = ctx.contract(contractId);
  const person = (partyId: string, role?: string) =>
    ctx.personOf(partyId, role);
  const list: Participant[] = [];
  for (const [side, partyId] of [
    ["BUYER", contract.buyer_id],
    ["SUPPLIER", contract.supplier_id],
  ] as const) {
    list.push({
      side,
      kind: "ORGANIZATION",
      partyId,
      name: ctx.partyName(partyId),
      personName: null,
      role: null,
      approvalRole: null,
      email: null,
      origin: "DATA_PACK",
    });
  }
  for (const role of [
    "CONTRACT_OWNER",
    "FINANCE_APPROVER",
    "SECONDARY_APPROVER",
  ] as const) {
    const party = ctx.approverParty(contract.buyer_id, role);
    if (!party) continue;
    const user = person(party.party_id);
    list.push({
      side: "BUYER",
      kind: "APPROVER",
      partyId: party.party_id,
      name: party.party_name,
      identityOrigin: user ? "SEED" : undefined,
      personName: user ? String(user.displayName) : null,
      role: (user?.role as Participant["role"]) ?? null,
      approvalRole: role,
      email: user ? String(user.email) : null,
      origin: "DATA_PACK",
    });
  }
  const officer = person(contract.buyer_id, "LEGAL_REVIEWER");
  const representative = person(contract.supplier_id, "SUPPLIER");
  for (const [side, kind, user] of [
    ["BUYER", "OFFICER", officer],
    ["SUPPLIER", "REPRESENTATIVE", representative],
  ] as const)
    if (user)
      list.push({
        side,
        kind,
        partyId: String(user.partyId),
        name: ctx.partyName(String(user.organizationId)),
        personName: String(user.displayName),
        role: user.role as Participant["role"],
        approvalRole: null,
        email: String(user.email),
        origin: "SEED",
      });
  return list;
}

/** A milestone is settled once it is paid, or closed by a rejection; nothing more will happen to it. */
const settled = (row: MilestoneRow) =>
  row.paid || row.status === "COMPLETED" || row.status === "REJECTED";

function lifecycle(
  ctx: Ctx,
  contract: ContractRecord,
  rows: MilestoneRow[],
  steps: SignStepView[],
  history: StatusChange[],
): ContractLifecycle {
  const paidAt = new Map(
    (ctx.t[TABLE.payments] as PaymentRecord[])
      .filter((p) => p.contractId === contract.contract_id)
      .map((p) => [p.milestoneId, p.transferredAt]),
  );
  // An imported decision is dated by its last event, not by the import.
  const lastEvent = new Map<string, string>();
  for (const event of ctx.events)
    if (
      event.contract_id === contract.contract_id &&
      event.event_timestamp > (lastEvent.get(event.milestone_id) ?? "")
    )
      lastEvent.set(event.milestone_id, event.event_timestamp);
  const lastChange = new Map<string, StatusChange>();
  for (const change of [...history].sort((a, b) => a.at.localeCompare(b.at)))
    lastChange.set(change.milestoneId, change);
  const drafting = contract.lifecycle === "DRAFT";
  const signing = contract.lifecycle === "SIGNING";
  const signedAt = steps.length
    ? steps.every((s) => s.signedAt)
      ? steps
          .map((s) => s.signedAt!)
          .sort()
          .at(-1)!
      : null
    : contract.signing_date || null;
  // The first unsettled milestone is where the contract stands once it is signed.
  const current = drafting || signing ? -1 : rows.findIndex((r) => !settled(r));
  const milestoneStages: LifecycleStage[] = rows.map((row, index) => {
    const change = lastChange.get(row.id);
    const state: LifecycleStageState = settled(row)
      ? "DONE"
      : index === current
        ? "CURRENT"
        : "PENDING";
    return {
      kind: "MILESTONE",
      state,
      at:
        state === "PENDING"
          ? null
          : (paidAt.get(row.id) ??
            (change && change.trigger.kind !== "IMPORT"
              ? change.at
              : (lastEvent.get(row.id) ?? null))),
      milestoneId: row.id,
      sequence: row.sequence,
      type: row.type,
      status: row.status,
      decision: row.decision,
      reasonCode: row.reasonCode,
      payableMillion: row.payableMillion,
      paid: row.paid,
      trigger: change?.trigger.kind ?? null,
    };
  });
  const closed =
    rows.length > 0 && rows.every(settled) && !drafting && !signing;
  return {
    stages: [
      {
        kind: "DRAFTED",
        state: drafting ? "CURRENT" : "DONE",
        // Imported contracts were drafted outside the application; only its own drafts have a date.
        at: contract.origin === "APP" ? contract.createdAt : null,
      },
      {
        kind: "SIGNED",
        state: drafting ? "PENDING" : signing ? "CURRENT" : "DONE",
        at: drafting || signing ? null : signedAt,
        signed: steps.filter((s) => s.status === "SIGNED").length,
        total: steps.length,
      },
      ...milestoneStages,
      {
        kind: "CLOSED",
        state: closed ? "DONE" : "PENDING",
        at: closed
          ? (milestoneStages
              .map((s) => s.at)
              .filter((at): at is string => !!at)
              .sort()
              .at(-1) ?? null)
          : null,
      },
    ],
  };
}

export function contractOverview(
  ctx: Ctx,
  contractId: string,
): ContractOverview {
  const contract = ctx.contract(contractId);
  const milestones = ctx
    .milestonesOf(contractId)
    .filter((m) => ctx.hasEvaluation(m.milestone_id));
  const rows = milestones.map((m) => ctx.milestoneRow(m));
  const events = ctx.events
    .filter((e) => e.contract_id === contractId)
    .map((e) => ctx.eventRow(e))
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  const history = historyOf(ctx, (h) => h.contractId === contractId);
  const timeline: TimelineEntry[] = [
    ...events.map((event) => ({ kind: "EVENT" as const, at: event.at, event })),
    ...history.map((change) => ({
      kind: "STATUS" as const,
      at: change.at,
      change,
    })),
  ];
  const steps = ctx.signingSteps(contractId);
  const signing = ctx.signing(contractId);
  const paying = rows.filter(
    (r) => r.decision === "RELEASE" || r.decision === "PENALTY",
  );
  return {
    contract: ctx.contractRow(contract),
    workflowTemplate:
      contract.workflow_template as ContractOverview["workflowTemplate"],
    ruleSetId: contract.rule_set_id,
    graceDays: Number(contract.grace_period_days),
    penaltyRatePct: contract.penalty_rate_pct_per_day,
    maxPenaltyPct: contract.max_penalty_pct,
    autoReleaseAllowed: contract.auto_release_allowed === "TRUE",
    milestones: rows,
    totals: {
      valueMillion: contract.contract_value_vnd_mn,
      eligibleMillion: sumMillion(paying.map((r) => r.payableMillion)),
      penaltyMillion: sumMillion(paying.map((r) => r.penaltyMillion)),
      paidMillion: sumMillion(
        rows.filter((r) => r.paid).map((r) => r.payableMillion),
      ),
      heldMillion: ctx.plannedOf(milestones, [
        "WAITING_EVIDENCE",
        "WAITING_APPROVAL",
        "ON_HOLD",
      ]),
      rejectedMillion: ctx.plannedOf(milestones, ["REJECTED"]),
    },
    participants: participants(ctx, contractId),
    events,
    timeline,
    lifecycle: lifecycle(ctx, contract, rows, steps, history),
    signing:
      signing && steps.length
        ? {
            signed: steps.filter((s) => s.status === "SIGNED").length,
            total: steps.length,
            steps,
            origin: signing.origin,
          }
        : null,
  };
}

export const draftsOf = (ctx: Ctx) =>
  ctx.drafts().filter((d) => d.organizationId === ctx.actor.organizationId);

/**
 * The contract as a smart contract (SmartContractView): the digests both parties signed, the policy and rules
 * the engine executes it with, and each payment milestone with its rules and their latest outcome.
 */
export function smartContract(ctx: Ctx, contractId: string): SmartContractView {
  const contract = ctx.contract(contractId);
  const draft = ctx.draft(contractId);
  const signing = ctx.signing(contractId);
  const steps = signing?.steps ?? [];
  let digest: ReturnType<typeof signingDigest> | null = null;
  let intact = true;
  if (signing)
    try {
      digest = signingDigest(ctx, contractId);
    } catch {
      // The stored document no longer matches what was signed (DOCUMENT_CHANGED).
      intact = false;
    }
  const clauses = ctx
    .milestonesOf(contractId)
    .filter((m) => ctx.hasEvaluation(m.milestone_id))
    .map((m) => ({
      milestone: ctx.milestoneRow(m),
      rules: ruleRows(ctx, m, ctx.evaluation(m.milestone_id)),
    }));
  const scopes = [
    ...new Set(clauses.map((c) => c.milestone.releaseRuleCode)),
  ].sort();
  const rules = (ctx.t[TABLE.rules] as RuleRecord[])
    .filter((r) => scopes.includes(r.release_rule_code) && r.active === "TRUE")
    .sort(
      (a, b) =>
        a.release_rule_code.localeCompare(b.release_rule_code) ||
        Number(a.priority) - Number(b.priority),
    );
  const signedAt = steps
    .map((s) => s.signedAt)
    .filter((at): at is string => !!at)
    .sort();
  return {
    contract: ctx.contractRow(contract),
    binding: {
      basis: digest?.basis ?? null,
      signedDigest: digest?.digest ?? null,
      termsDigest: digest?.termsDigest ?? null,
      intact,
      ruleSetId: contract.rule_set_id,
      ruleVersion: draft?.ruleVersionId
        ? {
            id: String(draft.ruleVersionId),
            hash: String(draft.ruleVersionHash),
          }
        : null,
      signed: steps.filter((s) => s.status === "SIGNED").length,
      total: steps.length,
      lastSignedAt: signedAt.at(-1) ?? null,
    },
    engine: {
      policyId: enginePolicy.policy_id,
      policyVersion: enginePolicy.version,
      policySha256,
      rulesSha256: sha256(canonical(rules)),
    },
    clauses,
  };
}
