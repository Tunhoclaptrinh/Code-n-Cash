import { Collapse } from "antd";
import { useTranslation } from "react-i18next";
import type { MilestoneDetail } from "@codecash/contracts";
import {
  formatDate,
  formatDateTime,
  formatDecimalString,
} from "@/shared/lib/format";
import { InfoGrid, SideSection } from "@/shared/ui/SidePanel";
import styles from "./MilestoneDecision.module.css";

/** Deadline, completion and lateness behind the amounts; the calculation is folded away. */
export function AmountsPanel({ money }: { money: MilestoneDetail["money"] }) {
  const { t } = useTranslation("milestones");
  return (
    <SideSection title={t("decisionLite.amounts.title")}>
      <InfoGrid
        items={[
          {
            key: "due",
            label: t("decision.amounts.deadline"),
            value: money.dueDate
              ? t("decision.amounts.deadlineValue", {
                  due: formatDate(money.dueDate),
                  grace: money.graceDays,
                  deadline: formatDate(money.deadline),
                })
              : t("decision.amounts.noDue"),
          },
          {
            key: "completed",
            label: t("decision.amounts.completed"),
            value: money.completedAt
              ? formatDateTime(money.completedAt)
              : t("decision.amounts.notCompleted"),
          },
          {
            key: "late",
            label: t("decision.amounts.lateDays"),
            value: t("decision.amounts.lateDaysValue", {
              count: money.daysLate,
            }),
          },
          {
            key: "rate",
            label: t("decision.amounts.rate"),
            value: money.latePenalty
              ? t("decision.amounts.rateValue", {
                  rate: money.penaltyRatePct,
                  cap: money.maxPenaltyPct,
                  capAmount: formatDecimalString(money.capMillion),
                })
              : t("decision.amounts.noPenalty"),
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
                <InfoGrid
                  items={[
                    {
                      key: "raw",
                      label: t("decision.amounts.raw"),
                      value: money.rawPenaltyMillion,
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
    </SideSection>
  );
}
