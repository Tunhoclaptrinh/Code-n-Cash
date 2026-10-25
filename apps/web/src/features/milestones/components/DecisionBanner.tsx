import { Button, Space, Typography } from "antd";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import type { MilestoneDetail } from "@codecash/contracts";
import { describeNext } from "@/shared/lib/domain";
import { formatDateTime, formatDecimalString } from "@/shared/lib/format";
import {
  DecisionTag,
  MilestoneStatusTag,
  OriginTag,
} from "@/shared/ui/DomainTags";
import { Panel } from "@/shared/ui/Panel";
import { TechnicalDetails, TrackingCode } from "@/shared/ui/TechnicalInfo";
import styles from "./MilestoneDecision.module.css";

interface DecisionBannerProps {
  data: MilestoneDetail;
  transferring: boolean;
  onTransfer: () => void;
}

/** Headline of the decision: reason, status, next step and the actions the actor may take. */
export function DecisionBanner({
  data,
  transferring,
  onTransfer,
}: DecisionBannerProps) {
  const { t } = useTranslation("milestones");
  const { t: td } = useTranslation("domain");
  const { t: tc } = useTranslation("common");
  const navigate = useNavigate();
  const { contract, milestone, evaluation, actions } = data;
  const base = `/contracts/${contract.id}/milestones/${milestone.sequence}`;
  return (
    <Panel as="div" className={styles.banner}>
      <div className={styles.bannerText}>
        <div className={styles.bannerHeadline}>
          <h2>{td(`reason.${evaluation.reasonCode}`)}</h2>
          <DecisionTag decision={evaluation.decision} />
          <MilestoneStatusTag status={milestone.status} />
        </div>
        <Space size={12} wrap>
          <TrackingCode code={milestone.id} />
          <TrackingCode code={evaluation.reasonCode} />
        </Space>
        <div className={styles.bannerSummary}>
          {t("decisionLite.summaryLine", {
            rule: evaluation.ruleId,
            payable: formatDecimalString(evaluation.payableMillion),
            penalty: formatDecimalString(evaluation.penaltyMillion),
          })}
        </div>
        <Typography.Text>
          {t("decision.next")} <b>{describeNext(td, milestone.next)}</b>
        </Typography.Text>
        <TechnicalDetails
          items={[
            {
              key: "run",
              label: tc("technical.run"),
              value: t("decision.runLine", {
                run: evaluation.runId,
                at: formatDateTime(evaluation.evaluatedAt),
                spec: evaluation.specVersion,
                confidence: evaluation.confidence,
              }),
            },
            {
              key: "source",
              label: tc("technical.source"),
              value: <OriginTag origin={milestone.origin} />,
            },
          ]}
        />
      </div>
      <div className={styles.bannerActions}>
        <Space wrap>
          {actions.submit ? (
            <Button
              type="primary"
              onClick={() =>
                navigate(`/submissions/${contract.id}/${milestone.sequence}`)
              }
            >
              {t("decision.actions.submit")}
            </Button>
          ) : null}
          {actions.approve || actions.reject ? (
            <Button
              type="primary"
              onClick={() =>
                navigate(`/approvals/${contract.id}/${milestone.sequence}`)
              }
            >
              {t("decision.actions.approve")}
            </Button>
          ) : null}
          {actions.resolveDispute || actions.openDispute ? (
            <Button
              // Both open the dispute screen: handling one is the next step, raising one flags a problem.
              {...(actions.resolveDispute
                ? { type: "primary" as const }
                : {
                    color: "orange" as const,
                    variant: "outlined" as const,
                  })}
              onClick={() => navigate(`${base}/dispute`)}
            >
              {actions.resolveDispute
                ? t("decision.actions.resolveDispute")
                : t("decision.actions.openDispute")}
            </Button>
          ) : null}
          {actions.transfer ? (
            <Button
              color="green"
              variant="solid"
              loading={transferring}
              onClick={onTransfer}
              data-testid="transfer-payment"
            >
              {t("decision.actions.transfer")}
            </Button>
          ) : null}
          <Button onClick={() => window.print()}>
            {t("decision.actions.export")}
          </Button>
        </Space>
      </div>
    </Panel>
  );
}
