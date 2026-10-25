import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Space, Table, Typography } from "antd";
import { useTranslation } from "react-i18next";
import type { TimelinePoint } from "@codecash/contracts";
import { getMilestoneTimeline } from "@/shared/api/domain";
import { actorName, statusTone } from "@/shared/lib/domain";
import { formatDateTime, formatDecimalString } from "@/shared/lib/format";
import { DecisionTag } from "@/shared/ui/DomainTags";
import { ToneTag, type Tone } from "@/shared/ui/ToneTag";
import styles from "./MilestoneDecision.module.css";

const replayTone: Record<TimelinePoint["status"], Tone> = {
  ...statusTone,
  PLANNED: "neutral",
  IN_PROGRESS: "primary",
};
const isZero = (amount: string) => /^0(\.0+)?$/.test(amount);

/** The engine replayed after each event of the milestone (as-of, BR-16): how the decision came about. */
export function ReplayPanel({
  contractId,
  sequence,
}: {
  contractId: string;
  sequence: number;
}) {
  const { t } = useTranslation("milestones");
  const { t: td } = useTranslation("domain");
  const [requested, setRequested] = useState(false);
  const replay = useQuery({
    queryKey: ["milestones", "timeline", contractId, sequence],
    queryFn: () => getMilestoneTimeline(contractId, sequence),
    enabled: requested,
  });
  return (
    <section>
      <Space
        wrap
        style={{ width: "100%", justifyContent: "space-between" }}
        align="center"
      >
        <h3 className={styles.traceHeading}>{t("decision.replay.title")}</h3>
        <Button
          loading={replay.isFetching}
          onClick={() =>
            requested ? void replay.refetch() : setRequested(true)
          }
          data-testid="replay-timeline"
        >
          {t(requested ? "decision.replay.again" : "decision.replay.run")}
        </Button>
      </Space>
      {replay.isError ? (
        <Alert type="error" showIcon title={t("decision.replay.error")} />
      ) : null}
      {replay.data ? (
        <div data-testid="replay-table">
          <Table<TimelinePoint>
            size="small"
            rowKey="at"
            pagination={false}
            scroll={{ x: "max-content" }}
            dataSource={replay.data}
            locale={{ emptyText: t("decision.replay.empty") }}
            columns={[
              {
                key: "at",
                title: t("decision.replay.columns.at"),
                render: (_, p) => formatDateTime(p.at),
              },
              {
                key: "events",
                title: t("decision.replay.columns.events"),
                render: (_, p) =>
                  p.events.map((e) => (
                    <div key={e.id}>
                      <b>{td(`eventType.${e.type}`)}</b> ·{" "}
                      {actorName(td, e.actor)}{" "}
                      <Typography.Text
                        type="secondary"
                        style={{ fontSize: 12 }}
                      >
                        {e.id}
                      </Typography.Text>
                    </div>
                  )),
              },
              {
                key: "decision",
                title: t("decision.replay.columns.decision"),
                render: (_, p) => <DecisionTag decision={p.decision} />,
              },
              {
                key: "status",
                title: t("decision.replay.columns.status"),
                render: (_, p) => (
                  <Space direction="vertical" size={2}>
                    <ToneTag tone={replayTone[p.status]}>
                      {td(`status.${p.status}`)}
                    </ToneTag>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {td(`reason.${p.reasonCode}`)} · {p.ruleId}
                    </Typography.Text>
                  </Space>
                ),
              },
              {
                key: "approvals",
                title: t("decision.replay.columns.approvals"),
                render: (_, p) =>
                  p.approvals.quorum
                    ? `${p.approvals.valid}/${p.approvals.quorum}`
                    : "—",
              },
              {
                key: "missing",
                title: t("decision.replay.columns.missing"),
                render: (_, p) =>
                  p.missing.length
                    ? p.missing
                        .map((type) => td(`eventType.${type}`))
                        .join(", ")
                    : "—",
              },
              {
                key: "amounts",
                title: t("decision.replay.columns.amounts"),
                render: (_, p) =>
                  p.decision === "RELEASE" || p.decision === "PENALTY" ? (
                    <>
                      {formatDecimalString(p.payableMillion)}
                      {isZero(p.penaltyMillion) ? null : (
                        <Typography.Text type="danger">
                          {" "}
                          −{formatDecimalString(p.penaltyMillion)}
                        </Typography.Text>
                      )}
                    </>
                  ) : (
                    "—"
                  ),
              },
            ]}
          />
        </div>
      ) : null}
    </section>
  );
}
