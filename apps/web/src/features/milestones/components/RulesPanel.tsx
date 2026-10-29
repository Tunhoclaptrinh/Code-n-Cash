import { useState } from "react";
import { Alert, Button, Table, Tag, Tooltip, Typography } from "antd";
import { useTranslation } from "react-i18next";
import type { MilestoneDetail, RuleOutcome } from "@codecash/contracts";
import { DecisionTag } from "@/shared/ui/DomainTags";
import { SideSection } from "@/shared/ui/SidePanel";
import { TrackingCode } from "@/shared/ui/TechnicalInfo";
import styles from "./MilestoneDecision.module.css";

export const outcomeColor: Record<RuleOutcome, string> = {
  NOT_MATCHED: "default",
  MATCHED: "success",
  OVERRIDDEN: "warning",
  NOT_EVALUATED: "default",
  SET_ASIDE: "warning",
  FAILED: "error",
};

/** The rule that decided the milestone, with the full rule table behind a toggle. */
export function RulesPanel({ data }: { data: MilestoneDetail }) {
  const { t, i18n } = useTranslation("milestones");
  const { t: td } = useTranslation("domain");
  const [allRules, setAllRules] = useState(false);
  const matchedRule = data.rules.find((rule) => rule.outcome === "MATCHED");
  // A fallback selection means a safety check held the milestone although a rule matched or failed.
  const selection = data.evaluation.selection;
  const heldBySafety = selection && selection !== "FIRST_MATCH";
  const ruleSentence = (rule: MilestoneDetail["rules"][number]) =>
    td(`ruleCondition.${rule.reasonCode}`, {
      defaultValue: i18n.language.startsWith("vi")
        ? rule.description
        : rule.name,
    });
  return (
    <SideSection
      title={t("decisionLite.rules.title")}
      extra={
        matchedRule ? (
          <Button
            type="link"
            size="small"
            className={styles.ruleToggle}
            aria-expanded={allRules}
            onClick={() => setAllRules((open) => !open)}
          >
            {allRules
              ? t("decisionLite.rules.hideAll")
              : t("decisionLite.rules.showAll", { count: data.rules.length })}
          </Button>
        ) : null
      }
    >
      {matchedRule ? (
        <p className={styles.matchedRule}>{ruleSentence(matchedRule)}</p>
      ) : null}
      {heldBySafety ? (
        <Alert
          type="warning"
          showIcon
          className={styles.selectionNote}
          message={t(`decisionLite.rules.selection.${selection}`)}
        />
      ) : null}
      {allRules || !matchedRule ? (
        <div className={styles.ruleTable}>
          <Table
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={data.rules}
            scroll={{ x: "max-content" }}
            rowClassName={(rule) =>
              rule.outcome === "MATCHED" ? "codecash-row-selected" : ""
            }
            columns={[
              {
                key: "priority",
                title: t("decision.rules.priority"),
                render: (_, r) => <b>{r.priority}</b>,
              },
              {
                key: "id",
                title: t("decision.rules.rule"),
                render: (_, r) => <TrackingCode code={r.id} />,
              },
              {
                key: "condition",
                title: t("decision.rules.condition"),
                // Business wording first; the Data Pack expression stays in the tooltip.
                render: (_, r) => (
                  <Tooltip
                    title={
                      <Typography.Text code style={{ color: "inherit" }}>
                        {r.condition}
                      </Typography.Text>
                    }
                  >
                    <span>{ruleSentence(r)}</span>
                  </Tooltip>
                ),
              },
              {
                key: "decision",
                title: t("decision.rules.decision"),
                render: (_, r) => <DecisionTag decision={r.decision} />,
              },
              {
                key: "reason",
                title: t("decision.rules.reason"),
                render: (_, r) => td(`reason.${r.reasonCode}`),
              },
              {
                key: "formula",
                title: t("decision.rules.formula"),
                render: (_, r) => (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {r.payableFormula} / {r.penaltyFormula}
                  </Typography.Text>
                ),
              },
              {
                key: "outcome",
                title: t("decision.rules.outcome"),
                render: (_, r) => (
                  <Tag color={outcomeColor[r.outcome]}>
                    {td(`ruleOutcome.${r.outcome}`)}
                  </Tag>
                ),
              },
            ]}
          />
        </div>
      ) : null}
    </SideSection>
  );
}
