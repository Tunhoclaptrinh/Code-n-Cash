import { Collapse, Descriptions } from "antd";
import { useTranslation } from "react-i18next";
import type { MilestoneDetail } from "@codecash/contracts";
import {
  formatDate,
  formatDateTime,
  formatDecimalString,
} from "@/shared/lib/format";
import { Panel } from "@/shared/ui/Panel";
import styles from "./MilestoneDecision.module.css";

/** Milestone value, deadline and the resulting penalty/payable amounts; the calculation is folded away. */
export function AmountsPanel({ money }: { money: MilestoneDetail["money"] }) {
  const { t } = useTranslation("milestones");
  return (
    <Panel className={styles.panel}>
      <h2>{t("decision.amounts.title")}</h2>
      <Descriptions
        size="small"
        column={1}
        items={[
          {
            key: "planned",
            label: t("decisionLite.amounts.milestoneValue"),
            children: formatDecimalString(money.plannedMillion),
          },
          {
            key: "due",
            label: t("decision.amounts.deadline"),
            children: money.dueDate
              ? t("decision.amounts.deadlineValue", {
                  due: formatDate(money.dueDate),
                  grace: money.graceDays,
                  deadline: formatDate(money.deadline),
                })
              : t("decision.amounts.noDue"),
          },
          {
            key: "penalty",
            label: t("decisionLite.amounts.penalty"),
            children: <b>{formatDecimalString(money.penaltyMillion)}</b>,
          },
          {
            key: "payable",
            label: t("decision.amounts.payable"),
            children: <b>{formatDecimalString(money.payableMillion)}</b>,
          },
        ]}
      />
      <Collapse
        ghost
        size="small"
        className={styles.more}
        items={[
          {
            key: "how",
            label: t("decisionLite.amounts.how"),
            children: (
              <>
                <Descriptions
                  size="small"
                  column={1}
                  items={[
                    {
                      key: "completed",
                      label: t("decision.amounts.completed"),
                      children: money.completedAt
                        ? formatDateTime(money.completedAt)
                        : t("decision.amounts.notCompleted"),
                    },
                    {
                      key: "late",
                      label: t("decision.amounts.lateDays"),
                      children: t("decision.amounts.lateDaysValue", {
                        count: money.daysLate,
                      }),
                    },
                    {
                      key: "rate",
                      label: t("decision.amounts.rate"),
                      children: money.latePenalty
                        ? t("decision.amounts.rateValue", {
                            rate: money.penaltyRatePct,
                            cap: money.maxPenaltyPct,
                            capAmount: formatDecimalString(money.capMillion),
                          })
                        : t("decision.amounts.noPenalty"),
                    },
                    {
                      key: "raw",
                      label: t("decision.amounts.raw"),
                      children: money.rawPenaltyMillion,
                    },
                  ]}
                />
                <div className={styles.panelNote}>
                  {t("decision.amounts.note")}
                </div>
              </>
            ),
          },
        ]}
      />
    </Panel>
  );
}
