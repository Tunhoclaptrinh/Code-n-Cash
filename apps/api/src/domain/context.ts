import { ForbiddenException, NotFoundException } from "@nestjs/common";
import type { Actor, RecordEntity } from "../common/types";
import { businessNow } from "./factory";
import {
  TABLE,
  type ContractRecord,
  type DraftRecord,
  type EvaluationRecord,
  type EventRecord,
  type ExceptionRecord,
  type MilestoneRecord,
  type PartyRecord,
  type PaymentRecord,
  type SigningRecord,
  type Tables,
} from "./records";
import { sumMillion, toCents, addDays } from "./templates";
import type {
  ApprovalRole,
  BusinessEventType,
  ContractRow,
  ContractStatus,
  EventRow,
  MilestoneCounts,
  MilestoneRow,
  MilestoneStatus,
  MilestoneType,
  NextStep,
  Requirement,
  Side,
  SignStepView,
} from "./types";
import { AUTHORITY, isBusinessEvent, SEES_ALL_CONTRACTS } from "./vocabulary";

/** Collections every workflow view or action reads. */
export const READ_TABLES = [
  TABLE.parties,
  TABLE.contracts,
  TABLE.milestones,
  TABLE.events,
  TABLE.rules,
  TABLE.evaluations,
  TABLE.history,
  TABLE.signing,
  TABLE.drafts,
  TABLE.attachments,
  TABLE.notes,
  TABLE.exceptions,
  TABLE.payments,
  TABLE.runs,
  TABLE.requests,
  TABLE.profiles,
  "users",
  "organizations",
  "milestone-templates",
  "documents",
  "extraction-proposals",
  "rule-versions",
  "contract-templates",
];

const BUYER_ROLES = new Set([
  "CONTRACT_OWNER",
  "FINANCE_APPROVER",
  "SECONDARY_APPROVER",
  "LEGAL_REVIEWER",
]);

export const today = () => businessNow().slice(0, 10);
const daysBetween = (from: string, to: string) =>
  Math.round(
    (Date.parse(to.slice(0, 10)) - Date.parse(from.slice(0, 10))) / 86_400_000,
  );

/**
 * Read model over the workflow tables for one signed-in actor: lookups, visibility (spec 17,
 * R13 data minimisation) and the rows every screen shares.
 */
export class Ctx {
  readonly contracts: ContractRecord[];
  readonly milestones: MilestoneRecord[];
  readonly events: EventRecord[];
  private readonly partiesById: Map<string, PartyRecord>;
  private readonly evaluationsById: Map<string, EvaluationRecord>;
  private readonly milestonesByContract = new Map<string, MilestoneRecord[]>();
  private readonly eventsByMilestone = new Map<string, EventRecord[]>();
  private readonly paidIds: Set<string>;

  constructor(
    readonly t: Tables,
    readonly actor: Actor,
  ) {
    this.contracts = t[TABLE.contracts] as ContractRecord[];
    this.milestones = t[TABLE.milestones] as MilestoneRecord[];
    this.events = t[TABLE.events] as EventRecord[];
    this.partiesById = new Map(
      (t[TABLE.parties] as PartyRecord[]).map((p) => [p.party_id, p]),
    );
    this.evaluationsById = new Map(
      (t[TABLE.evaluations] as EvaluationRecord[]).map((e) => [
        e.milestoneId,
        e,
      ]),
    );
    for (const m of this.milestones) {
      const list = this.milestonesByContract.get(m.contract_id) ?? [];
      list.push(m);
      this.milestonesByContract.set(m.contract_id, list);
    }
    for (const list of this.milestonesByContract.values())
      list.sort(
        (a, b) => Number(a.milestone_sequence) - Number(b.milestone_sequence),
      );
    for (const e of this.events) {
      const list = this.eventsByMilestone.get(e.milestone_id) ?? [];
      list.push(e);
      this.eventsByMilestone.set(e.milestone_id, list);
    }
    for (const list of this.eventsByMilestone.values())
      list.sort((a, b) =>
        a.event_timestamp === b.event_timestamp
          ? a.event_id.localeCompare(b.event_id)
          : a.event_timestamp.localeCompare(b.event_timestamp),
      );
    this.paidIds = new Set(
      (t[TABLE.payments] as PaymentRecord[]).map((p) => p.milestoneId),
    );
  }

