import { Timeline, Typography } from "antd";
import { useTranslation } from "react-i18next";
import type { MilestoneDetail } from "@codecash/contracts";
import { formatDateTime } from "@/shared/lib/format";
import { Panel } from "@/shared/ui/Panel";
import styles from "./MilestoneDecision.module.css";

/** Status changes of the milestone, newest first. */
export function HistoryPanel({
  history,
}: {
  history: MilestoneDetail["history"];
}) {
  const { t } = useTranslation("milestones");
  const { t: td } = useTranslation("domain");
  return (
    <Panel className={styles.panel}>
      <h2>{t("decision.history.title")}</h2>
      <Timeline
        items={[...history].reverse().map((change) => ({
          key: change.id,
          color:
            change.to.decision === "REJECT"
              ? "red"
              : change.to.decision === "HOLD"
                ? "orange"
                : "green",
          children: (
            <>
              <Typography.Text type="secondary">
                {formatDateTime(change.at)}
              </Typography.Text>
              <div>
                {change.from ? `${td(`status.${change.from.status}`)} → ` : ""}
                <b>{td(`status.${change.to.status}`)}</b> ·{" "}
                {td(`reason.${change.to.reasonCode}`)}
              </div>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {td(`trigger.${change.trigger.kind}`)}
                {"actorName" in change.trigger
                  ? ` · ${change.trigger.actorName}`
                  : ""}
                {change.trigger.kind === "EVENTS"
                  ? ` · ${change.trigger.eventIds.join(", ")}`
                  : ""}
              </Typography.Text>
            </>
          ),
        }))}
      />
      <div className={styles.panelNote}>{t("decision.history.note")}</div>
    </Panel>
  );
}
