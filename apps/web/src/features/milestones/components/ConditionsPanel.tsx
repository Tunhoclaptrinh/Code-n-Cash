import { Collapse } from "antd";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import type { MilestoneDetail } from "@codecash/contracts";
import { CheckList, InfoGrid, SideSection } from "@/shared/ui/SidePanel";
import styles from "./MilestoneDecision.module.css";

/** `EVENT:INVOICE` → "Hoá đơn", `APPROVAL_QUORUM:2` → "Đủ 2 vai trò phê duyệt". */
function tokenText(t: TFunction, token: string) {
  const [kind, arg] = token.split(":");
  if (kind === "EVENT") return t("domain:eventType." + arg);
  if (kind === "APPROVAL_QUORUM")
    return t("milestones:decision.tokens.quorum", { count: Number(arg) });
  return t(`milestones:decision.tokens.${kind}`, { defaultValue: token });
}

/** Conditions met/missing and the facts the rule evaluated. */
export function ConditionsPanel({ data }: { data: MilestoneDetail }) {
  const { t } = useTranslation("milestones");
  const { t: td } = useTranslation("domain");
  const { milestone, evaluation } = data;
  return (
    <SideSection title={t("decision.conditions.title")}>
      <CheckList
        labels={{
          ok: t("decisionLite.conditionMet"),
          missing: t("decisionLite.conditionMissing"),
        }}
        items={[
          ...evaluation.conditionsMet.map((token) => ({
            key: token,
            ok: true,
            text: tokenText(t, token),
          })),
          ...evaluation.missingConditions.map((token) => ({
            key: token,
            ok: false,
            text: tokenText(t, token),
          })),
        ]}
      />
      <Collapse
        ghost
        size="small"
        className={styles.more}
        items={[
          {
            key: "facts",
            label: t("decisionLite.more"),
            children: (
              <InfoGrid
                items={[
                  {
                    key: "events",
                    label: t("decision.facts.requiredEvents"),
                    value: `${milestone.requirements.filter((r) => r.state === "VALID").length}/${milestone.requirements.length}`,
                  },
                  {
                    key: "missing",
                    label: t("decision.facts.missing"),
                    value:
                      evaluation.missing
                        .map((type) => td(`eventType.${type}`))
                        .join(", ") || "—",
                  },
                  {
                    key: "unauthorized",
                    label: t("decisionLite.facts.unauthorized"),
                    value: evaluation.unauthorized.join(", ") || "0",
                  },
                  {
                    key: "duplicates",
                    label: t("decision.facts.duplicates"),
                    value:
                      evaluation.duplicates
                        .map(([dup, of]) => `${dup} → ${of}`)
                        .join(", ") || "0",
                  },
                  {
                    key: "dispute",
                    label: t("decision.facts.openDispute"),
                    value:
                      evaluation.openDisputeIds.join(", ") ||
                      t("decision.facts.none"),
                  },
                  {
                    key: "rejections",
                    label: t("decision.facts.rejections"),
                    value: evaluation.validRejectionCount,
                  },
                  {
                    key: "approvals",
                    label: t("decision.facts.approvals"),
                    value: evaluation.approvalRequired
                      ? t("decision.facts.approvalValue", {
                          done: evaluation.validApprovalCount,
                          quorum: evaluation.quorum,
                          roles: milestone.approvalRoles
                            .map((role) => td(`approvalRole.${role}`))
                            .join(", "),
                        })
                      : t("decision.facts.noApproval"),
                  },
                  {
                    key: "voided",
                    label: t("decisionLite.facts.voided"),
                    value: evaluation.voided.join(", ") || "0",
                  },
                ]}
              />
            ),
          },
        ]}
      />
    </SideSection>
  );
}
