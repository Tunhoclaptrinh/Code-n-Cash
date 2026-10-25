/**
 * Workflow domain shared by the API and the web app. The web copy is
 * packages/contracts/src/workflow.ts and must stay identical (tests/foundation/domain-types.test.mjs).
 * Vocabulary follows the organiser's Data Pack and docs/04_DAC_TA_NGHIEP_VU.md.
 * Money is a decimal string in millions of VND ("1290.00"), never a float.
 */

/** Where a record comes from: the organiser's Data Pack, demo seed data, or an action in the app. */
export type Origin = "DATA_PACK" | "SEED" | "APP";

/**
 * System roles (spec 17). Three internal roles keep SoD-1: the controller handles exceptions, the
 * system administrator manages configuration and accounts, the auditor only reads.
 */
export type Role =
  | "CONTRACT_OWNER"
  | "FINANCE_APPROVER"
  | "SECONDARY_APPROVER"
  | "LEGAL_REVIEWER"
  | "ADMIN_AUDITOR"
  | "SYSTEM_ADMIN"
  | "AUDITOR"
  | "SUPPLIER";

export type PartyType = "BUYER" | "SUPPLIER" | "APPROVER";
export type Side = "BUYER" | "SUPPLIER";
export type ApprovalRole =
  "CONTRACT_OWNER" | "FINANCE_APPROVER" | "SECONDARY_APPROVER";

export type ContractType =
  "GOODS_SUPPLY" | "SERVICES" | "SOFTWARE_IMPLEMENTATION" | "MAINTENANCE";
export type WorkflowTemplate =
  | "WF_GOODS_4STAGE"
  | "WF_SERVICE_4STAGE"
  | "WF_SOFTWARE_5STAGE"
  | "WF_MAINTENANCE_3STAGE";
export type ApprovalPolicy =
  | "AUTO_IF_ALL_CONDITIONS"
  | "SINGLE_BUYER_APPROVAL"
  | "DUAL_APPROVAL"
  | "FINANCE_PLUS_OWNER";

export type MilestoneType =
  | "SIGNING"
  | "DELIVERY"
  | "ACCEPTANCE"
  | "WARRANTY"
  | "KICKOFF"
  | "INTERIM_DELIVERY"
  | "FINAL_ACCEPTANCE"
  | "WARRANTY_CLOSE"
  | "REQUIREMENTS_APPROVAL"
  | "UAT_PASS"
  | "GO_LIVE_ACCEPTANCE"
  | "ACTIVATION"
  | "SERVICE_COMPLETION";

/** Events that prove a condition; the matrix of spec 4.2 says which side may create each. */
export type BusinessEventType =
  | "CONTRACT_SIGNED"
  | "KICKOFF_CONFIRMED"
  | "REQUIREMENTS_APPROVED"
  | "UAT_PASSED"
  | "ACCEPTANCE"
  | "DELIVERY"
  | "INVOICE"
  | "GO_LIVE"
  | "SERVICE_ACTIVATED"
  | "SERVICE_COMPLETED"
  | "WARRANTY_COMPLETED";
export type SupportEventType =
  "APPROVAL" | "REJECTION" | "DISPUTE_OPENED" | "DISPUTE_RESOLVED";
export type EventType = BusinessEventType | SupportEventType;
export type EventStatus =
  "CONFIRMED" | "APPROVED" | "REJECTED" | "OPEN" | "RESOLVED";

export type Decision = "RELEASE" | "HOLD" | "REJECT" | "PENALTY";
export type ReasonCode =
  | "OPEN_DISPUTE"
  | "REJECTION_PRESENT"
  | "UNAUTHORIZED_EVENT"
  | "MISSING_REQUIRED_EVENT"
  | "APPROVAL_QUORUM_NOT_MET"
  | "LATE_COMPLETION"
  | "ALL_CONDITIONS_MET"
  | "UNRESOLVED_CONDITION";

/** Milestone status of spec 9.2; COMPLETED once the simulated payment is recorded (Silver). */
export type MilestoneStatus =
  | "WAITING_EVIDENCE"
  | "WAITING_APPROVAL"
  | "ON_HOLD"
  | "REJECTED"
  | "ELIGIBLE_FOR_PAYMENT"
  | "PAID_WITH_PENALTY"
  | "COMPLETED";

