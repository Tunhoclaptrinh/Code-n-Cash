import type { Role } from "@/shared/api/types";

export type MilestoneKind = "SIGNING" | "DELIVERY" | "ACCEPTANCE" | "WARRANTY";

export type MilestoneStatus =
  | "NOT_OPEN"
  | "NOT_DUE"
  | "AWAITING_EVIDENCE"
  | "AWAITING_APPROVAL"
  | "RELEASE"
  | "PENALTY"
  | "HOLD"
  | "REJECT";

export type EvidenceType =
  | "DELIVERY_REPORT"
  | "INVOICE"
  | "ACCEPTANCE_REPORT"
  | "ACCEPTANCE_REPORT_REVISED"
  | "WARRANTY_END_REPORT"
  | "OTHER";

/** Everything a task row can ask the user to bring: evidence documents or the user's own signature. */
export type TaskRequirement = EvidenceType | "OWN_DIGITAL_SIGNATURE";

export type DecisionCode = "RELEASE" | "HOLD" | "REJECT" | "PENALTY";

export type ReasonCode =
  | "ALL_CONDITIONS_MET"
  | "LATE_DELIVERY"
  | "APPROVAL_QUORUM_NOT_MET"
  | "HELD_BY_APPROVER"
  | "REJECTED_BY_APPROVER";

export type ReasonCheckCode =
  | "NO_OPEN_DISPUTE"
  | "AUTHORIZED_SUBMITTER_AND_VALID_SIGNATURES"
  | "APPROVAL_QUORUM_MET"
  | "LATE_DELIVERY";

export interface ReasonCheck {
  code: ReasonCheckCode;
  outcome: "PASS" | "WARN";
}

export type ContractKind = "GOODS_SUPPLY";

export type ParticipantRole =
  | "CONTRACT_OWNER"
  | "FINANCE_APPROVER"
  | "SECOND_APPROVER"
  | "SUPPLIER_REPRESENTATIVE";

export interface Participant {
  id: string;
  name: string;
  role: ParticipantRole;
  side: "BUYER" | "SUPPLIER";
}

export interface Milestone {
  contractId: string;
  no: number;
  kind: MilestoneKind;
  /** Planned amount in millions of VND. */
  plannedMillion: number;
  dueDate: string;
  status: MilestoneStatus;
  requiredEvidence: EvidenceType[];
  submitterRole: Role;
  /** Milestone number that must finish first, for milestones that are not open yet. */
  opensAfterNo?: number;
  completedOn?: string;
  deliveredOn?: string;
  penaltyRateBpPerDay: number;
  penaltyCapBp: number;
}

export type SigningMethod = "VIETTEL_MYSIGN";
export type SignaturePosition = { page: number; corner: "BOTTOM_RIGHT" };

export interface EvidenceSignature {
  signerName: string;
  signedAt: string;
  valid: boolean;
}

export interface EvidenceFile {
  id: string;
  type: EvidenceType;
  fileName: string;
  sizeMb: number;
  pages?: number;
  signature?: EvidenceSignature;
  signingMethod?: SigningMethod;
  signaturePosition?: SignaturePosition;
  /** Set once an approver has opened the document. */
  viewedByApprover?: boolean;
}

export type VoteChoice = "APPROVE" | "HOLD" | "REJECT";

export interface ApprovalVote {
  role: Role;
  userId: string;
  actorName: string;
  choice: VoteChoice;
  note?: string;
  signedAt: string;
}

export type ApprovalStepRole =
  "CONTRACT_OWNER" | "FINANCE_APPROVER" | "SECOND_APPROVER";

export interface ApprovalPolicy {
  /** Roles that must each approve once; the quorum is the number of distinct roles required. */
  requiredRoles: Role[];
  quorum: number;
  hasOptionalSecondApprover: boolean;
}

export interface ApprovalCase {
  contractId: string;
  milestoneNo: number;
  status: "OPEN" | "CLOSED";
  policy: ApprovalPolicy;
  documents: EvidenceFile[];
  votes: ApprovalVote[];
}

