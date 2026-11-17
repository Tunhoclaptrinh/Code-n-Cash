import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  App as AntApp,
  Button,
  Collapse,
  Input,
  Modal,
  Space,
  Steps,
  Typography,
} from "antd";
import { useTranslation } from "react-i18next";
import type { AcceptanceReview, MilestoneDetail } from "@codecash/contracts";
import {
  getMilestoneDetail,
  requestAcceptance,
  returnAcceptanceRequest,
} from "@/shared/api/domain";
import { formatDate, formatDateTime } from "@/shared/lib/format";
import { InfoGrid, SideCard, SideSection } from "@/shared/ui/SidePanel";
import { ToneTag, type Tone } from "@/shared/ui/ToneTag";
import { useApiErrorMessage } from "../hooks/useApiErrorMessage";
import styles from "./MilestoneDecision.module.css";

type State = AcceptanceReview["state"];

const STATE_TONE: Record<State, Tone> = {
  NOT_REQUESTED: "neutral",
  WAITING_SUPPLIER_DOCUMENTS: "warning",
  IN_REVIEW: "primary",
  OVERDUE: "danger",
  ACCEPTED: "success",
  ACCEPTED_AFTER_DEADLINE: "orange",
};

const ALERT_TYPE: Record<State, "info" | "warning" | "success" | "error"> = {
  NOT_REQUESTED: "info",
  WAITING_SUPPLIER_DOCUMENTS: "warning",
  IN_REVIEW: "info",
  OVERDUE: "warning",
  ACCEPTED: "success",
  ACCEPTED_AFTER_DEADLINE: "warning",
};

/** Which step of request → review → acceptance the milestone is on (antd Steps index). */
const CURRENT_STEP: Record<State, number> = {
  NOT_REQUESTED: 0,
  WAITING_SUPPLIER_DOCUMENTS: 1,
  IN_REVIEW: 1,
  OVERDUE: 1,
  ACCEPTED: 2,
  ACCEPTED_AFTER_DEADLINE: 2,
};

/**
 * The panel on its own card for screens that do not load the milestone detail themselves (the evidence
 * page); it shares the decision page's query, so both show the same state.
 */
export function AcceptanceReviewCard({
  contractId,
  sequence,
}: {
  contractId: string;
  sequence: number;
}) {
  const view = useQuery({
    queryKey: ["milestones", "decision", contractId, sequence],
    queryFn: () => getMilestoneDetail(contractId, sequence),
  });
  return view.data?.acceptanceReview ? (
    <SideCard>
      <AcceptanceReviewPanel data={view.data} />
    </SideCard>
  ) : null;
}

/**
 * BR-21, acceptance review window. The supplier asks for acceptance; the buyer has the contract's
 * window to accept or return the request with a reason; a buyer document issued after the window counts
 * at its end. The engine decides; this panel shows where the milestone stands and offers the two actions.
 */
