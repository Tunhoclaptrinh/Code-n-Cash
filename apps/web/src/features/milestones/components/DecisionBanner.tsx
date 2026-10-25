import { Button, Space } from "antd";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import type { MilestoneDetail } from "@codecash/contracts";
import { describeNext, statusRepeatsDecision } from "@/shared/lib/domain";
import { formatDateTime, formatDecimalString } from "@/shared/lib/format";
import {
  DecisionTag,
  MilestoneStatusTag,
  OriginTag,
} from "@/shared/ui/DomainTags";
import { KeyFigures, SideSection } from "@/shared/ui/SidePanel";
import { TechnicalDetails, TrackingCode } from "@/shared/ui/TechnicalInfo";
import styles from "./MilestoneDecision.module.css";

interface DecisionBannerProps {
  data: MilestoneDetail;
  transferring: boolean;
  onTransfer: () => void;
}

const isZero = (amount: string) => /^0(\.0+)?$/.test(amount);

/** Headline of the decision: reason, the amounts it turns on, the next step and the actor's actions. */
export function DecisionBanner({
  data,
  transferring,
  onTransfer,
}: DecisionBannerProps) {
  const { t } = useTranslation("milestones");
  const { t: td } = useTranslation("domain");
  const navigate = useNavigate();
  const { contract, milestone, evaluation, actions, money } = data;
  const base = `/contracts/${contract.id}/milestones/${milestone.sequence}`;
  return (
    <SideSection>
      <div className={styles.bannerHeadline}>
        <h2>{td(`reason.${evaluation.reasonCode}`)}</h2>
        <DecisionTag decision={evaluation.decision} />
        {statusRepeatsDecision(milestone.status, evaluation.decision) ? null : (
          <MilestoneStatusTag status={milestone.status} />
        )}
      </div>
      <KeyFigures
        items={[
          {
            key: "planned",
            label: t("decisionLite.figures.planned"),
            value: formatDecimalString(money.plannedMillion),
          },
          {
            key: "penalty",
            label: t("decisionLite.figures.penalty"),
            value: formatDecimalString(evaluation.penaltyMillion),
            tone: isZero(evaluation.penaltyMillion) ? undefined : "warning",
          },
          {
            key: "payable",
            label: t("decisionLite.figures.payable"),
            value: formatDecimalString(evaluation.payableMillion),
            tone: isZero(evaluation.payableMillion) ? undefined : "success",
          },
        ]}
      />
      <div className={styles.next}>
        <span>{t("decision.next")}</span>{" "}
        <b>{describeNext(td, milestone.next)}</b>
      </div>
      <div className={styles.bannerActions}>
        <Button onClick={() => window.print()}>
          {t("decision.actions.export")}
        </Button>
        {actions.openDispute && !actions.resolveDispute ? (
          // Raising a dispute flags a problem, so it is not the main action.
          <Button
            color="orange"
            variant="outlined"
            onClick={() => navigate(`${base}/dispute`)}
          >
            {t("decision.actions.openDispute")}
          </Button>
        ) : null}
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
        {actions.resolveDispute ? (
          <Button type="primary" onClick={() => navigate(`${base}/dispute`)}>
            {t("decision.actions.resolveDispute")}
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
      </div>
    </SideSection>
  );
}

/** Graded codes, engine run and record source, folded at the bottom of the decision card. */
export function DecisionTechnical({ data }: { data: MilestoneDetail }) {
  const { t } = useTranslation("milestones");
  const { t: tc } = useTranslation("common");
  const { milestone, evaluation } = data;
  return (
    <SideSection>
      <TechnicalDetails
        items={[
          {
            key: "codes",
            label: tc("technical.codes"),
            value: (
              <Space size={8} wrap>
                <TrackingCode code={milestone.id} />
                <TrackingCode code={evaluation.reasonCode} />
                <TrackingCode code={evaluation.ruleId} />
              </Space>
            ),
          },
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
    </SideSection>
  );
}
