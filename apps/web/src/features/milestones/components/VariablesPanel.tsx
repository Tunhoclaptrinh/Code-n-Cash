import { Table, Typography } from "antd";
import { useTranslation } from "react-i18next";
import type { MilestoneDetail } from "@codecash/contracts";
import styles from "./MilestoneDecision.module.css";

type Variable = MilestoneDetail["variables"][number];

/** The rule variables the engine evaluated the milestone with: business label first, rule name in grey. */
export function VariablesPanel({ variables }: { variables: Variable[] }) {
  const { t, i18n } = useTranslation("milestones");
  if (!variables.length) return null;
  const label = (row: Variable) =>
    i18n.language.startsWith("vi") ? row.label.vi : row.label.en;
  const value = (row: Variable) =>
    row.value === true
      ? t("decisionLite.trace.variableYes")
      : row.value === false
        ? t("decisionLite.trace.variableNo")
        : (row.value ?? t("decisionLite.trace.variableEmpty"));
  return (
    <section>
      <h3 className={styles.traceHeading}>
        {t("decisionLite.trace.variables")}
      </h3>
      <Table
        size="small"
        rowKey="name"
        pagination={false}
        dataSource={variables}
        showHeader={false}
        scroll={{ x: "max-content" }}
        columns={[
          {
            key: "label",
            render: (_, row) => (
              <span>
                {label(row)}{" "}
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {row.name}
                </Typography.Text>
              </span>
            ),
          },
          { key: "value", render: (_, row) => <b>{value(row)}</b> },
        ]}
      />
    </section>
  );
}