/** Lifecycle until the contract is signed, then the aggregate of spec 9.3. */
export type ContractStatus =
  | "DRAFT"
  | "AWAITING_SIGNATURE"
  | "PENDING_CONDITIONS"
  | "NEEDS_REVIEW"
  | "ALL_MILESTONES_ELIGIBLE"
  | "CLOSED";

/** Who must act next on a milestone (spec 9.5), derived from the latest evaluation. */
export type NextStep =
  | { kind: "SUBMIT"; side: Side; eventTypes: BusinessEventType[] }
  | { kind: "APPROVE"; roles: ApprovalRole[] }
  | { kind: "RESOLVE_DISPUTE" }
  | { kind: "REVIEW_EXCEPTION" }
  | { kind: "MANUAL_REVIEW" }
  | { kind: "OUTSIDE_SYSTEM" }
  | { kind: "TRANSFER" }
  | { kind: "SIGN_CONTRACT" }
  | { kind: "NONE" };

export interface PartyRef {
  id: string;
  name: string;
  type: PartyType;
}

export interface MilestoneCounts {
  total: number;
  eligible: number;
  completed: number;
  hold: number;
  rejected: number;
  penalty: number;
}

export interface ContractRow {
  id: string;
  title: string;
  type: ContractType;
  origin: Origin;
  buyer: PartyRef;
  supplier: PartyRef;
  valueMillion: string;
  signingDate: string | null;
  startDate: string;
  endDate: string;
  approvalPolicy: ApprovalPolicy;
  status: ContractStatus;
  milestones: MilestoneCounts;
  /** Sum the decisions make eligible (RELEASE and PENALTY), and the penalties deducted. */
  payableMillion: string;
  penaltyMillion: string;
  /** First milestone where someone has to act; null when nothing is pending. */
  next: {
    milestoneId: string;
    sequence: number;
    type: MilestoneType;
    step: NextStep;
    dueDate: string;
  } | null;
  /** The signed-in user is the one who has to act next. */
  yourTurn: boolean;
  openDispute: boolean;
  signing: {
    signed: number;
    total: number;
    currentSigner: string | null;
  } | null;
}

export interface ContractList {
  organizationName: string;
  contracts: ContractRow[];
}

export interface Requirement {
  eventType: BusinessEventType;
  side: Side;
  state: "VALID" | "MISSING" | "UNAUTHORIZED";
  eventId: string | null;
  at: string | null;
}

export interface MilestoneRow {
  id: string;
  contractId: string;
  sequence: number;
  type: MilestoneType;
  name: string;
  origin: Origin;
  dueDate: string;
  graceDays: number;
  plannedMillion: string;
  paymentPercent: string;
  requiredEventTypes: BusinessEventType[];
  approvalRequired: boolean;
  quorum: number;
  approvalRoles: ApprovalRole[];
  latePenalty: boolean;
  penaltyRatePct: string;
  maxPenaltyPct: string;
  releaseRuleCode: string;
  status: MilestoneStatus;
  decision: Decision;
  reasonCode: ReasonCode;
  ruleId: string;
  payableMillion: string;
  penaltyMillion: string;
  daysLate: number;
  completedAt: string | null;
  validApprovals: number;
  openDispute: boolean;
  requirements: Requirement[];
  next: NextStep;
  paid: boolean;
}

export interface EventActor {
  partyId: string;
  name: string;
  /** Looked up in the parties table, never taken from the event row (BR-04). */
  type: PartyType | null;
  approvalRole: ApprovalRole | null;
}

export interface EventRow {
  id: string;
  contractId: string;
  milestoneId: string;
  contractSequence: number;
  at: string;
  type: EventType;
  status: EventStatus;
  actor: EventActor;
  source: string;
  documentId: string;
  amountMillion: string | null;
  referenceEventId: string | null;
  note: string;
  origin: Origin;
  /** Person who recorded it in the app, when known. */
  recordedBy: string | null;
  fileName: string | null;
}