  /* ------------------------------ lookups ------------------------------ */

  party(id: string) {
    return this.partiesById.get(id);
  }
  partyName(id: string) {
    return this.party(id)?.party_name ?? id;
  }
  users() {
    return this.t.users as RecordEntity[];
  }
  user(id: string) {
    return this.users().find((u) => u.id === id);
  }
  /** The account acting as a party (approver, buyer officer or supplier representative). */
  personOf(partyId: string, role?: string) {
    return this.users().find(
      (u) => u.partyId === partyId && (!role || u.role === role),
    );
  }
  approverParty(buyerId: string, role: ApprovalRole) {
    return [...this.partiesById.values()].find(
      (p) =>
        p.party_type === "APPROVER" &&
        p.parent_party_id === buyerId &&
        p.approval_role === role,
    );
  }
  contract(id: string): ContractRecord {
    const contract = this.contracts.find((c) => c.contract_id === id);
    if (!contract) throw new NotFoundException("CONTRACT_NOT_FOUND");
    if (!this.canSee(contract))
      throw new ForbiddenException("CONTRACT_ACCESS_DENIED");
    return contract;
  }
  milestonesOf(contractId: string) {
    return this.milestonesByContract.get(contractId) ?? [];
  }
  milestoneAt(contractId: string, sequence: number): MilestoneRecord {
    this.contract(contractId);
    const milestone = this.milestonesOf(contractId).find(
      (m) => Number(m.milestone_sequence) === sequence,
    );
    if (!milestone) throw new NotFoundException("MILESTONE_NOT_FOUND");
    return milestone;
  }
  milestone(id: string): MilestoneRecord {
    const milestone = this.milestones.find((m) => m.milestone_id === id);
    if (!milestone) throw new NotFoundException("MILESTONE_NOT_FOUND");
    this.contract(milestone.contract_id);
    return milestone;
  }
  eventsOf(milestoneId: string) {
    return this.eventsByMilestone.get(milestoneId) ?? [];
  }
  evaluation(milestoneId: string): EvaluationRecord {
    const evaluation = this.evaluationsById.get(milestoneId);
    if (!evaluation) throw new NotFoundException("EVALUATION_NOT_FOUND");
    return evaluation;
  }
  hasEvaluation(milestoneId: string) {
    return this.evaluationsById.has(milestoneId);
  }
  paid(milestoneId: string) {
    return this.paidIds.has(milestoneId);
  }
  signing(contractId: string) {
    return (this.t[TABLE.signing] as SigningRecord[]).find(
      (s) => s.contractCode === contractId,
    );
  }
  /** Drafts the workflow owns; rows added through the generic CRUD carry no origin and stay outside it. */
  drafts() {
    return (this.t[TABLE.drafts] as DraftRecord[]).filter((d) => d.origin);
  }
  draft(contractId: string) {
    return this.drafts().find((d) => d.code === contractId);
  }
  exceptionsOf(milestoneId: string) {
    return (this.t[TABLE.exceptions] as ExceptionRecord[]).filter(
      (x) => x.milestoneId === milestoneId,
    );
  }

  /* ---------------------------- the actor ---------------------------- */

  /** Controllers and auditors see every contract; everyone else only those of their organisation. */
  canSee(contract: ContractRecord) {
    if (SEES_ALL_CONTRACTS.includes(this.actor.role)) return true;
    if (this.actor.role === "SUPPLIER")
      return (
        contract.supplier_id === this.actor.organizationId &&
        contract.lifecycle !== "DRAFT"
      );
    return contract.buyer_id === this.actor.organizationId;
  }
  visibleContracts() {
    return this.contracts.filter((c) => this.canSee(c));
  }
  side(): Side | null {
    if (this.actor.role === "SUPPLIER") return "SUPPLIER";
    return BUYER_ROLES.has(this.actor.role) ? "BUYER" : null;
  }
  /** Spec 17: suppliers record supplier events; the buyer's officer records buyer events. */
  mayRecord(type: BusinessEventType) {
    const side = AUTHORITY[type];
    return side === "SUPPLIER"
      ? this.actor.role === "SUPPLIER"
      : this.actor.role === "LEGAL_REVIEWER";
  }
  approvalRole(): ApprovalRole | null {
    return [
      "CONTRACT_OWNER",
      "FINANCE_APPROVER",
      "SECONDARY_APPROVER",
    ].includes(this.actor.role)
      ? (this.actor.role as ApprovalRole)
      : null;
  }

