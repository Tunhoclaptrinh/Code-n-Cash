import { Collapse, Descriptions, Space } from "antd";
import { CheckCircleFilled, CloseCircleFilled } from "@ant-design/icons";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import type { MilestoneDetail } from "@codecash/contracts";
import { Panel } from "@/shared/ui/Panel";
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
    <Panel className={styles.panel}>
      <h2>{t("decision.conditions.title")}</h2>
      <Space direction="vertical" size={6} style={{ width: "100%" }}>
        {evaluation.conditionsMet.map((token) => (
          <span key={token}>
            <CheckCircleFilled
              style={{ color: "var(--color-success-strong)" }}
            />{" "}
            {tokenText(t, token)}
          </span>
        ))}
        {evaluation.missingConditions.map((token) => (
          <span key={token}>
            <CloseCircleFilled
              style={{ color: "var(--color-danger-strong)" }}
            />{" "}
            {tokenText(t, token)}
          </span>
        ))}
      </Space>
      <Collapse
        ghost
        size="small"
        className={styles.more}
        items={[
          {
            key: "facts",
            label: t("decisionLite.more"),
            children: (
              <Descriptions
                size="small"
                column={1}
                items={[
                  {
                    key: "events",
                    label: t("decision.facts.requiredEvents"),
                    children: `${milestone.requirements.filter((r) => r.state === "VALID").length}/${milestone.requirements.length}`,
                  },
                  {
                    key: "missing",
                    label: t("decision.facts.missing"),
                    children:
                      evaluation.missing
                        .map((type) => td(`eventType.${type}`))
                        .join(", ") || "—",
                  },
                  {
                    key: "unauthorized",
                    label: t("decisionLite.facts.unauthorized"),
                    children: evaluation.unauthorized.join(", ") || "0",
                  },
                  {
                    key: "duplicates",
                    label: t("decision.facts.duplicates"),
                    children:
                      evaluation.duplicates
                        .map(([dup, of]) => `${dup} → ${of}`)
                        .join(", ") || "0",
                  },
                  {
                    key: "dispute",
                    label: t("decision.facts.openDispute"),
                    children:
                      evaluation.openDisputeIds.join(", ") ||
                      t("decision.facts.none"),
                  },
                  {
                    key: "rejections",
                    label: t("decision.facts.rejections"),
                    children: evaluation.validRejectionCount,
                  },
                  {
                    key: "approvals",
                    label: t("decision.facts.approvals"),
                    children: evaluation.approvalRequired
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
                    children: evaluation.voided.join(", ") || "0",
                  },
                ]}
              />
            ),
          },
        ]}
      />
    </Panel>
  );
}