export type EventClass =
  | "EVIDENCE"
  | "ADDITIONAL"
  | "APPROVAL"
  | "APPROVAL_NOT_COUNTED"
  | "REJECTION"
  | "OPEN_DISPUTE"
  | "CLOSED_DISPUTE"
  | "RESOLUTION"
  | "DUPLICATE"
  | "UNAUTHORIZED"
  | "WRONG_STATUS"
  | "UNRELATED"
  | "VOIDED";

export interface ClassifiedEvent extends EventRow {
  classification: EventClass;
  duplicateOf: string | null;
}

export interface Evaluation {
  milestoneId: string;
  contractId: string;
  runId: string;
  evaluatedAt: string;
  decision: Decision;
  reasonCode: ReasonCode;
  ruleId: string;
  status: MilestoneStatus;
  payableMillion: string;
  penaltyMillion: string;
  rawPenaltyMillion: string;
  evidence: string[];
  missing: BusinessEventType[];
  unauthorized: string[];
  duplicates: Array<[string, string]>;
  unrelated: string[];
  voided: string[];
  openDisputeIds: string[];
  validRejectionCount: number;
  approvalRequired: boolean;
  validApprovalCount: number;
  quorum: number;
  daysLate: number;
  completedAt: string | null;
  conditionsMet: string[];
  missingConditions: string[];
  issues: string[];
  notes: string[];
  confidence: string;
  specVersion: string;
}

export interface RuleRow {
  id: string;
  priority: number;
  name: string;
  group: string;
  condition: string;
  decision: Decision;
  reasonCode: ReasonCode;
  payableFormula: string;
  penaltyFormula: string;
  description: string;
}

export type RuleOutcome = "NOT_MATCHED" | "MATCHED" | "NOT_EVALUATED";

export type Trigger =
  | { kind: "IMPORT" }
  | { kind: "EVENTS"; eventIds: string[]; actorName: string }
  | {
      kind: "EXCEPTION";
      exceptionId: string;
      eventId: string;
      actorName: string;
    }
  | { kind: "PAYMENT"; paymentId: string; actorName: string }
  | { kind: "CONTRACT"; actorName: string };

export interface StatusSnapshot {
  status: MilestoneStatus;
  decision: Decision;
  reasonCode: ReasonCode;
}

export interface StatusChange {
  id: string;
  milestoneId: string;
  contractId: string;
  runId: string;
  at: string;
  from: StatusSnapshot | null;
  to: StatusSnapshot;
  trigger: Trigger;
}

export interface Payment {
  id: string;
  milestoneId: string;
  contractId: string;
  runId: string;
  decision: Decision;
  amountMillion: string;
  transferredBy: string;
  transferredAt: string;
}

export type ExceptionState = "PROPOSED" | "APPROVED" | "REJECTED";

export interface ExceptionRequest {
  id: string;
  milestoneId: string;
  contractId: string;
  eventId: string;
  action: "VOID";
  reason: string;
  proposedBy: { userId: string; name: string };
  proposedAt: string;
  status: ExceptionState;
  decidedBy: { userId: string; name: string } | null;
  decidedAt: string | null;
  decisionNote: string | null;
}

export interface Preview {
  decision: Decision;
  reasonCode: ReasonCode;
  status: MilestoneStatus;
  payableMillion: string;
  penaltyMillion: string;
  daysLate: number;
}

/**
 * A milestone right after one moment of its history (as-of evaluation, BR-16). Before the due date
 * a milestone still missing evidence is PLANNED (no event yet) or IN_PROGRESS.
 */
export interface TimelinePoint {
  at: string;
  /** Events recorded at that moment. */
  events: EventRow[];
  decision: Decision;
  reasonCode: ReasonCode;
  ruleId: string;
  status: MilestoneStatus | "PLANNED" | "IN_PROGRESS";
  payableMillion: string;
  penaltyMillion: string;
  daysLate: number;
  missing: BusinessEventType[];
  approvals: { valid: number; quorum: number };
  openDisputeIds: string[];
}