  /* ------------------------------ rows ------------------------------ */

  eventRow(e: EventRecord): EventRow {
    const party = this.party(e.actor_party_id);
    return {
      id: e.event_id,
      contractId: e.contract_id,
      milestoneId: e.milestone_id,
      contractSequence: Number(e.contract_event_sequence),
      at: e.event_timestamp,
      type: e.event_type as EventRow["type"],
      status: e.event_status as EventRow["status"],
      actor: {
        partyId: e.actor_party_id,
        name: party?.party_name ?? e.actor_party_id,
        type: (party?.party_type as EventRow["actor"]["type"]) ?? null,
        approvalRole:
          party?.party_type === "APPROVER"
            ? (party.approval_role as ApprovalRole)
            : null,
      },
      source: e.event_source,
      documentId: e.document_id,
      amountMillion: e.amount_vnd_mn || null,
      referenceEventId: e.reference_event_id || null,
      note: e.event_note,
      origin: e.origin,
      recordedBy: e.recordedBy ?? null,
      fileName: e.fileName ?? null,
    };
  }

  requirements(m: MilestoneRecord): Requirement[] {
    const evaluation = this.hasEvaluation(m.milestone_id)
      ? this.evaluation(m.milestone_id)
      : null;
    const events = this.eventsOf(m.milestone_id);
    return (
      m.required_event_types.split(";").filter(Boolean) as BusinessEventType[]
    ).map((type) => {
      const valid = events.find(
        (e) =>
          e.event_type === type && evaluation?.evidence.includes(e.event_id),
      );
      const unauthorized = events.find(
        (e) =>
          e.event_type === type &&
          evaluation?.unauthorized.includes(e.event_id),
      );
      return {
        eventType: type,
        side: AUTHORITY[type],
        state: valid ? "VALID" : unauthorized ? "UNAUTHORIZED" : "MISSING",
        eventId: (valid ?? unauthorized)?.event_id ?? null,
        at: (valid ?? unauthorized)?.event_timestamp ?? null,
      };
    });
  }

  approvalRoles(m: MilestoneRecord) {
    return m.required_approval_roles
      .split(";")
      .filter(Boolean) as ApprovalRole[];
  }

  /** Roles whose approval is still missing (BR-10: one valid approval per role). */
  missingRoles(m: MilestoneRecord): ApprovalRole[] {
    const evaluation = this.evaluation(m.milestone_id);
    const approved = new Set(
      this.eventsOf(m.milestone_id)
        .filter(
          (e) =>
            e.event_type === "APPROVAL" &&
            evaluation.evidence.includes(e.event_id),
        )
        .map((e) => this.party(e.actor_party_id)?.approval_role),
    );
    return this.approvalRoles(m).filter((role) => !approved.has(role));
  }

  status(m: MilestoneRecord): MilestoneStatus {
    if (this.paid(m.milestone_id)) return "COMPLETED";
    return this.evaluation(m.milestone_id).status;
  }

  /** Spec 9.5: who has to act, from the reason of the latest decision. */
  nextStep(m: MilestoneRecord): NextStep {
    if (this.paid(m.milestone_id)) return { kind: "NONE" };
    const evaluation = this.evaluation(m.milestone_id);
    switch (evaluation.reasonCode) {
      case "OPEN_DISPUTE":
        return { kind: "RESOLVE_DISPUTE" };
      case "REJECTION_PRESENT":
        return { kind: "OUTSIDE_SYSTEM" };
      case "UNAUTHORIZED_EVENT":
        return { kind: "REVIEW_EXCEPTION" };
      case "UNRESOLVED_CONDITION":
        return { kind: "MANUAL_REVIEW" };
      case "APPROVAL_QUORUM_NOT_MET":
        return { kind: "APPROVE", roles: this.missingRoles(m) };
      case "MISSING_REQUIRED_EVENT": {
        const missing = evaluation.missing.filter(isBusinessEvent);
        const side = missing.length ? AUTHORITY[missing[0]] : "SUPPLIER";
        return {
          kind: "SUBMIT",
          side,
          eventTypes: missing.filter((type) => AUTHORITY[type] === side),
        };
      }
      default:
        return { kind: "TRANSFER" };
    }
  }

