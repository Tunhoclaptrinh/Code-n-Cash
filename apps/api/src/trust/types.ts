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
  evidence: { page: number; quote: string } | null;
  state: "SUGGESTED" | "NEEDS_REVIEW";
}
export interface ExtractionProposal {
  id: string;
  contractCode: string;
  documentId: string | null;
  documentSha256: string | null;
  draftVersion: number;
  extractor: { kind: "TEMPLATE" | "TEXT_RULES"; version: string };
  fields: ExtractionField[];
  warnings: string[];
  confirmedBy: string | null;
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
    matched: number;
    samples: number;
    evaluated: number;
    invariantViolations: number;
    fingerprint: string;
    compatibilityPolicy?: "BTC_FULL_PACK_V1";
    expected?: number;
    changed?: number;
  } | null;
}

export interface RulePreview {
  compatibilityPolicy: "BTC_FULL_PACK_V1";
  expected: number;
  fingerprint: string;
  evaluated: number;
  matched: number;
  samples: number;
  invariantViolations: number;
  canSubmit: boolean;
  changed: number;
  templateChanges: number;
  mismatches: string[];
  changes: Array<{
    milestoneId: string;
    before: {
      decision: string;
      payableMillion: string;
      penaltyMillion: string;
      reasonCode: string;
    } | null;
    after: {
      decision: string;
      payableMillion: string;
      penaltyMillion: string;
      reasonCode: string;
    } | null;
  }>;
}

export type RuleExpressionField =
  "condition_expression" | "penalty_amount_formula" | "payable_amount_formula";
export interface RuleExpressionIssue {
  ruleId: string;
  field: RuleExpressionField;
  code: string;
  token: string | null;
  line: number;
  column: number;
}
export interface RuleExpressionValidation {
  valid: boolean;
  checked: number;
  issues: RuleExpressionIssue[];
}
export interface RuleLanguage {
  version: string;
  constants: string[];
  functions: string[];
  operators: string[];
  fields: RuleExpressionField[];
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
}
