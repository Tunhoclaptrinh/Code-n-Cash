import { Popover } from "antd";
import {
  CheckCircleFilled,
  ClockCircleOutlined,
  ExclamationCircleFilled,
  MinusCircleOutlined,
} from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import type { MilestoneDetail, PendingItem } from "@codecash/contracts";
import { getMilestoneDetail } from "@/shared/api/domain";
import { PendingCard } from "./PendingItems";
import styles from "./MilestoneJourney.module.css";

export type JourneyStage =
  "evidence" | "approval" | "dispute" | "decision" | "payment";

type StageState = "done" | "blocking" | "waiting" | "none";

interface Stage {
  key: JourneyStage;
  href: string;
  state: StageState;
  status: string;
  items: PendingItem[];
}

const KINDS: Record<JourneyStage, PendingItem["kind"][]> = {
  evidence: ["EVIDENCE", "UNAUTHORIZED"],
  approval: ["APPROVAL"],
  dispute: ["DISPUTE"],
  decision: ["REJECTION", "DATA_ISSUE"],
  payment: ["PAYMENT"],
};

function stateOf(items: PendingItem[]): StageState {
  if (!items.length) return "none";
  if (items.some((i) => i.state === "BLOCKING")) return "blocking";
  if (items.some((i) => i.state === "WAITING")) return "waiting";
  return "done";
}

/** The stages of one milestone, in the order the work happens, from the API's pending items. */
function stagesOf(data: MilestoneDetail, t: TFunction, td: TFunction): Stage[] {
  const { contract, milestone, evaluation, pending } = data;
  const base = `/contracts/${contract.id}/milestones/${milestone.sequence}`;
  const of = (stage: JourneyStage) =>
    pending.filter((item) => KINDS[stage].includes(item.kind));
  const evidence = of("evidence");
  const stages: Stage[] = [
    {
      key: "evidence",
      href: `/submissions/${contract.id}/${milestone.sequence}`,
      state: stateOf(evidence),
      status: t("journey.evidenceCount", {
        done: evidence.filter((i) => i.state === "DONE").length,
        total: evidence.length,
      }),
      items: evidence,
    },
  ];
  if (milestone.approvalRequired) {
    const approval = of("approval");
    stages.push({
      key: "approval",
      href: `/approvals/${contract.id}/${milestone.sequence}`,
      state:
        evaluation.validApprovalCount >= evaluation.quorum
          ? "done"
          : stateOf(approval),
      status: t("journey.approvalCount", {
        done: evaluation.validApprovalCount,
        quorum: evaluation.quorum,
      }),
      items: approval,
    });
  }
  const dispute = of("dispute");
  stages.push({
    key: "dispute",
    href: `${base}/dispute`,
    state: dispute.length ? stateOf(dispute) : "none",
    status: dispute.length
      ? t("journey.disputeOpen", { count: dispute.length })
      : t("journey.disputeNone"),
    items: dispute,
  });
  const decisionItems = of("decision");
  stages.push({
    key: "decision",
    href: `${base}/decision`,
    state:
      evaluation.decision === "RELEASE" || evaluation.decision === "PENALTY"
        ? "done"
        : evaluation.decision === "REJECT"
          ? "blocking"
          : decisionItems.length
            ? stateOf(decisionItems)
            : "waiting",
    status: td(`decision.${evaluation.decision}`),
    items: decisionItems,
  });
  const payment = of("payment");
  if (payment.length)
    stages.push({
      key: "payment",
      href: `${base}/decision`,
      state: stateOf(payment),
      status:
        payment[0].state === "DONE"
          ? t("journey.paymentDone")
          : t("journey.paymentWaiting"),
      items: payment,
    });
  return stages;
}

function StageIcon({ state }: { state: StageState }) {
  if (state === "done") return <CheckCircleFilled className={styles.done} />;
  if (state === "blocking")
    return <ExclamationCircleFilled className={styles.blocking} />;
  if (state === "waiting")
    return <ClockCircleOutlined className={styles.waiting} />;
  return <MinusCircleOutlined className={styles.none} />;
}

/**
 * The milestone's screens as one journey: evidence, approval, dispute, decision and payment. Each
 * stage links to the screen where it is handled and previews, on hover, who must act on it.
 */
export function MilestoneJourney({
  contractId,
  sequence,
  current,
}: {
  contractId: string;
  sequence: number;
  current: JourneyStage;
}) {
  const { t } = useTranslation("milestones");
  const { t: td } = useTranslation("domain");
  const detail = useQuery({
    queryKey: ["milestones", "decision", contractId, sequence],
    queryFn: () => getMilestoneDetail(contractId, sequence),
  });
  if (!detail.data) return null;
  const data = detail.data;
  const stages = stagesOf(data, t, td);
  return (
    <nav
      className={styles.journey}
      aria-label={t("journey.label")}
      data-testid="milestone-journey"
    >
      <ol>
        {stages.map((stage) => {
          const here = stage.key === current;
          // Open items first; a finished stage shows who did it.
          const shown = stage.items.filter((i) => i.state !== "DONE").length
            ? stage.items.filter((i) => i.state !== "DONE")
            : stage.items;
          const link = (
            <Link
              to={stage.href}
              className={styles.stage}
              data-state={stage.state}
              aria-current={here ? "page" : undefined}
              data-testid={`journey-${stage.key}`}
            >
              <StageIcon state={stage.state} />
              <span className={styles.text}>
                <span className={styles.name}>
                  {t(`journey.stage.${stage.key}`)}
                </span>
                <span className={styles.status}>{stage.status}</span>
              </span>
            </Link>
          );
          return (
            <li key={stage.key}>
              {shown.length ? (
                <Popover
                  trigger={["hover", "focus"]}
                  placement="bottom"
                  content={
                    <div className={styles.cards}>
                      {shown.map((item) => (
                        <PendingCard
                          key={item.key}
                          item={item}
                          rules={data.rules}
                          progress={
                            data.evaluation.approvalRequired
                              ? {
                                  done: data.evaluation.validApprovalCount,
                                  quorum: data.evaluation.quorum,
                                }
                              : undefined
                          }
                        />
                      ))}
                    </div>
                  }
                >
                  {link}
                </Popover>
              ) : (
                link
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
