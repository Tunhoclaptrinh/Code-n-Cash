export type {
  Digitization,
  DigitizedMilestone,
  PdfPagePreview,
  Rect,
  SignatureSlot,
  SignerCertificate,
  SigningConfig,
  SigningOverview,
  SigningRequest,
  SigningRequestStatus,
  SignMethod,
  SignStep,
  SignStepStatus,
  SignStepView,
  SlotLook,
  SlotMap,
  SourceClause,
  SourceClauseKind,
  SourceStatus,
  VerificationResult,
  VerifiedSignature,
} from "@codecash/contracts";
export type { Side as SignParty } from "@codecash/contracts";

/** Result of the browser-side look at a PDF chosen by a third party; not a cryptographic check. */
export type FileCheckOutcome =
  "VALID" | "NO_SIGNATURE" | "NOT_PDF" | "UNVERIFIED";

export interface FileCheckResult {
  outcome: FileCheckOutcome;
  signatureCount: number;
}
