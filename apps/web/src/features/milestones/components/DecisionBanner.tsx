import { useQuery } from "@tanstack/react-query";
import { Space } from "antd";
import {
  AuditOutlined,
  ExclamationCircleOutlined,
  PrinterOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import type { Decision, MilestoneDetail } from "@codecash/contracts";
import { getApprovalView } from "@/shared/api/domain";
import { describeNext, statusRepeatsDecision } from "@/shared/lib/domain";
import { formatDateTime, formatDecimalString } from "@/shared/lib/format";
import { MilestoneStatusTag, OriginTag } from "@/shared/ui/DomainTags";
import { ActionBar } from "@/shared/ui/ActionBar";
import { KeyFigures, SideSection } from "@/shared/ui/SidePanel";
import { TechnicalDetails, TrackingCode } from "@/shared/ui/TechnicalInfo";
import { BlockingPeople } from "./PendingItems";
import styles from "./MilestoneDecision.module.css";

interface DecisionBannerProps {
  data: MilestoneDetail;
  transferring: boolean;
  onTransfer: () => void;
}

const isZero = (amount: string) => /^0(\.0+)?$/.test(amount);

/** Headline colour per decision: amber means held and nothing else. */
const headlineTone: Record<Decision, string | undefined> = {
  HOLD: "warning",
  RELEASE: "success",
  REJECT: "danger",
  PENALTY: undefined,
};

/** Headline of the decision: the decision in words, its reason, the amounts, the next step and the actor's actions. */
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
  const canVote = actions.approve || actions.reject;
  // The engine's dry run of this approver's vote (same query as the approval page), so the held
  // figures are not the only ones on screen when the vote would release the money.
  const approval = useQuery({
    queryKey: ["milestones", "approval", contract.id, milestone.sequence],
    queryFn: () => getApprovalView(contract.id, milestone.sequence),
    enabled: canVote,
  });
  const preview = approval.data?.preview;
  const projected =
    preview && preview.decision !== evaluation.decision ? preview : null;
  // Evidence still missing: voting now is allowed but premature, so it is not the main action.
  const voteIsPrimary =
    milestone.next.kind !== "SUBMIT" && !actions.transfer && !actions.submit;
  return (
    <SideSection>
      <div className={styles.bannerHeadline}>
        <h2
          data-tone={headlineTone[evaluation.decision]}
          data-decision={evaluation.decision}
        >
          {td(`decision.${evaluation.decision}`)}
        </h2>
        {statusRepeatsDecision(milestone.status, evaluation.decision) ? null : (
          <MilestoneStatusTag status={milestone.status} />
        )}
      </div>
      <p className={styles.reason}>{td(`reason.${evaluation.reasonCode}`)}</p>
      <KeyFigures
        items={[
          {
            key: "planned",
            label: t("decisionLite.figures.planned"),
            unit: t("common.millionUnit"),
            value: formatDecimalString(money.plannedMillion),
          },
          {
            key: "penalty",
            label: t("decisionLite.figures.penalty"),
            unit: t("common.millionUnit"),
            value: formatDecimalString(evaluation.penaltyMillion),
            tone: isZero(evaluation.penaltyMillion) ? undefined : "warning",
          },
          {
            key: "payable",
            label: t("decisionLite.figures.payable"),
            unit: t("common.millionUnit"),
            value: formatDecimalString(evaluation.payableMillion),
            tone: isZero(evaluation.payableMillion) ? undefined : "success",
          },
        ]}
      />
      {projected ? (
        <div className={styles.projected} data-testid="decision-projected">
          {t("decision.projected", {
            decision: td(`decision.${projected.decision}`),
            penalty: formatDecimalString(projected.penaltyMillion),
            payable: formatDecimalString(projected.payableMillion),
          })}
        </div>
      ) : null}
      <div className={styles.next}>
        <span>{t("decision.next")}</span>{" "}
        <b>{describeNext(td, milestone.next)}</b>{" "}
        <BlockingPeople items={data.pending} />
      </div>
      <div className={styles.bannerActions}>
        <ActionBar
          testId="decision-actions"
          actions={[
            {
              key: "export",
              label: t("decision.actions.export"),
              icon: <PrinterOutlined />,
              onClick: () => window.print(),
            },
            ...(actions.openDispute && !actions.resolveDispute
              ? [
                  {
                    // Raising a dispute flags a problem, so it is not the main action.
                    key: "openDispute",
                    label: t("decision.actions.openDispute"),
                    icon: <ExclamationCircleOutlined />,
                    onClick: () => navigate(`${base}/dispute`),
                    button: { color: "orange", variant: "outlined" } as const,
                  },
                ]
              : []),
            ...(actions.submit
              ? [
                  {
                    key: "submit",
                    label: t("decision.actions.submit"),
                    pinned: true,
                    button: { type: "primary" } as const,
                    onClick: () =>
                      navigate(
                        `/submissions/${contract.id}/${milestone.sequence}`,
                      ),
                  },
                ]
              : []),
            ...(canVote
              ? [
                  {
                    key: "approve",
                    label: t("decision.actions.approve"),
                    icon: voteIsPrimary ? undefined : <AuditOutlined />,
                    pinned: voteIsPrimary,
                    button: {
                      type: voteIsPrimary ? "primary" : "default",
                    } as const,
                    onClick: () =>
                      navigate(
                        `/approvals/${contract.id}/${milestone.sequence}`,
                      ),
                  },
                ]
              : []),
            ...(actions.resolveDispute
              ? [
                  {
                    key: "resolveDispute",
                    label: t("decision.actions.resolveDispute"),
                    pinned: true,
                    button: { type: "primary" } as const,
                    onClick: () => navigate(`${base}/dispute`),
                  },
                ]
              : []),
            ...(actions.transfer
              ? [
                  {
                    key: "transfer",
                    label: t("decision.actions.transfer"),
                    pinned: true,
                    loading: transferring,
                    button: { color: "green", variant: "solid" } as const,
                    onClick: onTransfer,
                    testId: "transfer-payment",
                  },
                ]
              : []),
          ]}
        />
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