  milestoneRow(m: MilestoneRecord): MilestoneRow {
    const evaluation = this.evaluation(m.milestone_id);
    return {
      id: m.milestone_id,
      contractId: m.contract_id,
      sequence: Number(m.milestone_sequence),
      type: m.milestone_type as MilestoneType,
      name: m.milestone_name,
      origin: m.origin,
      dueDate: m.due_date,
      graceDays: Number(m.grace_period_days),
      plannedMillion: m.planned_payment_vnd_mn,
      paymentPercent: m.payment_percent,
      requiredEventTypes: m.required_event_types
        .split(";")
        .filter(Boolean) as BusinessEventType[],
      approvalRequired: m.approval_required === "TRUE",
      quorum: Number(m.required_approval_quorum),
      approvalRoles: this.approvalRoles(m),
      latePenalty: m.late_penalty_applicable === "TRUE",
      penaltyRatePct: m.penalty_rate_pct_per_day,
      maxPenaltyPct: m.max_penalty_pct,
      releaseRuleCode: m.release_rule_code,
      status: this.status(m),
      decision: evaluation.decision,
      reasonCode: evaluation.reasonCode,
      ruleId: evaluation.ruleId,
      payableMillion: evaluation.payableMillion,
      penaltyMillion: evaluation.penaltyMillion,
      daysLate: evaluation.daysLate,
      completedAt: evaluation.completedAt,
      validApprovals: evaluation.validApprovalCount,
      openDispute: evaluation.openDisputeIds.length > 0,
      requirements: this.requirements(m),
      next: this.nextStep(m),
      paid: this.paid(m.milestone_id),
    };
  }

  /** True when the signed-in user is the one a step waits for. */
  isMine(m: MilestoneRecord, step: NextStep): boolean {
    const contract = this.contract(m.contract_id);
    switch (step.kind) {
      case "SUBMIT":
        return step.eventTypes.some((type) => this.mayRecord(type));
      case "APPROVE": {
        const role = this.approvalRole();
        return (
          !!role &&
          step.roles.includes(role) &&
          contract.buyer_id === this.actor.organizationId
        );
      }
      case "RESOLVE_DISPUTE":
        return (
          this.actor.role === "CONTRACT_OWNER" &&
          contract.buyer_id === this.actor.organizationId
        );
      case "REVIEW_EXCEPTION":
      case "MANUAL_REVIEW":
        return this.actor.role === "ADMIN_AUDITOR";
      case "TRANSFER":
        return (
          this.actor.role === "FINANCE_APPROVER" &&
          contract.buyer_id === this.actor.organizationId
        );
      default:
        return false;
    }
  }

  signingSteps(contractId: string): SignStepView[] {
    return (this.signing(contractId)?.steps ?? []).map((step) => ({
      ...step,
      signerEmail: this.user(step.signerUserId)?.email as string | undefined,
      organizationName: this.partyName(step.organizationId),
    }));
  }

  contractStatus(contract: ContractRecord): ContractStatus {
    if (contract.lifecycle === "DRAFT") return "DRAFT";
    if (contract.lifecycle === "SIGNING") return "AWAITING_SIGNATURE";
    const statuses = this.milestonesOf(contract.contract_id)
      .filter((m) => this.hasEvaluation(m.milestone_id))
      .map((m) => this.status(m));
    if (
      statuses.length &&
      statuses.every((s) => s === "COMPLETED" || s === "REJECTED")
    )
      return "CLOSED";
    if (statuses.includes("REJECTED")) return "NEEDS_REVIEW";
    if (
      statuses.some((s) =>
        ["WAITING_EVIDENCE", "WAITING_APPROVAL", "ON_HOLD"].includes(s),
      )
    )
      return "PENDING_CONDITIONS";
    return "ALL_MILESTONES_ELIGIBLE";
  }

