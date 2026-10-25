import { TableRowActions } from "@/shared/ui/TableRowActions";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Alert, Space, Tag, Typography } from "antd";
import { ArrowRightOutlined } from "@ant-design/icons";
import {
  DataTable,
  PageContainer,
  type FilterConfig,
  type StatisticsItem,
} from "@codecash/ui";
import { listExceptions, type QueueRow } from "@/shared/api/domain";
import { useCurrentUser } from "@/shared/auth/session";
import { AppPage } from "@/shared/layout/AppPage";
import { formatDateTime, formatDecimalString } from "@/shared/lib/format";
import { useListQuery } from "@/shared/lib/useListQuery";
import { columnSearch } from "@/shared/ui/columnSearch";
import { MilestoneStatusTag, OriginTag } from "@/shared/ui/DomainTags";

const tiles: Array<{ key: QueueRow["state"]; bg: string; value: string }> = [
  { key: "OPEN", bg: "rgba(239, 68, 68, 0.08)", value: "#EF4444" },
  { key: "PROPOSED", bg: "rgba(245, 158, 11, 0.08)", value: "#F59E0B" },
  { key: "DECIDED", bg: "rgba(16, 185, 129, 0.08)", value: "#10B981" },
];

/**
 * Exception queue of spec 9.5 for controllers: milestones held by an unauthorised event or a data
 * anomaly. One controller proposes to void the event, a second one decides (BR-19, SoD-2); the
 * engine then re-evaluates. Nobody can force a decision or an amount.
 */
