import { Table, Tag, Tooltip, Typography } from "antd";
import { useTranslation } from "react-i18next";
import type { MilestoneDetail, RuleOutcome } from "@codecash/contracts";
import { DecisionTag } from "@/shared/ui/DomainTags";
import { Panel } from "@/shared/ui/Panel";
import { TrackingCode } from "@/shared/ui/TechnicalInfo";
import styles from "./MilestoneDecision.module.css";

const outcomeColor: Record<RuleOutcome, string> = {
  NOT_MATCHED: "default",
  MATCHED: "success",
  NOT_EVALUATED: "default",
};

/** Release rules of the milestone with the one that matched highlighted. */
export function RulesPanel({ data }: { data: MilestoneDetail }) {
  const { t, i18n } = useTranslation("milestones");
  const { t: td } = useTranslation("domain");
  return (
    <Panel className={styles.panel}>
      <h2>
        {t("decision.rules.title", { scope: data.milestone.releaseRuleCode })}
      </h2>
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
                <span>
                  {i18n.language.startsWith("vi") ? r.description : r.name}
                </span>
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
    </Panel>
  );
}
