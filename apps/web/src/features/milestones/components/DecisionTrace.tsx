import { Collapse, Space } from "antd";
import { useTranslation } from "react-i18next";
import type { MilestoneDetail } from "@codecash/contracts";
import { useCurrentUser } from "@/shared/auth/session";
import { Panel } from "@/shared/ui/Panel";
import { DecisionEventTable } from "./DecisionEventTable";
import { ExceptionPanel } from "./ExceptionPanel";
import { HistoryPanel } from "./HistoryPanel";
import { ReplayPanel } from "./ReplayPanel";
import styles from "./MilestoneDecision.module.css";

interface DecisionTraceProps {
  data: MilestoneDetail;
  onChanged: () => Promise<unknown>;
}

/** Events, engine replay, status history and exceptions, folded away unless the controller has work here. */
export function DecisionTrace({ data, onChanged }: DecisionTraceProps) {
  const { t } = useTranslation("milestones");
  const user = useCurrentUser();
  const { contract, milestone, evaluation } = data;
  // A controller with something to act on (a proposal to decide, an unauthorised record) gets the trace open.
  const traceOpen =
    user.role === "ADMIN_AUDITOR" &&
    (data.exceptions.some((x) => x.status === "PROPOSED") ||
      (data.actions.proposeException &&
        data.events.some((e) => e.classification === "UNAUTHORIZED")));
  return (
    <Panel as="div" className={styles.trace}>
      <Collapse
        ghost
        data-testid="trace-details"
        defaultActiveKey={traceOpen ? ["trace"] : []}
        items={[
          {
            key: "trace",
            label: <b>{t("decisionLite.trace.title")}</b>,
            children: (
              <Space direction="vertical" size={24} style={{ width: "100%" }}>
                <section>
                  <h3 className={styles.traceHeading}>
                    {t("decisionLite.trace.events", {
                      total: data.events.length,
                    })}
                  </h3>
                  <DecisionEventTable
                    events={data.events}
                    evidence={evaluation.evidence}
                  />
                </section>
                <ReplayPanel
                  contractId={contract.id}
                  sequence={milestone.sequence}
                />
                <HistoryPanel history={data.history} />
                <ExceptionPanel data={data} onChanged={onChanged} />
              </Space>
            ),
          },
        ]}
      />
    </Panel>
  );
}