export type HistoryCategory = "SIGNATURE" | "SYSTEM" | "HUMAN";

export type HistoryEvent =
  | {
      at: string;
      category: "SIGNATURE";
      kind: "DOCUMENT_SIGNED";
      actorName: string;
      roleName?: Role;
      document: EvidenceType;
    }
  | {
      at: string;
      category: "SYSTEM";
      kind: "EVIDENCE_RECEIVED";
      code: DecisionCode;
      penaltyMillion: number;
    }
  | {
      at: string;
      category: "HUMAN";
      kind: "APPROVED_AND_SIGNED";
      actorName: string;
      roleName: Role;
    }
  | {
      at: string;
      category: "HUMAN";
      kind: "HELD";
      actorName: string;
      roleName: Role;
    }
  | {
      at: string;
      category: "HUMAN";
      kind: "REJECTED";
      actorName: string;
      roleName: Role;
    }
  | {
      at: string;
      category: "SYSTEM";
      kind: "DECISION_FINALIZED";
      code: DecisionCode;
      payableMillion: number;
    };

export interface MilestoneDecision {
  contractId: string;
  milestoneNo: number;
  code: DecisionCode;
  reasonCode: ReasonCode;
  lateDays: number;
  penaltyMillion: number;
  payableMillion: number;
  checks: ReasonCheck[];
  finalizedAt: string;
  approvals: number;
  transferredToAccounting: boolean;
}

export type TaskKind =
  "SUBMIT_EVIDENCE" | "SIGN_CONTRACT" | "RESUBMIT_EVIDENCE" | "APPROVE_PAYMENT";

export type TaskScreen = "EVIDENCE" | "SIGNING" | "APPROVAL";

export interface Task {
  id: string;
  userId: string;
  kind: TaskKind;
  status: "OPEN" | "DONE";
  contractId: string;
  /** Only for contracts that have no summary of their own in the shared store. */
  contractTitle?: string;
  milestoneNo?: number;
  milestoneKind?: MilestoneKind;
  milestoneStatus?: MilestoneStatus;
  dueDate: string;
  requirements: TaskRequirement[];
  detail?:
    | { kind: "BUYER_SIGNED"; at: string }
    | { kind: "REQUEST_REASON"; text: string };
  target: {
    screen: TaskScreen;
    contractId: string;
    milestoneNo?: number;
    stepNo?: number;
  };
}

/** A row of the inbox as the page renders it. */
export interface TaskRow {
  id: string;
  kind: TaskKind;
  contractId: string;
  heading:
    | { kind: "MILESTONE"; no: number; milestoneKind: MilestoneKind }
    | { kind: "TITLE"; title: string };
  subtitle:
    | { kind: "CONTRACT_AMOUNT"; title: string; amountMillion: number }
    | { kind: "BUYER_SIGNED"; at: string }
    | { kind: "REQUEST_REASON"; text: string };
  dueDate: string;
  overdueDays: number;
  requirements: TaskRequirement[];
  badge: "LATE_PENALTY_RISK" | "YOUR_TURN" | "MILESTONE_ON_HOLD" | "ON_TIME";
  primary: boolean;
  href: string;
}

export interface MilestoneRow extends Milestone {
  /** Settled amount in millions of VND, once a decision is final. */
  payableMillion?: number;
  penaltyMillion?: number;
  transferredToAccounting?: boolean;
}

export interface ContractOverview {
  contractId: string;
  title: string;
  kind: ContractKind;
  supplierName: string;
  valueMillion: number;
  phase: "IN_PROGRESS" | "COMPLETED";
  milestones: MilestoneRow[];
  settledMillion: number;
  penaltyMillion: number;
  notDueMillion: number;
  /** Milestones whose evidence or approval is being processed. */
  inProgressMillion: number;
  participants: Participant[];
  documents: Array<{ milestoneNo: number; file: EvidenceFile }>;
}
