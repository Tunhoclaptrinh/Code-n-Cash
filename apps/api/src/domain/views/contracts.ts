import type { Ctx } from "../context";
import { sumMillion } from "../templates";
import type {
  ContractList,
  ContractOverview,
  Participant,
  TimelineEntry,
} from "../types";
import { INTERNAL_ROLES } from "../vocabulary";
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
