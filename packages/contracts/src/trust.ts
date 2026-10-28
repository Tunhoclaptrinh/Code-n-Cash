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
  anchor: { id: string; payload: AnchorPayload; receipt: LocalProof | null };
}
export interface AnchorJob {
  id: string;
  status: "PENDING" | "CONFIRMED" | "FAILED";
  payload: AnchorPayload;
  receipt: LocalProof | null;
  error: string | null;
  attempts: number;
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
