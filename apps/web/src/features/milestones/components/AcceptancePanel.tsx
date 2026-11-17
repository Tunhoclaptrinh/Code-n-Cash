import { useState } from "react";
import { Alert, App as AntApp, Button, Input, Space, Tag } from "antd";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { MilestoneDetail } from "@codecash/contracts";
import { declineAcceptance, requestAcceptance } from "@/shared/api/domain";
import { formatDate, formatDateTime } from "@/shared/lib/format";
import { useApiErrorMessage } from "../hooks/useApiErrorMessage";
import styles from "./MilestoneDecision.module.css";

const STATE_COLOR = {
  OPEN: "processing",
  CONFIRMED: "success",
  DECLINED: "error",
} as const;

/**
 * Acceptance requests of a milestone. The supplier asks the buyer to confirm; the buyer's documents
 * are then recorded at the time of the request, so the buyer's delay is not the supplier's lateness.
 * The buyer's contract officer may decline with a reason when the work is not ready.
 */
export function AcceptancePanel({
  data,
  onChanged,
}: {
  data: MilestoneDetail;
  onChanged: () => Promise<unknown>;
}) {
  const { t } = useTranslation("milestones");
  const { t: td } = useTranslation("domain");
  const { message } = AntApp.useApp();
  const [note, setNote] = useState("");
  const failed = useApiErrorMessage();
  const ref = {
    contractId: data.contract.id,
    sequence: data.milestone.sequence,
  };
  const request = useMutation({
    mutationFn: () => requestAcceptance({ ...ref, note }),
    onSuccess: async () => {
      message.success(t("acceptance.requested"));
      setNote("");
      await onChanged();
    },
    onError: failed,
  });
  const decline = useMutation({
    mutationFn: () => declineAcceptance({ ...ref, note }),
    onSuccess: async () => {
      message.success(t("acceptance.declined"));
      setNote("");
      await onChanged();
    },
    onError: failed,
  });
  const { requestAcceptance: canRequest, declineAcceptance: canDecline } =
    data.actions;
  if (!data.acceptanceRequests.length && !canRequest) return null;
  return (
    <section data-testid="acceptance-panel">
      <h3 className={styles.traceHeading}>{t("acceptance.title")}</h3>
      <Alert
        type="info"
        showIcon
        title={t("acceptance.explain")}
        style={{ marginBottom: 8 }}
      />
      {data.acceptanceRequests.map((item) => (
        <div
          key={item.id}
          style={{
            padding: "8px 0",
            borderTop: "1px solid var(--border-divider)",
          }}
        >
          <Space size={6} wrap>
            <Tag color={STATE_COLOR[item.state]}>
              {t(`acceptance.state.${item.state}`)}
            </Tag>
            <span>
              {item.eventTypes
                .map((type) => td(`eventType.${type}`))
                .join(", ")}
            </span>
          </Space>
          <div style={{ fontSize: 13 }}>
            {t("acceptance.requestedBy", {
              name: item.requestedBy.name,
              at: formatDateTime(item.requestedAt),
            })}
            {item.note ? ` · ${item.note}` : ""}
          </div>
          {item.state === "OPEN" ? (
            <div style={{ fontSize: 13 }}>
              {t("acceptance.respondBy", { date: formatDate(item.respondBy) })}
            </div>
          ) : null}
          {item.decidedBy ? (
            <div style={{ fontSize: 13 }}>
              {t(`acceptance.decidedBy.${item.state}`, {
                name: item.decidedBy.name,
                at: formatDateTime(item.decidedAt ?? ""),
              })}
              {item.decisionNote ? ` · ${item.decisionNote}` : ""}
            </div>
          ) : null}
        </div>
      ))}
      {canRequest || canDecline ? (
        <Space direction="vertical" style={{ width: "100%", marginTop: 12 }}>
          <Input.TextArea
            rows={2}
            value={note}
            maxLength={2000}
            showCount
            placeholder={t(
              canRequest
                ? "acceptance.notePlaceholder"
                : "acceptance.declineReason",
            )}
            onChange={(event) => setNote(event.target.value)}
            data-testid="acceptance-note"
          />
          {canRequest ? (
            <Button
              type="primary"
              loading={request.isPending}
              onClick={() => request.mutate()}
              data-testid="acceptance-request"
            >
              {t("acceptance.request")}
            </Button>
          ) : (
            <Button
              danger
              disabled={!note.trim()}
              loading={decline.isPending}
              onClick={() => decline.mutate()}
              data-testid="acceptance-decline"
            >
              {t("acceptance.decline")}
            </Button>
          )}
        </Space>
      ) : null}
    </section>
  );
}
