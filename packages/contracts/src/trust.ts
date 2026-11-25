export interface LocalProof {
  provider: "LOCAL_ED25519";
  payload: Record<string, unknown>;
  publicKey: string;
  keyFingerprint: string;
  signature: string;
}
export interface AnchorPayload {
  schemaVersion: 1;
  systemId: string;
  sequence: number;
  headHash: string;
  snapshotHash: string;
  createdAt: string;
  algorithm: "SHA-256";
  manifest: Record<string, { count: number; sha256: string }>;
  /** Merkle root of entry hashes 1..sequence (common/merkle.ts); absent on older anchors. */
  merkleRoot?: string;
}
/** One audit entry with the path that proves it is in an anchored chain (tools/verify_audit.py). */
export interface AuditProof {
  entry: Record<string, unknown>;
  leafIndex: number;
  treeSize: number;
  path: string[];
  anchor: {
    id: string;
    payload: AnchorPayload;
    receipt: LocalProof | null;
    timestamp?: TimestampReceipt | null;
  };
}
export interface AnchorJob {
  id: string;
  status: "PENDING" | "CONFIRMED" | "FAILED";
  payload: AnchorPayload;
  receipt: LocalProof | null;
  /** Present when a Time-Stamp Authority is configured (TSA_URL). */
  timestamp?: TimestampReceipt | null;
  error: string | null;
  attempts: number;
}
/** An RFC 3161 time-stamp token over SHA-256(canonical(anchor payload)), from an external TSA. */
export interface TimestampReceipt {
  kind: "RFC3161";
  tsa: string;
  /** DER TimeStampToken (CMS ContentInfo), base64. */
  token: string;
  digest: string;
  genTime: string;
  serial: string;
  signer: string;
  signerFingerprint: string;
}

export interface ExtractionField {
  path: string;
  value: string | null;
  evidence: { page: number; quote: string; verified?: boolean } | null;
  state: "SUGGESTED" | "NEEDS_REVIEW";
}
export interface ExtractionProposal {
  id: string;
  contractCode: string;
  documentId: string | null;
  documentSha256: string | null;
  draftVersion: number;
  extractor: {
    kind: "TEMPLATE" | "TEXT_RULES" | "GEMINI";
    version: string;
    model?: string;
  };
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
  fields: ExtractionField[];
  warnings: string[];
  confirmedBy: string | null;
  /** Display name of the user who confirmed, so screens never show a user id. */
  confirmedByName?: string | null;
  confirmedAt: string | null;
  confirmedValues?: Record<string, string>;
}

export interface RuleVersion {
  id: string;
  version: number;
  name: string;
  reason: string;
  status: "DRAFT" | "REVIEW" | "PUBLISHED" | "RETIRED";
  createdBy: string;
  submittedBy: string | null;
  reviewedBy: string | null;
  publishedAt: string | null;
  hash: string;
  intact: boolean;
  rules: Record<string, string>[];
  templates: Array<{
    id: string;
    name: string;
    workflowTemplate: string;
    sequence: number;
    milestoneType: string;
    requiredEvents: string;
    paymentPercent: string;
    latePenalty: boolean;
    offsetDays: number;
    /** `APP_` workflows of the version only (docs/NGHIEP_VU.md §6.3). */
    contractType?: string;
    workflowName?: string;
    approval?: string;
  }>;
  validation: {
    compatibilityPolicy?: "BTC_FULL_PACK_V1";
    expected?: number;
    changed?: number;
    matched: number;
    samples: number;
    evaluated: number;
    invariantViolations: number;
    fingerprint: string;
  } | null;
}

export type RuleExpressionField =
  "condition_expression" | "penalty_amount_formula" | "payable_amount_formula";
export interface RuleExpressionValidation {
  valid: boolean;
  checked: number;
  issues: Array<{
    ruleId: string;
    field: RuleExpressionField;
    code: string;
    token: string | null;
    line: number;
    column: number;
  }>;
}
export interface RuleLanguage {
  version: string;
  variables: Array<{
    name: string;
    type: "boolean" | "number" | "date";
    unit: string;
    source: string;
    example: string;
    fields: RuleExpressionField[];
    label: { vi: string; en: string };
    description: { vi: string; en: string };
    /** Where the engine reads the value: a fact it computes, a policy-derived fact or a Data Pack cell. */
    binding: {
      source:
        "fact" | "config" | "derived" | "amount" | "milestone" | "contract";
      key?: string;
      field?: string;
      type?: "boolean" | "integer" | "decimal" | "date";
      default?: string;
      issue?: string;
      group?: string;
    };
  }>;
  operators: string[];
  functions: string[];
  constants: string[];
  fields: RuleExpressionField[];
}
/** Static safety proof of a rule set (apps/engine/codecash_engine/safety.py). */
export interface RuleSafety {
  safe: boolean;
  scopes: number;
  scenarios: number;
  violationCount: number;
  violations: Array<{
    code:
      | "BLOCKED_PAYMENT"
      | "AMOUNT_OUT_OF_RANGE"
      | "PAYMENT_WHILE_HELD"
      | "EVALUATION_ERROR"
      | "NO_FALLBACK";
    scope: string;
    ruleId: string;
    facts?: Record<string, unknown>;
    detail?: string;
  }>;
  unreachable: Array<{ scope: string; ruleId: string }>;
}

export interface RulePreview {
  compatibilityPolicy: "BTC_FULL_PACK_V1";
  evaluated: number;
  expected: number;
  matched: number;
  samples: number;
  invariantViolations: number;
  fingerprint: string;
  changed: number;
  templateChanges: number;
  safety: RuleSafety;
  canSubmit: boolean;
  changes: Array<{
    milestoneId: string;
    before: Record<string, string>;
    after: Record<string, string>;
  }>;
}

/**
 * The milestone library (idea from Contract Smart): every distinct definition of a milestone type
 * (documents, penalty, approval and the rules of its scope) across the Data Pack and the rule
 * versions, numbered in the order it first appeared. A rule version only adds versions; a contract
 * keeps the definition of the version it pinned.
 */
export interface MilestoneLibraryEntry {
  milestoneType: string;
  versions: MilestoneLibraryVersion[];
}

export interface MilestoneLibraryVersion {
  /** 1, 2, … within the milestone type. */
  number: number;
  hash: string;
  requiredEvents: string[];
  latePenalty: boolean;
  approval: "CONTRACT" | "NONE";
  /** The rules of the scope in priority order, as written in the rule language. */
  rules: Record<string, string>[];
  /** Where it first appeared: the Data Pack, or a rule version. */
  firstSeen: {
    ruleVersionId: string | null;
    ruleVersionName: string | null;
    at: string | null;
  };
  /** Every workflow stage with this definition, in the Data Pack and every rule version. */
  usedBy: Array<{
    ruleVersionId: string | null;
    ruleVersionName: string | null;
    status: "DATA_PACK" | "DRAFT" | "REVIEW" | "PUBLISHED" | "RETIRED";
    workflowTemplate: string;
    workflowName: string | null;
    sequence: number;
  }>;
  /** Contracts with a milestone evaluated under this definition. */
  contracts: number;
  /** The earlier version of the type it is closest to (fewest differences), if any. */
  basedOn: number | null;
  /** What differs from that version. */
  changes: Array<"EVIDENCE" | "PENALTY" | "APPROVAL" | "RULES">;
}