export default function ExceptionQueuePage() {
  const { t } = useTranslation("audit");
  const { t: td } = useTranslation("domain");
  const navigate = useNavigate();
  const user = useCurrentUser();
  // The queue is read page by page; state, buyer and reason are filters of the same query.
  const list = useListQuery<QueueRow>({
    auditExport: "exceptions",
    key: ["exceptions", user.id],
    fetch: listExceptions,
    sort: { by: "contract", order: "asc" },
  });
  const { filters, setFilter } = list;
  const facets = list.data?.facets ?? {};
  const count = (key: string, value: string) =>
    facets[key]?.find((f) => f.value === value)?.count ?? 0;
  const tab = filters.state?.length === 1 ? String(filters.state[0]) : "ALL";
  const changeTab = (key: string) =>
    setFilter("state", key === "ALL" ? undefined : [key]);
  const statistics: StatisticsItem[] = tiles.map((tile) => ({
    colSpan: { xs: 12, sm: 12, md: 6 },
    title: t(`exceptions.tiles.${tile.key}`),
    value: count("state", tile.key),
    backgroundColor: tile.bg,
    valueColor: tile.value,
    selected: tab === tile.key,
    onClick: () => changeTab(tab === tile.key ? "ALL" : tile.key),
  }));
  const filterConfig: FilterConfig[] = [
    {
      key: "buyer",
      label: t("exceptions.columns.buyer"),
      type: "select",
      operators: ["eq"],
      options: (facets.buyer ?? []).map((f) => ({
        value: f.value,
        label: f.value,
      })),
    },
    {
      key: "reason",
      label: t("exceptions.columns.reason"),
      type: "select",
      operators: ["eq"],
      options: (facets.reason ?? []).map((f) => ({
        value: f.value,
        label: td(`reason.${f.value}`),
      })),
    },
  ];
  const path = (row: QueueRow) =>
    `/contracts/${row.contract.id}/milestones/${row.milestone.sequence}/decision`;
  const columns = [
    {
      ...list.column("contract"),
      title: t("exceptions.columns.milestone"),
      sorter: true,
      ...columnSearch(),
      render: (_: unknown, row: QueueRow) => (
        <div style={{ cursor: "pointer" }} onClick={() => navigate(path(row))}>
          <Space size={6} wrap>
            <Typography.Text strong>
              {row.contract.id} ·{" "}
              {td("milestoneNo", { no: row.milestone.sequence })}
            </Typography.Text>
            <OriginTag origin={row.contract.origin} />
          </Space>
          <div>
            {td(`milestoneType.${row.milestone.type}`)} · {row.contract.title}
          </div>
          <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
            {row.contract.buyer.name} ↔ {row.contract.supplier.name}
          </Typography.Text>
        </div>
      ),
    },
    {
      ...list.column("reason"),
      title: t("exceptions.columns.reason"),
      filters: (facets.reason ?? []).map((f) => ({
        text: td(`reason.${f.value}`),
        value: f.value,
      })),
      filterMultiple: false,
      render: (_: unknown, row: QueueRow) => (
        <Space direction="vertical" size={2}>
          <MilestoneStatusTag status={row.milestone.status} />
          <span>{td(`reason.${row.evaluation.reasonCode}`)}</span>
        </Space>
      ),
    },
    {
      key: "events",
      title: t("exceptions.columns.events"),
      render: (_: unknown, row: QueueRow) =>
        row.candidates.length ? (
          <Space direction="vertical" size={2}>
            {row.candidates.map((event) => (
              <span key={event.id}>
                <Typography.Text code>{event.id}</Typography.Text>{" "}
                {td(`eventType.${event.type}`)} · {event.actor.name} (
                {event.actor.partyId})
              </span>
            ))}
          </Space>
        ) : (
          "—"
        ),
    },
    {
      key: "requests",
      title: t("exceptions.columns.requests"),
      render: (_: unknown, row: QueueRow) =>
        row.requests.length ? (
          <Space direction="vertical" size={2}>
            {row.requests.map((request) => (
              <span key={request.id}>
                <Tag
                  color={
                    request.status === "APPROVED"
                      ? "success"
                      : request.status === "REJECTED"
                        ? "error"
                        : "processing"
                  }
                >
                  {t(`exceptions.state.${request.status}`)}
                </Tag>
                {request.eventId} · {request.proposedBy.name},{" "}
                {formatDateTime(request.proposedAt)}
              </span>
            ))}
          </Space>
        ) : (
          t("exceptions.none")
        ),
    },
    {
      ...list.column("amount"),
      title: t("exceptions.columns.amount"),
      align: "right" as const,
      sorter: true,
      render: (_: unknown, row: QueueRow) =>
        formatDecimalString(row.milestone.plannedMillion),
    },
  ];
  const onExport = list.exporter(
    columns,
    {
      contract: (row) => ({
        [t("exceptions.columns.contract")]: row.contract.id,
        [t("exceptions.columns.milestone")]: row.milestone.id,
        [t("exceptions.columns.buyer")]: row.contract.buyer.name,
        [t("exceptions.columns.supplier")]: row.contract.supplier.name,
      }),
      reason: (row) => td(`reason.${row.evaluation.reasonCode}`),
      events: (row) =>
        row.candidates
          .map(
            (e) => `${e.id} ${td(`eventType.${e.type}`)} (${e.actor.partyId})`,
          )
          .join("; "),
      requests: (row) =>
        row.requests
          .map((r) => `${r.id} ${t(`exceptions.state.${r.status}`)}`)
          .join("; "),
      amount: (row) => row.milestone.plannedMillion,
    },
    "exceptions",
  );

  return (
    <AppPage
      guide="exceptions"
      active="exceptions"
      breadcrumb={[{ label: t("exceptions.title") }]}
    >
      <PageContainer>
        <Alert type="info" showIcon title={t("exceptions.intro")} />
        {list.result.isError ? (
          <Alert type="error" showIcon title={String(list.result.error)} />
        ) : null}
        <DataTable<QueueRow>
          rowKey={(row) => row.milestone.id}
          scroll={{ x: 1500 }}
          columns={columns.map((column) => ({
            ...column,
            width: ({} as Record<string, number>)[String(column.key)] ?? 200,
          }))}
          {...list.table}
          statisticsData={statistics}
          tabs={[
            { key: "ALL", label: t("filters.all") },
            ...tiles.map((tile) => ({
              key: tile.key,
              label: t(`exceptions.tiles.${tile.key}`),
            })),
          ]}
          activeTab={tab}
          onTabChange={changeTab}
          searchPlaceholder={t("exceptions.searchPlaceholder")}
          filters={filterConfig}
          exportable
          exportFilename="exceptions"
          onExport={(options) => void onExport(options)}
          actionsWidth={72}
          customActions={(row) => (
            <TableRowActions
              primary={{
                label: t("exceptions.open"),
                icon: <ArrowRightOutlined />,
                onClick: () => navigate(path(row)),
              }}
            />
          )}
        />
      </PageContainer>
    </AppPage>
  );
}