export function AcceptanceReviewPanel({ data }: { data: MilestoneDetail }) {
  const review = data.acceptanceReview;
  const { t } = useTranslation("milestones");
  const { t: td } = useTranslation("domain");
  const { message } = AntApp.useApp();
  const queryClient = useQueryClient();
  const failed = useApiErrorMessage();
  const [dialog, setDialog] = useState<"REQUEST" | "RETURN" | null>(null);
  const [note, setNote] = useState("");
  const [noteMissing, setNoteMissing] = useState(false);
  const ref = {
    contractId: data.contract.id,
    sequence: data.milestone.sequence,
  };
  const act = useMutation({
    mutationFn: () =>
      dialog === "RETURN"
        ? returnAcceptanceRequest({ ...ref, note: note.trim() })
        : requestAcceptance({ ...ref, note: note.trim() || undefined }),
    onSuccess: async () => {
      message.success(
        t(
          dialog === "RETURN"
            ? "acceptanceReview.returned"
            : "acceptanceReview.requested",
        ),
      );
      setDialog(null);
      setNote("");
      await queryClient.invalidateQueries({ queryKey: ["milestones"] });
    },
    onError: failed,
  });
  if (!review) return null;

  const deadline = review.deadline ? formatDateTime(review.deadline) : "";
  const documents = review.documents
    .map((d) => td(`eventType.${d.eventType}`))
    .join(", ");
  const issued = review.documents.find((d) => d.issuedAt)?.issuedAt;
  const summary = t(`acceptanceReview.state.${review.state}.body`, {
    days: review.days,
    deadline,
    documents,
    issued: issued ? formatDateTime(issued) : "",
    count: review.daysLeft ?? 0,
  });

  const open = (kind: "REQUEST" | "RETURN") => {
    setNote("");
    setNoteMissing(false);
    setDialog(kind);
  };
  const confirm = () => {
    if (dialog === "RETURN" && !note.trim()) {
      setNoteMissing(true);
      return;
    }
    act.mutate();
  };

  const step = CURRENT_STEP[review.state];
  const reviewStatus =
    review.state === "OVERDUE"
      ? "error"
      : step > 1
        ? "finish"
        : step === 1
          ? "process"
          : "wait";
  return (
    <SideSection
      title={t("acceptanceReview.title", { days: review.days })}
      extra={
        <ToneTag tone={STATE_TONE[review.state]}>
          {t(`acceptanceReview.state.${review.state}.label`)}
        </ToneTag>
      }
    >
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        <Alert
          type={ALERT_TYPE[review.state]}
          showIcon
          title={summary}
          data-testid="acceptance-review-summary"
        />
        <Steps
          size="small"
          orientation="vertical"
          current={step}
          items={[
            {
              title: t("acceptanceReview.steps.request"),
              status: review.request ? "finish" : "process",
              description: review.request
                ? t("acceptanceReview.steps.requestDone", {
                    at: formatDateTime(review.request.at),
                    by: review.request.by,
                  })
                : t("acceptanceReview.steps.requestWaiting"),
            },
            {
              title: t("acceptanceReview.steps.review", { days: review.days }),
              status: reviewStatus,
              description: review.deadline
                ? t("acceptanceReview.steps.reviewWindow", {
                    from: formatDateTime(review.startsAt ?? review.deadline),
                    to: deadline,
                  })
                : review.state === "WAITING_SUPPLIER_DOCUMENTS"
                  ? t("acceptanceReview.steps.reviewWaitingSupplier")
                  : t("acceptanceReview.steps.reviewNotStarted"),
            },
            {
              title: t("acceptanceReview.steps.accept", { documents }),
              status:
                review.state === "ACCEPTED"
                  ? "finish"
                  : review.state === "ACCEPTED_AFTER_DEADLINE"
                    ? "error"
                    : "wait",
              description: issued
                ? t("acceptanceReview.steps.acceptDone", {
                    at: formatDateTime(issued),
                  })
                : undefined,
            },
          ]}
        />
        <InfoGrid
          items={[
            {
              key: "deadline",
              label: t("acceptanceReview.deadline"),
              value: review.deadline
                ? review.daysLeft !== null
                  ? t("acceptanceReview.deadlineLeft", {
                      deadline,
                      count: review.daysLeft,
                    })
                  : deadline
                : t("acceptanceReview.noDeadline"),
            },
            ...review.documents.map((d) => ({
              key: d.eventType,
              label: td(`eventType.${d.eventType}`),
              value: d.issuedAt
                ? d.deemed
                  ? t("acceptanceReview.documentDeemed", {
                      issued: formatDateTime(d.issuedAt),
                      counted: formatDateTime(d.countedAt ?? d.issuedAt),
                    })
                  : t("acceptanceReview.documentIssued", {
                      issued: formatDateTime(d.issuedAt),
                    })
                : t("acceptanceReview.documentMissing"),
            })),
            ...(review.request?.note
              ? [
                  {
                    key: "note",
                    label: t("acceptanceReview.requestNote"),
                    value: review.request.note,
                  },
                ]
              : []),
          ]}
        />
        {review.returns.length ? (
          <div>
            <Typography.Text strong>
              {t("acceptanceReview.returnsTitle")}
            </Typography.Text>
            <ul className={styles.reviewReturns}>
              {review.returns.map((r) => (
                <li key={r.requestId}>
                  {t("acceptanceReview.returnItem", {
                    requested: formatDate(r.requestedAt),
                    returned: formatDateTime(r.returnedAt),
                    by: r.by,
                    reason: r.reason,
                  })}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {review.canRequest || review.canReturn ? (
          <Space wrap>
            {review.canRequest ? (
              <Button
                type="primary"
                onClick={() => open("REQUEST")}
                data-testid="request-acceptance"
              >
                {t("acceptanceReview.requestButton")}
              </Button>
            ) : null}
            {review.canReturn ? (
              <Button
                danger
                onClick={() => open("RETURN")}
                data-testid="return-acceptance"
              >
                {t("acceptanceReview.returnButton")}
              </Button>
            ) : null}
          </Space>
        ) : null}
        <Collapse
          ghost
          size="small"
          className={styles.more}
          items={[
            {
              key: "rule",
              label: t("acceptanceReview.ruleTitle"),
              children: (
                <ol className={styles.reviewRule}>
                  {(["1", "2", "3", "4", "5"] as const).map((n) => (
                    <li key={n}>
                      {t(`acceptanceReview.rule.${n}`, { days: review.days })}
                    </li>
                  ))}
                </ol>
              ),
            },
          ]}
        />
      </Space>
      <Modal
        open={dialog !== null}
        title={t(
          dialog === "RETURN"
            ? "acceptanceReview.returnDialog.title"
            : "acceptanceReview.requestDialog.title",
        )}
        okText={t(
          dialog === "RETURN"
            ? "acceptanceReview.returnDialog.submit"
            : "acceptanceReview.requestDialog.submit",
        )}
        okButtonProps={{ danger: dialog === "RETURN", loading: act.isPending }}
        cancelText={t("acceptanceReview.cancel")}
        onOk={confirm}
        onCancel={() => setDialog(null)}
        destroyOnHidden
      >
        <Space direction="vertical" size={8} style={{ width: "100%" }}>
          <Typography.Paragraph style={{ marginBottom: 0 }}>
            {t(
              dialog === "RETURN"
                ? "acceptanceReview.returnDialog.body"
                : "acceptanceReview.requestDialog.body",
              { days: review.days, deadline, documents },
            )}
          </Typography.Paragraph>
          <Input.TextArea
            value={note}
            rows={3}
            maxLength={1000}
            status={noteMissing ? "error" : undefined}
            aria-label={t(
              dialog === "RETURN"
                ? "acceptanceReview.returnDialog.note"
                : "acceptanceReview.requestDialog.note",
            )}
            placeholder={t(
              dialog === "RETURN"
                ? "acceptanceReview.returnDialog.note"
                : "acceptanceReview.requestDialog.note",
            )}
            onChange={(event) => {
              setNote(event.target.value);
              setNoteMissing(false);
            }}
          />
          {noteMissing ? (
            <Typography.Text type="danger">
              {t("acceptanceReview.returnDialog.noteRequired")}
            </Typography.Text>
          ) : null}
        </Space>
      </Modal>
    </SideSection>
  );
}