export interface Participant {
  side: Side;
  kind: "ORGANIZATION" | "APPROVER" | "OFFICER" | "REPRESENTATIVE";
  partyId: string;
  name: string;
  personName: string | null;
  role: Role | null;
  approvalRole: ApprovalRole | null;
  email: string | null;
  origin: Origin;
  identityOrigin?: Origin;
}

export type TimelineEntry =
  | { kind: "EVENT"; at: string; event: EventRow }
  | { kind: "STATUS"; at: string; change: StatusChange };

export interface ContractOverview {
  contract: ContractRow;
  workflowTemplate: WorkflowTemplate;
  ruleSetId: string;
  graceDays: number;
  penaltyRatePct: string;
  maxPenaltyPct: string;
  autoReleaseAllowed: boolean;
  milestones: MilestoneRow[];
  totals: {
    valueMillion: string;
    eligibleMillion: string;
    penaltyMillion: string;
    paidMillion: string;
    heldMillion: string;
    rejectedMillion: string;
  };
  participants: Participant[];
  events: EventRow[];
  timeline: TimelineEntry[];
  signing: SigningSummary | null;
}

export interface MilestoneDetail {
  contract: ContractRow;
  milestone: MilestoneRow;
  evaluation: Evaluation;
  rules: Array<RuleRow & { outcome: RuleOutcome }>;
  events: ClassifiedEvent[];
  money: {
    plannedMillion: string;
    dueDate: string;
    graceDays: number;
    deadline: string;
    completedAt: string | null;
    daysLate: number;
    latePenalty: boolean;
    penaltyRatePct: string;
    maxPenaltyPct: string;
    capMillion: string;
    rawPenaltyMillion: string;
    penaltyMillion: string;
    payableMillion: string;
  };
  history: StatusChange[];
  payment: Payment | null;
  exceptions: ExceptionRequest[];
  actions: {
    submit: boolean;
    approve: boolean;
    reject: boolean;
    openDispute: boolean;
    resolveDispute: boolean;
    transfer: boolean;
    proposeException: boolean;
  };
}

export interface Attachment {
  id: string;
  eventType: BusinessEventType | "OTHER";
  fileName: string;
  sizeMb: number;
  addedBy: string;
  addedAt: string;
}

export interface EvidenceSlot {
  eventType: BusinessEventType;
  side: Side;
  state: Requirement["state"];
  /** The signed-in user's side may submit this type (spec 4.2 and 17). */
  mine: boolean;
  evidence: EventRow | null;
  attachment: Attachment | null;
}

export interface EvidenceWorkspace {
  contract: ContractRow;
  milestone: MilestoneRow;
  side: Side;
  slots: EvidenceSlot[];
  extras: Attachment[];
  overdueDays: number;
  canSubmit: boolean;
  /** Engine result if the attached documents were submitted now (dry run). */
  preview: Preview | null;
}

export interface ApprovalSlot {
  role: ApprovalRole;
  required: boolean;
  partyId: string;
  personName: string;
  state: "APPROVED" | "PENDING" | "REJECTED";
  at: string | null;
  eventId: string | null;
  isYou: boolean;
}

export interface ApprovalView {
  contract: ContractRow;
  milestone: MilestoneRow;
  evaluation: Evaluation;
  slots: ApprovalSlot[];
  evidence: EventRow[];
  /** Engine result if the signed-in approver approves now (dry run). */
  preview: Preview | null;
  canApprove: boolean;
  canReject: boolean;
  blockedReason: string | null;
}

export interface DisputeCase {
  opened: EventRow;
  resolution: EventRow | null;
  state: "OPEN" | "RESOLVED";
}

export interface NoteRow {
  id: string;
  milestoneId: string;
  kind: "REQUEST_INFO" | "DISPUTE_NOTE";
  text: string;
  author: string;
  at: string;
}

export interface DisputeView {
  contract: ContractRow;
  milestone: MilestoneRow;
  evaluation: Evaluation;
  disputes: DisputeCase[];
  /** Engine result once every open dispute is closed (dry run). */
  preview: Preview | null;
  notes: NoteRow[];
  canOpen: boolean;
  canResolve: boolean;
}

