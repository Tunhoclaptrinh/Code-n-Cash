import { canonical, sha256 } from "../common/audit-chain";
import type { RecordEntity } from "../common/types";
import type {
  ApprovalRole,
  BusinessEventType,
  ContractDraft,
  Evaluation,
  ExceptionRequest,
  NoteRow,
  Origin,
  Payment,
  SignerCertificate,
  SigningRequest,
  SignMethod,
  SignStep,
  SlotMap,
  StatusChange,
  PdfPagePreview,
  Attachment,
  Digitization,
} from "./types";

/** Collections of the workflow database. Data Pack tables keep the organiser's column names. */
export const TABLE = {
  parties: "parties",
  contracts: "contracts",
  milestones: "milestones",
  events: "events",
  rules: "payment-rules",
  evaluations: "evaluations",
  history: "status-history",
  runs: "engine-runs",
  signing: "signing",
  requests: "signing-requests",
  profiles: "signing-profiles",
  drafts: "contract-drafts",
  attachments: "attachments",
  notes: "notes",
  exceptions: "exceptions",
  payments: "payments",
} as const;

export type Tables = Record<string, RecordEntity[]>;

/** Tables whose Data Pack rows are sealed at import (risk R08: the organiser's data stays as given). */
export const SEALED_TABLES = [
  TABLE.contracts,
  TABLE.parties,
  TABLE.milestones,
  TABLE.events,
  TABLE.rules,
];

/** Row count and SHA-256 of the Data Pack rows of each sealed table, in id order. */
export function dataPackSeal(tables: Tables) {
  return Object.fromEntries(
    SEALED_TABLES.map((name) => {
      const rows = (tables[name] ?? [])
        .filter((row) => row.origin === "DATA_PACK")
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      return [name, { rows: rows.length, hash: sha256(canonical(rows)) }];
    }),
  ) as Record<string, { rows: number; hash: string }>;
}

/** Data Pack columns, in the organiser's order; the engine receives exactly these. */
export const COLUMNS = {
  contracts: [
    "contract_id",
    "contract_title",
    "contract_type",
    "buyer_id",
    "supplier_id",
    "contract_value_vnd_mn",
    "currency",
    "signing_date",
    "start_date",
    "end_date",
    "workflow_template",
    "rule_set_id",
    "approval_policy",
    "approval_quorum",
    "auto_release_allowed",
    "grace_period_days",
    "penalty_rate_pct_per_day",
    "max_penalty_pct",
    "initial_contract_status",
    "data_is_synthetic",
  ],
  parties: [
    "party_id",
    "party_name",
    "party_type",
    "parent_party_id",
    "organization_category",
    "region",
    "country",
    "approval_role",
    "approval_level",
    "approval_limit_vnd_mn",
    "allowed_event_types",
    "can_approve_payment",
    "can_raise_dispute",
    "status",
    "data_is_synthetic",
  ],
  milestones: [
    "milestone_id",
    "contract_id",
    "milestone_sequence",
    "milestone_type",
    "milestone_name",
    "due_date",
    "payment_percent",
    "planned_payment_vnd_mn",
    "condition_logic",
    "required_event_types",
    "required_condition",
    "invoice_required",
    "approval_required",
    "required_approval_quorum",
    "required_approval_roles",
    "hold_on_open_dispute",
    "late_penalty_applicable",
    "grace_period_days",
    "penalty_rate_pct_per_day",
    "max_penalty_pct",
    "release_rule_code",
    "initial_milestone_status",
    "data_is_synthetic",
  ],
  events: [
    "event_id",
    "contract_id",
    "milestone_id",
    "contract_event_sequence",
    "event_timestamp",
    "event_type",
    "event_status",
    "actor_party_id",
    "actor_party_type",
    "actor_role",
    "event_source",
    "document_id",
    "amount_vnd_mn",
    "reference_event_id",
    "event_note",
    "data_is_synthetic",
  ],
  payment_rules: [
    "rule_id",
    "rule_set_id",
    "release_rule_code",
    "workflow_template",
    "contract_type",
    "applies_to_milestone_type",
    "priority",
    "evaluation_order",
    "rule_name",
    "rule_group",
    "condition_expression",
    "decision",
    "reason_code",
    "stop_processing",
    "payable_amount_formula",
    "penalty_amount_formula",
    "parameter_source",
    "rule_description_vi",
    "active",
    "data_is_synthetic",
  ],
} as const;

