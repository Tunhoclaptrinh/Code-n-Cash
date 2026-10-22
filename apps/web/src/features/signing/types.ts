import type { Role } from "@/shared/api/types";

export type SignParty = "BUYER" | "SUPPLIER";

/** Codes of the signing methods the platform supports. Translated at render time (`method.<CODE>`). */
export type SignMethod =
  "USB_TOKEN" | "VNPT_SMARTCA" | "VIETTEL_MYSIGN" | "IMAGE";

export type SignStepStatus = "WAITING" | "CURRENT" | "SIGNED";

export interface SignStep {
  stepNo: number;
  party: SignParty;
  signerUserId: string;
  signerName: string;
  signerTitle: string;
  /** Role shown next to the organisation; omitted for external signers. */
  signerRole?: Role;
  organizationId: string;
  /** The last step must carry a digital signature (no signature image). */
  isFinal: boolean;
  status: SignStepStatus;
  signedAt?: string;
  method?: SignMethod;
}

export interface SignStepView extends SignStep {
  organizationName: string;
}

export type SlotLook = "NAME_AND_TIME" | "WITH_TITLE";

/** Signature slot on a PDF page, in page units (520 x 620 canvas). */
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
  /** Article heading shown on the page (`document.article.<CODE>`). */
  heading: "ARTICLE_13" | "ARTICLE_14";
  textLineCount: number;
  hasSignatureBlock: boolean;
  /** Regions of printed content a signature slot must not cover. */
  blockedZones: Rect[];
}

export interface SigningConfig {
  contractCode: string;
  title: string;
  supplierName: string;
  valueMillion: number;
  fileName: string;
  pageCount: number;
  digitalSignatureRequired: boolean;
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
  /** Confirmation code the signer must see on the phone. */
  code: string;
  sentAt: string;
  expiresAt: string;
  /** When set, the simulated signer confirms on their own at this time. */
  autoConfirmAt: string | null;
}

export interface SignerCertificate {
  holder: string;
  expiryMonth: number;
  expiryYear: number;
}

export interface SignerProfile {
  lastMethod: SignMethod;
  certificates: Partial<Record<SignMethod, SignerCertificate>>;
}

export interface SigningOverview extends SigningConfig {
  currentStepNo: number | null;
  /** Step belonging to the signed-in user, if any. */
  myStepNo: number | null;
  lastMethod: SignMethod;
  certificates: Partial<Record<SignMethod, SignerCertificate>>;
  anySigned: boolean;
}

export type SourceStatus = "MATCH" | "NEEDS_CONFIRMATION" | "CONFIRMED";
export type DocumentType =
  | "SIGNED_CONTRACT"
  | "DELIVERY_NOTE"
  | "INVOICE"
  | "ACCEPTANCE_REPORT"
  | "WARRANTY_END_REPORT";
export type MilestoneKind = "SIGNING" | "DELIVERY" | "ACCEPTANCE" | "WARRANTY";
export type ApproverRole =
  "CONTRACT_OWNER" | "FINANCE_APPROVER" | "SECOND_APPROVER";
export type SourceClauseKind =
  "TOTAL_VALUE" | "DELIVERY" | "LATE_PENALTY" | "APPROVALS";

export interface SourceClause {
  kind: SourceClauseKind;
  article: number;
  page: number;
}

export interface LatePenalty {
  /** Percent of the milestone value per day of delay. */
  ratePerDay: number;
  /** Maximum total penalty, percent of the milestone value. */
  capPercent: number;
}

export interface DigitizedMilestone {
  no: number;
  kind: MilestoneKind;
  valueMillion: number;
  /** ISO date; null when the contract does not state a date. */
  dueDate: string | null;
  documents: DocumentType[];
  penalty: LatePenalty | null;
  source: SourceStatus;
  /** Clause of the contract text this milestone was read from. */
  sourceClause: SourceClauseKind | null;
  /** Set when the contract states a relative term instead of a date. */
  relativeTermMonths?: number;
}

export interface Digitization {
  contractCode: string;
  contractValueMillion: number;
  clauses: SourceClause[];
  milestones: DigitizedMilestone[];
  approvers: ApproverRole[];
  requiredApprovals: number;
  /** Suggested due date for the milestone that needs confirmation (ISO). */
  suggestedDueDate: string | null;
  locked: boolean;
}

export type SignatureCheck = "VALID" | "INVALID";

export interface VerifiedSignature {
  stepNo: number;
  party: SignParty;
  signerName: string;
  signedAt: string;
  method: SignMethod;
  certExpiryMonth: number;
  certExpiryYear: number;
  status: SignatureCheck;
  contentIntact: boolean;
}

export interface VerificationResult {
  contractCode: string;
  stepCount: number;
  signatures: VerifiedSignature[];
  /** Latest signature time once every step is signed. */
  effectiveAt: string | null;
  milestonesOpened: number;
}

export type FileCheckOutcome =
  "VALID" | "NO_SIGNATURE" | "NOT_PDF" | "UNVERIFIED";

export interface FileCheckResult {
  outcome: FileCheckOutcome;
  signatureCount: number;
}