export type TaskKind =
  | "SUBMIT_EVIDENCE"
  | "RESUBMIT_EVIDENCE"
  | "APPROVE_PAYMENT"
  | "RESOLVE_DISPUTE"
  | "SIGN_CONTRACT"
  | "REVIEW_EXCEPTION"
  | "DECIDE_EXCEPTION"
  | "COMPLETE_DRAFT";

export interface TaskRow {
  id: string;
  kind: TaskKind;
  contractId: string;
  contractTitle: string;
  milestoneId: string | null;
  sequence: number | null;
  milestoneType: MilestoneType | null;
  dueDate: string | null;
  overdueDays: number;
  eventTypes: BusinessEventType[];
  roles: ApprovalRole[];
  amountMillion: string | null;
  reasonCode: ReasonCode | null;
  badge: "LATE_PENALTY_RISK" | "YOUR_TURN" | "MILESTONE_ON_HOLD" | "ON_TIME";
  href: string;
  origin: Origin;
}

/** Decision facts compared by the integrity check. */
export interface DecisionFacts {
  decision: Decision;
  reasonCode: ReasonCode;
  ruleId: string;
  payableMillion: string;
  penaltyMillion: string;
}

/**
 * Integrity check (spec 14.5, risk R08): the audit hash chain, the events the app recorded against
 * the hash sealed with them, and every stored decision against a fresh engine run.
 */
export interface IntegrityReport {
  checkedAt: string;
  chain: {
    ok: boolean;
    sealed: number;
    /** Entries written before the chain existed: listed, not verified. */
    unsealed: number;
    head: { seq: number; hash: string } | null;
    firstBroken: {
      seq: number;
      id: string;
      problem: "SEQUENCE_GAP" | "LINK_BROKEN" | "CONTENT_CHANGED";
    } | null;
    /** Against a head hash saved earlier, when one is given. */
    anchor: "MATCH" | "MISMATCH" | "NOT_FOUND" | null;
  };
  evidence: {
    sealed: number;
    /** App events recorded before sealing existed. */
    unsealed: number;
    problems: Array<{
      eventId: string;
      contractId: string | null;
      problem: "CHANGED" | "MISSING";
    }>;
  };
  /** The organiser's rows against the hash sealed when they were imported; null without that seal. */
  dataPack: {
    sealedAt: string;
    tables: Array<{
      name: string;
      sealedRows: number;
      rows: number;
      ok: boolean;
    }>;
  } | null;
  decisions: {
    checked: number;
    matched: number;
    runId: string;
    fingerprint: string;
    mismatches: Array<{
      milestoneId: string;
      contractId: string;
      sequence: number;
      /** Paid or rejected: the engine no longer changes it. */
      frozen: boolean;
      stored: DecisionFacts;
      fresh: DecisionFacts | null;
    }>;
  };
}

export interface ExceptionQueueRow {
  contract: ContractRow;
  milestone: MilestoneRow;
  evaluation: Evaluation;
  candidates: EventRow[];
  requests: ExceptionRequest[];
}

export type ActivityCategory =
  "SYSTEM" | "APPROVAL" | "EVIDENCE" | "DISPUTE" | "SIGN";

export type ActivityAction =
  | {
      kind: "EVENT";
      eventType: EventType;
      status: EventStatus;
      eventId: string;
    }
  | {
      kind: "DECISION";
      decision: Decision;
      reasonCode: ReasonCode;
      status: MilestoneStatus;
      previous: MilestoneStatus | null;
      runId: string;
    }
  | { kind: "SIGNATURE"; stepNo: number; totalSteps: number; isFinal: boolean }
  | { kind: "DIGITIZATION_CONFIRMED"; milestoneCount: number }
  | { kind: "EXCEPTION"; state: ExceptionState; eventId: string }
  | { kind: "PAYMENT"; amountMillion: string }
  | { kind: "REQUEST_INFO"; text: string }
  | { kind: "WORKFLOW_ACTION"; code: string };