type Columns<K extends keyof typeof COLUMNS> = Record<
  (typeof COLUMNS)[K][number],
  string
>;

export type PartyRecord = RecordEntity &
  Columns<"parties"> & { origin: Origin };

export type ContractRecord = RecordEntity &
  Columns<"contracts"> & {
    origin: Origin;
    /** DRAFT until the terms are confirmed, SIGNING until every signer signed, then ACTIVE. */
    lifecycle: "DRAFT" | "SIGNING" | "ACTIVE";
  };

export type MilestoneRecord = RecordEntity &
  Columns<"milestones"> & { origin: Origin };

export type EventRecord = RecordEntity &
  Columns<"events"> & {
    origin: Origin;
    recordedBy?: string | null;
    recordedByUserId?: string | null;
    fileName?: string | null;
  };

export type RuleRecord = RecordEntity &
  Columns<"payment_rules"> & { origin: Origin };

export type EvaluationRecord = RecordEntity & Evaluation;
export type HistoryRecord = RecordEntity & StatusChange;

export interface EngineRunRecord extends RecordEntity {
  runId: string;
  inputFingerprint: string;
  trigger: string;
  milestones: number;
  changed: number;
  durationMs: number;
  invariantViolations: string[];
}

export interface SigningRecord extends RecordEntity {
  contractCode: string;
  fileName: string;
  pageCount: number;
  digitalSignatureRequired: boolean;
  steps: SignStep[];
  slots: SlotMap;
  previewPages: PdfPagePreview[];
  origin: Origin;
}

export type SigningRequestRecord = RecordEntity & SigningRequest;

export interface ProfileRecord extends RecordEntity {
  lastMethod: SignMethod;
  certificates: Partial<Record<SignMethod, SignerCertificate>>;
}

export interface DraftRecord extends RecordEntity {
  code: string;
  title: string;
  supplierId: string;
  contractType: ContractDraft["type"];
  state: ContractDraft["state"];
  origin: Origin;
  reviewerId: string;
  valueMillion: string;
  startDate: string;
  endDate: string;
  approvalPolicy: ContractDraft["approvalPolicy"];
  graceDays: number;
  penaltyRatePct: string;
  maxPenaltyPct: string;
  signers: ContractDraft["signers"];
  file: ContractDraft["file"];
  appendixNames: string[];
  digitization: Digitization | null;
}

export interface AttachmentRecord extends RecordEntity, Omit<Attachment, "id"> {
  milestoneId: string;
  side: "BUYER" | "SUPPLIER";
}

export type NoteRecord = RecordEntity & NoteRow;
export type ExceptionRecord = RecordEntity & ExceptionRequest;
export type PaymentRecord = RecordEntity & Payment;

/** Stage of a Data Pack workflow, as found in milestones.csv. */
export interface StageTemplate {
  sequence: number;
  type: string;
  name: string;
  paymentPercent: string;
  eventTypes: BusinessEventType[];
  latePenalty: boolean;
  /** Median days from the contract start to the due date in the Data Pack. */
  offsetDays: number;
}

export const APPROVAL_ROLES_BY_POLICY: Record<string, ApprovalRole[]> = {
  AUTO_IF_ALL_CONDITIONS: [],
  SINGLE_BUYER_APPROVAL: ["CONTRACT_OWNER"],
  DUAL_APPROVAL: ["CONTRACT_OWNER", "SECONDARY_APPROVER"],
  FINANCE_PLUS_OWNER: ["CONTRACT_OWNER", "FINANCE_APPROVER"],
};
