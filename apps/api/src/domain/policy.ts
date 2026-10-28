import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { repoRoot } from "../common/paths";

/**
 * The engine policy pack (apps/engine/policy/case4_btc.json, docs/NGHIEP_VU.md section 6.1) is the one place
 * that says which event types exist, which side creates each business event, which status is valid, which
 * status each reason maps to and which decisions pay. The engine decides with it; the API reads the same file
 * so a user can only record the events of their own side and engine output is checked against it.
 */
export interface EnginePolicy {
  format: string;
  policy_id: string;
  version: string;
  sides: Record<string, { party_type: string; contract_field: string }>;
  event_types: Record<
    string,
    {
      category:
        | "EVIDENCE"
        | "APPROVAL"
        | "REJECTION"
        | "DISPUTE_OPEN"
        | "DISPUTE_RESOLVE";
      side?: string;
      valid_status: string;
    }
  >;
  statuses: string[];
  decisions: Record<string, { pays: boolean }>;
  reasons: Record<string, { status: string }>;
}

export const POLICY_FILE = "apps/engine/policy/case4_btc.json";

const policyText = readFileSync(resolve(repoRoot(), POLICY_FILE), "utf8");

export const enginePolicy: EnginePolicy = JSON.parse(policyText);

/** SHA-256 of the policy pack file, the same digest the engine records with every run. */
export const policySha256 = createHash("sha256")
  .update(policyText)
  .digest("hex");

/** Business (evidence) event type -> the party type of the contract side that may create it. */
export const evidenceSides = (policy: EnginePolicy = enginePolicy) =>
  Object.fromEntries(
    Object.entries(policy.event_types)
      .filter(([, kind]) => kind.category === "EVIDENCE" && kind.side)
      .map(([name, kind]) => [name, policy.sides[kind.side!].party_type]),
  );

export const paysOut = (decision: string, policy = enginePolicy) =>
  policy.decisions[decision]?.pays === true;

/** Labels of the rule variables (apps/engine/rule_language.json), shown next to their values in the trace. */
export const variableLabels: Map<string, { vi: string; en: string }> = new Map(
  (
    JSON.parse(
      readFileSync(
        resolve(repoRoot(), "apps/engine/rule_language.json"),
        "utf8",
      ),
    ).variables as Array<{ name: string; label: { vi: string; en: string } }>
  ).map((variable) => [variable.name, variable.label]),
);