export interface ActivityEntry {
  id: string;
  at: string;
  actor: {
    id: string;
    displayName: string | null;
    /** A system role, a party type or "SYSTEM" for the engine. */
    role: Role | PartyType | ApprovalRole | "SYSTEM";
  };
  category: ActivityCategory;
  action: ActivityAction;
  contractCode: string;
  milestoneId: string | null;
  milestoneNo: number | null;
  origin: Origin;
  audit?: {
    seq?: number;
    hash?: string;
    transactionId?: string;
    requestId?: string;
    outcome?: string;
    changes?: Array<{
      resource: string;
      recordId: string;
      operation: string;
      fields: Record<string, { before: unknown; after: unknown }>;
    }>;
  };
}

export interface ActivityFilters {
  contractCode: string;
  actorId: string;
  category: ActivityCategory | "";
  from: string;
  to: string;
}

/* ---------------------------- Signing ---------------------------- */

export type SignMethod =
  "USB_TOKEN" | "VNPT_SMARTCA" | "VIETTEL_MYSIGN" | "IMAGE";
export type SignStepStatus = "WAITING" | "CURRENT" | "SIGNED";

export interface SignStep {
  stepNo: number;
  party: Side;
  signerUserId: string;
  signerName: string;
  signerTitle: string;
  signerRole: Role | null;
  organizationId: string;
  /** The last step must carry a digital signature (no signature image). */
  isFinal: boolean;
  status: SignStepStatus;
  signedAt: string | null;
  method: SignMethod | null;
  proofSource?: "LOCAL_ED25519" | "HTTP_ED25519_BRIDGE";
  localProof?: {
    provider: "LOCAL_ED25519";
    payload: Record<string, unknown>;
    publicKey: string;
    keyFingerprint: string;
    signature: string;
  };
}

export interface SignStepView extends SignStep {
  signerEmail?: string;
  organizationName: string;
}

export type SlotLook = "NAME_AND_TIME" | "WITH_TITLE";

/** Top-left coordinates in a 520-unit-wide page. Actual page height comes from PDF metadata. */
export interface SignatureSlot {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  look: SlotLook;
}

/** Slots keyed by sign step number. `null` means the step has no slot yet. */
export type SlotMap = Record<number, SignatureSlot | null>;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PdfPagePreview {
  pageNo: number;
  width?: number;
  height?: number;
  widthPt?: number;
  heightPt?: number;
  contentCheck?: "TEXT" | "MANUAL";
  anchors?: Array<{
    stepNo: number;
    x: number;
    y: number;
    w?: number;
    h?: number;
    signerName?: string;
    party?: Side;
  }>;
  heading: "ARTICLE_13" | "ARTICLE_14";
  textLineCount: number;
  hasSignatureBlock: boolean;
  /** Printed "representative" block of each signer: heading and name lines. */
  blocks: Array<{ stepNo: number; x: number; headingY: number; nameY: number }>;
  blockedZones: Rect[];
}

export interface SigningSummary {
  signed: number;
  total: number;
  steps: SignStepView[];
  origin: Origin;
}

export interface SigningConfig {
  contractCode: string;
  documentId?: string;
  documentSha256?: string;
  layoutVersion?: number;
  title: string;
  supplierName: string;
  valueMillion: string;
  fileName: string;
  pageCount: number;
  digitalSignatureRequired: boolean;
  origin: Origin;
  steps: SignStepView[];
  slots: SlotMap;
  previewPages: PdfPagePreview[];
}

export type SigningRequestStatus =
  "PENDING" | "COMPLETED" | "CANCELLED" | "REJECTED" | "EXPIRED";

export interface SigningRequest {
  id: string;
  contractCode: string;
  stepNo: number;
  method: SignMethod;
  status: SigningRequestStatus;
  code: string;
  sentAt: string;
  expiresAt: string;
  autoConfirmAt: string | null;
  documentDigest?: string;
  termsDigest?: string;
}

export interface SignerCertificate {
  holder: string;
  expiryMonth: number;
  expiryYear: number;
}

export interface SigningOverview extends SigningConfig {
  simulated: boolean;
  currentStepNo: number | null;
  myStepNo: number | null;
  lastMethod: SignMethod;
  certificates: Partial<Record<SignMethod, SignerCertificate>>;
  anySigned: boolean;
}

