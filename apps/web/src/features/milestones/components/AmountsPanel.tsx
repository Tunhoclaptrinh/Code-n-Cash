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

/** Drops zeros past the second decimal ("2.22000" → "2.22"); display only, never rounds. */
const trimZeros = (value: string) => value.replace(/(\.\d{2}\d*?)0+$/, "$1");

/** Deadline, completion and lateness behind the amounts; the calculation is folded away. */
export function AmountsPanel({
  money,
  review = null,
}: {
  money: MilestoneDetail["money"];
  /** BR-21: when a buyer document came after the review window, say it counts at the deadline. */
  review?: MilestoneDetail["acceptanceReview"];
}) {
  const { t } = useTranslation("milestones");
  const deemed = review?.documents.find((d) => d.deemed);
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
              ? deemed?.issuedAt
                ? t("decision.amounts.completedDeemed", {
                    completed: formatDateTime(money.completedAt),
                    issued: formatDateTime(deemed.issuedAt),
                  })
                : formatDateTime(money.completedAt)
              : t("decision.amounts.notCompleted"),
          },
          {
            key: "late",
            label: t("decision.amounts.lateDays"),
            value: t("decision.amounts.lateDaysValue", {
              count: money.daysLate,
            }),
          },
          ...(money.latePenalty
            ? [
                {
                  key: "rate",
                  label: t("decision.amounts.rate"),
                  value: t("decision.amounts.rateValue", {
                    rate: formatDecimalString(money.penaltyRatePct),
                  }),
                },
                // The worked formula, so the penalty never has to be inferred from the cap.
                ...(money.daysLate > 0
                  ? [
                      {
                        key: "formula",
                        label: t("decision.amounts.formula"),
                        value: t("decision.amounts.formulaValue", {
                          rate: formatDecimalString(money.penaltyRatePct),
                          count: money.daysLate,
                          planned: formatDecimalString(money.plannedMillion),
                          penalty: formatDecimalString(
                            trimZeros(money.rawPenaltyMillion),
                          ),
                        }),
                      },
                    ]
                  : []),
                {
                  key: "cap",
                  label: t("decision.amounts.cap", {
                    cap: formatDecimalString(money.maxPenaltyPct),
                  }),
                  value: formatDecimalString(money.capMillion),
                },
              ]
            : [
                {
                  key: "rate",
                  label: t("decision.amounts.rate"),
                  value: t("decision.amounts.noPenalty"),
                },
              ]),
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
                      value: formatDecimalString(money.rawPenaltyMillion),
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