  contractRow(contract: ContractRecord): ContractRow {
    const milestones = this.milestonesOf(contract.contract_id).filter((m) =>
      this.hasEvaluation(m.milestone_id),
    );
    const statuses = milestones.map((m) => this.status(m));
    const counts: MilestoneCounts = {
      total: milestones.length,
      eligible: statuses.filter((s) =>
        ["ELIGIBLE_FOR_PAYMENT", "PAID_WITH_PENALTY", "COMPLETED"].includes(s),
      ).length,
      completed: statuses.filter((s) => s === "COMPLETED").length,
      hold: statuses.filter((s) =>
        ["WAITING_EVIDENCE", "WAITING_APPROVAL", "ON_HOLD"].includes(s),
      ).length,
      rejected: statuses.filter((s) => s === "REJECTED").length,
      penalty: milestones.filter(
        (m) => this.evaluation(m.milestone_id).decision === "PENALTY",
      ).length,
    };
    const paying = milestones
      .map((m) => this.evaluation(m.milestone_id))
      .filter((e) => e.decision === "RELEASE" || e.decision === "PENALTY");
    const active = contract.lifecycle === "ACTIVE";
    const pending = active
      ? milestones.find((m) => {
          const kind = this.nextStep(m).kind;
          return !["NONE", "TRANSFER", "OUTSIDE_SYSTEM"].includes(kind);
        })
      : undefined;
    const step = pending ? this.nextStep(pending) : null;
    const steps = this.signingSteps(contract.contract_id);
    const current = steps.find((s) => s.status === "CURRENT");
    const signingOpen = contract.lifecycle === "SIGNING";
    return {
      id: contract.contract_id,
      title: contract.contract_title,
      type: contract.contract_type as ContractRow["type"],
      origin: contract.origin,
      buyer: {
        id: contract.buyer_id,
        name: this.partyName(contract.buyer_id),
        type: "BUYER",
      },
      supplier: {
        id: contract.supplier_id,
        name: this.partyName(contract.supplier_id),
        type: "SUPPLIER",
      },
      valueMillion: contract.contract_value_vnd_mn,
      signingDate: contract.signing_date || null,
      startDate: contract.start_date,
      endDate: contract.end_date,
      approvalPolicy: contract.approval_policy as ContractRow["approvalPolicy"],
      status: this.contractStatus(contract),
      milestones: counts,
      payableMillion: sumMillion(paying.map((e) => e.payableMillion)),
      penaltyMillion: sumMillion(paying.map((e) => e.penaltyMillion)),
      next:
        pending && step
          ? {
              milestoneId: pending.milestone_id,
              sequence: Number(pending.milestone_sequence),
              type: pending.milestone_type as MilestoneType,
              step,
              dueDate: pending.due_date,
            }
          : null,
      yourTurn: signingOpen
        ? current?.signerUserId === this.actor.id
        : contract.lifecycle === "DRAFT"
          ? this.actor.role === "LEGAL_REVIEWER" &&
            contract.buyer_id === this.actor.organizationId
          : !!(pending && step && this.isMine(pending, step)),
      openDispute: milestones.some(
        (m) => this.evaluation(m.milestone_id).openDisputeIds.length > 0,
      ),
      signing: steps.length
        ? {
            signed: steps.filter((s) => s.status === "SIGNED").length,
            total: steps.length,
            currentSigner: signingOpen ? (current?.signerName ?? null) : null,
          }
        : null,
    };
  }

  /** Days past the due date (positive) and whether the grace period is over. */
  lateness(m: MilestoneRecord) {
    const overdueDays = Math.max(0, daysBetween(m.due_date, today()));
    const deadline = addDays(m.due_date, Number(m.grace_period_days));
    return { overdueDays, deadline, pastGrace: today() > deadline };
  }

  /** Planned amount of the milestones in the given statuses. */
  plannedOf(milestones: MilestoneRecord[], statuses: MilestoneStatus[]) {
    return sumMillion(
      milestones
        .filter((m) => statuses.includes(this.status(m)))
        .map((m) => m.planned_payment_vnd_mn),
    );
  }

  /** Sanity check on amounts coming back from the engine. */
  static positive(value: string) {
    return toCents(value) > 0n;
  }
}