export type SignatureCheck = "VALID" | "INVALID" | "UNVERIFIED";

export interface VerifiedSignature {
  stepNo: number;
  party: Side;
  signerName: string;
  signedAt: string;
  method: SignMethod;
  certExpiryMonth: number;
  certExpiryYear: number;
  status: SignatureCheck;
  contentIntact: boolean;
  cryptoValid?: boolean;
  certificateTrusted?: boolean;
  proofBasis?: "DOCUMENT_BYTES" | "TERMS_SNAPSHOT";
  keyFingerprint?: string;
}

export interface VerificationResult {
  contractCode: string;
  stepCount: number;
  signatures: VerifiedSignature[];
  effectiveAt: string | null;
  milestonesOpened: number;
  origin: Origin;
}

/* ------------------------- Upload and digitisation ------------------------- */

export type ContractFileKind = "PDF" | "DOCX";

export interface ContractFile {
  name: string;
  sizeBytes: number;
  kind: ContractFileKind;
  pages?: number;
  documentId?: string;
  sha256?: string;
}

export interface DraftSigner {
  party: Side;
  userId: string;
}

export type DraftState = "DRAFT" | "DIGITIZED" | "SIGNING" | "ACTIVE";

export interface ContractTemplateSnapshot {
  id: string;
  version: number;
  name: string;
  documentBody: string;
}

export interface ContractDraft {
  templateId?: string;
  templateVersion?: number;
  templateSnapshot?: ContractTemplateSnapshot;
  documentBody?: string;
  ruleVersion?: { id: string; hash: string };
  code: string;
  state: DraftState;
  origin: Origin;
  type: ContractType;
  title: string;
  supplierId: string;
  reviewerId: string;
  valueMillion: string;
  startDate: string;
  endDate: string;
  approvalPolicy: ApprovalPolicy;
  graceDays: number;
  penaltyRatePct: string;
  maxPenaltyPct: string;
  signers: DraftSigner[];
  file: ContractFile;
  appendixNames: string[];
  appendixDocuments?: Array<{ id: string; name: string; sha256: string }>;
}

export interface PersonOption {
  userId: string;
  name: string;
  title: string;
  role: Role;
  organizationId: string;
  organizationName: string;
}

export interface SigningPreset {
  id: string;
  name: string;
  version: number;
  description: string;
  defaults: Pick<
    ContractDraft,
    | "type"
    | "approvalPolicy"
    | "valueMillion"
    | "graceDays"
    | "penaltyRatePct"
    | "maxPenaltyPct"
    | "documentBody"
  >;
  signers: DraftSigner[];
}

export interface UploadFormOptions {
  types: ContractType[];
  policies: ApprovalPolicy[];
  suppliers: { id: string; name: string }[];
  reviewers: PersonOption[];
  buyerSigners: PersonOption[];
  supplierSigners: Record<string, PersonOption[]>;
  presets: SigningPreset[];
  /** Stage list per contract type, from the Data Pack workflows. */
  workflows: Record<
    ContractType,
    { template: WorkflowTemplate; stages: MilestoneType[] }
  >;
}

export type SourceStatus = "MATCH" | "NEEDS_CONFIRMATION" | "CONFIRMED";
export type SourceClauseKind =
  "TOTAL_VALUE" | "DELIVERY" | "LATE_PENALTY" | "APPROVALS";

export interface SourceClause {
  kind: SourceClauseKind;
  article: number;
  page: number;
}

export interface DigitizedMilestone {
  sequence: number;
  type: MilestoneType;
  valueMillion: string;
  paymentPercent: string;
  dueDate: string | null;
  eventTypes: BusinessEventType[];
  penalty: { ratePct: string; capPct: string } | null;
  source: SourceStatus;
  sourceClause: SourceClauseKind | null;
  relativeTermMonths: number | null;
}

export interface Digitization {
  contractCode: string;
  contractValueMillion: string;
  clauses: SourceClause[];
  milestones: DigitizedMilestone[];
  approvers: ApprovalRole[];
  requiredApprovals: number;
  suggestedDueDate: string | null;
  locked: boolean;
}
