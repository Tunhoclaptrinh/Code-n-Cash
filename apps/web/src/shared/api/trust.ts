import type {
  AnchorJob,
  AnchorPayload,
  ExtractionProposal,
  LocalProof,
  RuleVersion,
  RuleLanguage,
  RuleExpressionValidation,
  RulePreview,
} from "@codecash/contracts";
import { platform } from "./platform";

async function write<T>(path: string, body: unknown, method = "POST") {
  const result = await platform.request<T>(`/trust${path}`, {
    method,
    body: JSON.stringify(body),
  });
  window.dispatchEvent(new Event("codecash:workflow-changed"));
  return result;
}
export const trustApi = {
  status: () =>
    platform.get<{
      provider: string;
      witnessKeyFingerprint: string;
      /** RFC 3161 Time-Stamp Authority, when configured (TSA_URL). */
      timestampAuthority: string | null;
    }>("/trust/status"),
  anchors: () => platform.get<AnchorJob[]>("/trust/anchors"),
  requestAnchor: (idempotencyKey: string) =>
    write<AnchorJob>("/anchors", { idempotencyKey }),
  retryAnchor: (id: string) => write<AnchorJob>(`/anchors/${id}/retry`, {}),
  bundle: (id: string) =>
    platform.get<{ payload: AnchorPayload; receipt: LocalProof }>(
      `/trust/anchors/${id}/bundle`,
    ),
  verifyAnchor: (bundle: unknown) =>
    platform.post<{
      result: string;
      cryptoValid: boolean;
      witnessMatched: boolean;
      chainMatched: boolean;
      systemMatched: boolean;
      snapshotMatched: boolean;
      timestamp: {
        valid: boolean;
        trusted: boolean;
        genTime: string | null;
        signer: string | null;
        tsa: string;
      } | null;
    }>("/trust/anchors/verify", bundle),
  extraction: (code: string) =>
    platform.get<ExtractionProposal | null>(
      `/trust/contracts/${code}/extraction`,
    ),
  extract: (code: string) =>
    write<ExtractionProposal>(`/contracts/${code}/extraction`, {}),
  confirmExtraction: (
    code: string,
    id: string,
    values: Record<string, string>,
  ) =>
    write<ExtractionProposal>(`/contracts/${code}/extraction/${id}/confirm`, {
      values,
    }),
  signatureBundle: (code: string) =>
    platform.get(`/trust/contracts/${code}/signatures`),
  ruleLanguage: () => platform.get<RuleLanguage>("/trust/rules/language"),
  validateRuleExpressions: (rules: RuleVersion["rules"]) =>
    platform.post<RuleExpressionValidation>("/trust/rules/validate", { rules }),
  previewRuleVersion: (
    version: RuleVersion,
    rules: RuleVersion["rules"],
    templates: RuleVersion["templates"],
  ) =>
    platform.post<RulePreview>(`/trust/rules/${version.id}/preview`, {
      version: version.version,
      rules,
      templates,
    }),
  rules: () => platform.get<RuleVersion[]>("/trust/rules"),
  createRuleVersion: (values: { name: string; reason: string }) =>
    write<RuleVersion>("/rules", values),
  saveRuleVersion: (
    version: RuleVersion,
    rules: RuleVersion["rules"],
    templates: RuleVersion["templates"],
  ) =>
    write<RuleVersion>(
      `/rules/${version.id}`,
      { version: version.version, rules, templates },
      "PATCH",
    ),
  submitRuleVersion: (version: RuleVersion) =>
    write<RuleVersion>(`/rules/${version.id}/submit`, {
      version: version.version,
    }),
  publishRuleVersion: (version: RuleVersion) =>
    write<RuleVersion>(`/rules/${version.id}/publish`, {
      version: version.version,
    }),
};
