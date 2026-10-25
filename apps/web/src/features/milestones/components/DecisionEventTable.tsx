import { Space, Table, Tag, Typography } from "antd";
import { useTranslation } from "react-i18next";
import type { ClassifiedEvent } from "@codecash/contracts";
import { actorName, eventClassTone } from "@/shared/lib/domain";
import { formatDateTime } from "@/shared/lib/format";
import { OriginTag } from "@/shared/ui/DomainTags";
import { TechnicalList, TrackingCode } from "@/shared/ui/TechnicalInfo";
import { ToneTag } from "@/shared/ui/ToneTag";

export function DecisionEventTable({
  events,
  evidence,
}: {
  events: ClassifiedEvent[];
  evidence: string[];
}) {
  const { t } = useTranslation("milestones");
  const { t: td } = useTranslation("domain");
  const { t: tc } = useTranslation("common");
  return (
    <Table<ClassifiedEvent>
      size="small"
      rowKey="id"
      dataSource={events}
      pagination={false}
      scroll={{ x: "max-content" }}
      expandable={{
        expandedRowRender: (e) => (
          <TechnicalList
            items={[
              {
                key: "source",
                label: tc("technical.source"),
                value: <OriginTag origin={e.origin} />,
              },
              {
                key: "document",
                label: tc("technical.document"),
                value: e.documentId,
              },
              {
                key: "channel",
                label: tc("technical.channel"),
                value: e.source,
              },
              {
                key: "party",
                label: tc("technical.party"),
                value: e.actor.partyId,
              },
            ]}
          />
        ),
      }}
      columns={[
        {
          key: "at",
          title: t("detail.events.at"),
          render: (_, e) => formatDateTime(e.at),
        },
        {
          key: "type",
          title: t("detail.events.type"),
          render: (_, e) => (
            <>
              <Space size={4} wrap>
                <b>{td(`eventType.${e.type}`)}</b>
                <Tag style={{ margin: 0 }}>{td(`eventStatus.${e.status}`)}</Tag>
              </Space>
              <div>
                <TrackingCode code={e.id} />
              </div>
            </>
          ),
        },
        {
          key: "actor",
          title: t("detail.events.actor"),
          render: (_, e) => (
            <>
              <div>{actorName(td, e.actor)}</div>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {[
                  e.actor.type ? td(`partyType.${e.actor.type}`) : "",
                  e.actor.approvalRole
                    ? td(`approvalRole.${e.actor.approvalRole}`)
                    : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Typography.Text>
            </>
          ),
        },
        {
          key: "class",
          title: t("decision.events.classification"),
          render: (_, e) => (
            <Space size={4} wrap>
              <ToneTag tone={eventClassTone[e.classification]}>
                {td(`eventClass.${e.classification}`)}
              </ToneTag>
              {e.duplicateOf ? (
                <Typography.Text type="secondary">
                  → {e.duplicateOf}
                </Typography.Text>
              ) : null}
              {evidence.includes(e.id) ? (
                <Tag color="green">{t("decision.events.inEvidence")}</Tag>
              ) : null}
            </Space>
          ),
        },
        {
          key: "document",
          title: t("detail.events.document"),
          render: (_, e) => (
            <>
              {e.fileName ?? "—"}
              {e.referenceEventId ? (
                <div style={{ fontSize: 12 }}>
                  {t("detail.events.reference", { id: e.referenceEventId })}
                </div>
              ) : null}
            </>
          ),
        },
      ]}
    />
  );
}
