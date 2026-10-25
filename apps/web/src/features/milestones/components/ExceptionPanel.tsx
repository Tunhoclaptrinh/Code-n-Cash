import { useState } from "react";
import {
  App as AntApp,
  Button,
  Input,
  Select,
  Space,
  Tag,
  Typography,
} from "antd";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { ExceptionRequest, MilestoneDetail } from "@codecash/contracts";
import { decideException, proposeException } from "@/shared/api/domain";
import { useCurrentUser } from "@/shared/auth/session";
import { actorName } from "@/shared/lib/domain";
import { formatDateTime } from "@/shared/lib/format";
import { DemoFillButton } from "@/shared/ui/DemoFillButton";
import { useApiErrorMessage } from "../hooks/useApiErrorMessage";
import styles from "./MilestoneDecision.module.css";

/** BR-19: one controller proposes to void an unauthorised event, a second one decides (SoD-2). */
export function ExceptionPanel({
  data,
  onChanged,
}: {
  data: MilestoneDetail;
  onChanged: () => Promise<unknown>;
}) {
  const { t } = useTranslation("milestones");
  const { t: td } = useTranslation("domain");
  const { t: tc } = useTranslation("common");
  const { message } = AntApp.useApp();
  const user = useCurrentUser();
  const { milestone } = data;
  const [eventId, setEventId] = useState<string>();
  const [reason, setReason] = useState("");
  const controller = user.role === "ADMIN_AUDITOR";
  const candidates = data.events.filter(
    (e) =>
      e.classification === "UNAUTHORIZED" &&
      !data.exceptions.some(
        (x) => x.eventId === e.id && x.status !== "REJECTED",
      ),
  );
  const failed = useApiErrorMessage();
  const propose = useMutation({
    mutationFn: () =>
      proposeException({
        contractId: data.contract.id,
        sequence: data.milestone.sequence,
        eventId: eventId ?? "",
        reason,
      }),
    onSuccess: async () => {
      message.success(t("decision.exceptions.proposed"));
      setReason("");
      setEventId(undefined);
      await onChanged();
    },
    onError: failed,
  });
  const decide = useMutation({
    mutationFn: (input: { request: ExceptionRequest; approve: boolean }) =>
      decideException({
        exceptionId: input.request.id,
        approve: input.approve,
      }),
    onSuccess: async () => {
      message.success(t("decision.exceptions.decided"));
      await onChanged();
    },
    onError: failed,
  });
  return (
    <section>
      <h3 className={styles.traceHeading}>
        {t("decisionLite.exceptions.title")}
      </h3>
      {data.exceptions.length ? (
        data.exceptions.map((request) => (
          <div
            key={request.id}
            style={{
              padding: "8px 0",
              borderTop: "1px solid var(--border-divider)",
            }}
          >
            <Space size={6} wrap>
              <Tag
                color={
                  request.status === "APPROVED"
                    ? "success"
                    : request.status === "REJECTED"
                      ? "error"
                      : "processing"
                }
              >
                {t(`decision.exceptions.state.${request.status}`)}
              </Tag>
              <span>
                {t("decision.exceptions.voidEvent", { id: request.eventId })}
              </span>
            </Space>
            <div style={{ fontSize: 13 }}>
              {t("decision.exceptions.proposedBy", {
                name: request.proposedBy.name,
                at: formatDateTime(request.proposedAt),
              })}{" "}
              · {request.reason}
            </div>
            {request.decidedBy ? (
              <div style={{ fontSize: 13 }}>
                {t("decision.exceptions.decidedBy", {
                  name: request.decidedBy.name,
                  at: formatDateTime(request.decidedAt ?? ""),
                })}
              </div>
            ) : null}
            {controller && request.status === "PROPOSED" ? (
              request.proposedBy.userId === user.id ? (
                <Typography.Text type="secondary">
                  {t("decision.exceptions.waitSecond")}
                </Typography.Text>
              ) : (
                <Space style={{ marginTop: 6 }}>
                  <Button
                    size="small"
                    color="green"
                    variant="solid"
                    loading={decide.isPending}
                    onClick={() => decide.mutate({ request, approve: true })}
                    data-testid="exception-approve"
                  >
                    {t("decision.exceptions.approve")}
                  </Button>
                  <Button
                    size="small"
                    danger
                    loading={decide.isPending}
                    onClick={() => decide.mutate({ request, approve: false })}
                  >
                    {t("decision.exceptions.reject")}
                  </Button>
                </Space>
              )
            ) : null}
          </div>
        ))
      ) : (
        <Typography.Text type="secondary">
          {t("decision.exceptions.none")}
        </Typography.Text>
      )}
      {controller && data.actions.proposeException ? (
        <Space direction="vertical" style={{ width: "100%", marginTop: 12 }}>
          <Select
            placeholder={t("decisionLite.exceptions.pick")}
            value={eventId}
            onChange={setEventId}
            options={candidates.map((e) => ({
              value: e.id,
              label: `${e.id} · ${td(`eventType.${e.type}`)} · ${actorName(td, e.actor)}`,
            }))}
            data-testid="exception-event"
          />
          <DemoFillButton
            disabled={!!reason.trim()}
            onClick={() =>
              setReason(
                t("decisionLite.exceptions.demoReason", {
                  milestone: `${td("milestoneNo", { no: milestone.sequence })} · ${td(`milestoneType.${milestone.type}`)}`,
                }),
              )
            }
          >
            {tc("demoFill.action")}
          </DemoFillButton>
          <Input.TextArea
            rows={2}
            value={reason}
            maxLength={2000}
            showCount
            placeholder={t("decision.exceptions.reason")}
            onChange={(event) => setReason(event.target.value)}
            data-testid="exception-reason"
          />
          <Button
            color="orange"
            variant="outlined"
            disabled={!eventId || !reason.trim()}
            loading={propose.isPending}
            onClick={() => propose.mutate()}
            data-testid="exception-propose"
          >
            {t("decision.exceptions.propose")}
          </Button>
        </Space>
      ) : null}
    </section>
  );
}
