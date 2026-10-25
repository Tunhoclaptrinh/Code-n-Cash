import { TableRowActions } from "@/shared/ui/TableRowActions";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Tag, Typography } from "antd";
import { EyeOutlined } from "@ant-design/icons";
import {
  DataTable,
  DetailModal,
  PageContainer,
  type FilterConfig,
  type StatisticsItem,
} from "@codecash/ui";
import { listActivity } from "@/shared/api/domain";
import { useCurrentUser } from "@/shared/auth/session";
import { formatDateTime } from "@/shared/lib/format";
import { useListQuery } from "@/shared/lib/useListQuery";
import { OriginTag } from "@/shared/ui/DomainTags";
import { AuditDetails } from "@/shared/ui/AuditDetails";
import {
  actionLabel,
  actorName,
  contractReference,
  describeAction,
} from "../lib/activityText";
import type { ActivityCategory, ActivityEntry } from "../types";

const categories: ActivityCategory[] = [
  "SIGN",
  "EVIDENCE",
  "APPROVAL",
  "DISPUTE",
  "SYSTEM",
];
const categoryColor: Record<
  ActivityCategory,
  { tag: string; bg: string; value: string }
> = {
  SIGN: { tag: "processing", bg: "rgba(49, 91, 234, 0.08)", value: "#315bea" },
  EVIDENCE: { tag: "cyan", bg: "rgba(14, 165, 233, 0.08)", value: "#0EA5E9" },
  APPROVAL: {
    tag: "success",
    bg: "rgba(16, 185, 129, 0.08)",
    value: "#10B981",
  },
  DISPUTE: { tag: "error", bg: "rgba(239, 68, 68, 0.08)", value: "#EF4444" },
  SYSTEM: {
    tag: "default",
    bg: "var(--bg-surface-alt)",
    value: "var(--text-primary)",
  },
};
/**
 * Append-only audit trail: list, filter, inspect and export; there is no edit or delete. Entries
 * are read page by page from the API, newest first; every filter and the search are part of the
 * request, so the total and the export are exactly the matching entries.
 */
export function ActivityLogView({
  initialContract = "",
}: {
  /** Contract to filter on when the page opens (`?contract=` in the URL). */
  initialContract?: string;
}) {
  const { t } = useTranslation("audit");
  const user = useCurrentUser();
  const [detail, setDetail] = useState<ActivityEntry>();
  const list = useListQuery<
    ActivityEntry,
    Awaited<ReturnType<typeof listActivity>>
  >({
    auditExport: "activity",
    key: ["activity-log", user.id],
    fetch: listActivity,
    sort: { by: "at", order: "desc" },
    filters: initialContract ? { contractCode: [initialContract] } : {},
  });
  const { filters, setFilter } = list;
  const facets = list.data?.facets ?? {};
  const actorNames = list.data?.actorNames ?? {};
  const count = (key: string, value: string) =>
    facets[key]?.find((f) => f.value === value)?.count ?? 0;
  const tab =
    filters.category?.length === 1 ? String(filters.category[0]) : "ALL";
  const changeTab = (key: string) =>
    setFilter("category", key === "ALL" ? undefined : [key]);
  const options = (key: string, label: (value: string) => string) =>
    (facets[key] ?? []).map((f) => ({ value: f.value, label: label(f.value) }));
  const columnFilters = (key: string, label: (value: string) => string) =>
    options(key, label).map((o) => ({ text: o.label, value: o.value }));
  // System entries are automatic; the pills cover the four human activity types.
  const statistics: StatisticsItem[] = categories
    .filter((category) => category !== "SYSTEM")
    .map((category) => ({
      colSpan: { xs: 12, sm: 12, md: 6 },
      title: t(`categories.${category}`),
      value: count("category", category),
      backgroundColor: categoryColor[category].bg,
      valueColor: categoryColor[category].value,
      selected: tab === category,
      onClick: () => changeTab(tab === category ? "ALL" : category),
    }));
  const filterConfig: FilterConfig[] = [
    {
      key: "contractCode",
      label: t("filters.contract"),
      type: "select",
      operators: ["eq"],
      options: options("contractCode", (v) => v),
    },
    {
      key: "actorId",
      label: t("filters.actor"),
      type: "select",
      operators: ["eq"],
      options: options(
        "actorId",
        (v) => actorNames[v] || t("actorNames.SYSTEM"),
      ),
    },
    {
      key: "from",
      label: t("filters.from"),
      type: "date",
      operators: ["gte"],
      defaultOperator: "gte",
    },
    {
      key: "to",
      label: t("filters.to"),
      type: "date",
      operators: ["lte"],
      defaultOperator: "lte",
    },
  ];

  const columns = [
    {
      ...list.column("at"),
      dataIndex: "at",
      title: t("table.columns.time"),
      sorter: true,
      render: formatDateTime,
    },
    {
      ...list.column("actorRole"),
      title: t("table.columns.actor"),
      filters: columnFilters("actorRole", (v) => t(`actorRoles.${v}`)),
      filterMultiple: false,
      render: (_: unknown, e: ActivityEntry) => (
        <>
          {actorName(t, e)}
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
              {t(`actorRoles.${e.actor.role}`)}
            </Typography.Text>
          </div>
        </>
      ),
    },
    {
      ...list.column("category"),
      dataIndex: "category",
      title: t("table.columns.category"),
      filters: categories.map((value) => ({
        text: t(`categories.${value}`),
        value,
      })),
      filterMultiple: false,
      render: (c: ActivityCategory) => (
        <Tag color={categoryColor[c].tag}>{t(`categories.${c}`)}</Tag>
      ),
    },
    {
      ...list.column("action"),
      title: t("table.columns.action"),
      filters: columnFilters("action", (v) => actionLabel(t, v)),
      filterMultiple: false,
      filterSearch: true,
      render: (_: unknown, e: ActivityEntry) => describeAction(t, e.action),
    },
    {
      ...list.column("contractCode"),
      title: t("table.columns.contract"),
      filters: columnFilters("contractCode", (v) => v),
      filterMultiple: false,
      filterSearch: true,
      render: (_: unknown, e: ActivityEntry) => (
        <Link to={`/contracts/${e.contractCode}`}>
          {contractReference(t, e)}
        </Link>
      ),
    },
    {
      ...list.column("origin"),
      title: t("table.columns.origin"),
      filters: (["DATA_PACK", "SEED", "APP"] as const).map((value) => ({
        text: t(`domain:origin.${value}`),
        value,
      })),
      filterMultiple: false,
      render: (_: unknown, e: ActivityEntry) => <OriginTag origin={e.origin} />,
    },
  ];

  const onExport = list.exporter(
    columns,
    {
      at: (e) => formatDateTime(e.at),
      actorRole: (e) => ({
        [t("table.columns.actor")]: actorName(t, e),
        [t("table.actorRoleColumn")]: t(`actorRoles.${e.actor.role}`),
      }),
      category: (e) => t(`categories.${e.category}`),
      action: (e) => describeAction(t, e.action),
      contractCode: (e) => contractReference(t, e),
      origin: (e) => t(`domain:origin.${e.origin}`),
    },
    t("export.fileName").replace(/\.csv$/, ""),
  );

  return (
    <PageContainer>
      <DataTable<ActivityEntry>
        rowKey="id"
        scroll={{ x: 1400 }}
        columns={columns.map((column) => ({
          ...column,
          width:
            (
              { at: 180, actor: 220, action: 340, contract: 220 } as Record<
                string,
                number
              >
            )[String(column.key)] ?? 200,
        }))}
        {...list.table}
        emptyText={t("table.empty")}
        statisticsData={statistics}
        tabs={[
          { key: "ALL", label: t("filters.all") },
          ...categories.map((key) => ({
            key,
            label: t(`categories.${key}`),
          })),
        ]}
        activeTab={tab}
        onTabChange={changeTab}
        // The filter builder reads a "from"/"to" condition under its operator suffix.
        filterValues={{
          ...list.table.filterValues,
          from_gte: list.table.filterValues.from,
          to_lte: list.table.filterValues.to,
        }}
        searchPlaceholder={t("filters.searchPlaceholder")}
        filters={filterConfig}
        exportable
        exportFilename={t("export.fileName")}
        onExport={(options) => void onExport(options)}
        onView={(e) => setDetail(e)}
        actionsWidth={72}
        customActions={(e) => (
          <TableRowActions
            primary={{
              label: t("detail.view"),
              icon: <EyeOutlined />,
              onClick: () => setDetail(e),
            }}
          />
        )}
      />
      <DetailModal
        open={!!detail}
        title={detail ? describeAction(t, detail.action) : undefined}
        record={detail}
        onClose={() => setDetail(undefined)}
        items={
          detail
            ? [
                ...(detail.audit
                  ? [
                      {
                        key: "audit",
                        label: t("detail.view"),
                        value: <AuditDetails entry={detail.audit} />,
                      },
                    ]
                  : []),
                {
                  key: "at",
                  label: t("table.columns.time"),
                  value: formatDateTime(detail.at),
                },
                {
                  key: "category",
                  label: t("table.columns.category"),
                  value: (
                    <Tag color={categoryColor[detail.category].tag}>
                      {t(`categories.${detail.category}`)}
                    </Tag>
                  ),
                },
                {
                  key: "actor",
                  label: t("table.columns.actor"),
                  value: actorName(t, detail),
                },
                {
                  key: "role",
                  label: t("table.actorRoleColumn"),
                  value: t(`actorRoles.${detail.actor.role}`),
                },
                {
                  key: "contract",
                  label: t("table.columns.contract"),
                  value: (
                    <Link to={`/contracts/${detail.contractCode}`}>
                      {contractReference(t, detail)}
                    </Link>
                  ),
                },
                {
                  key: "id",
                  label: t("detail.entryId"),
                  value: (
                    <Typography.Text code copyable>
                      {detail.id}
                    </Typography.Text>
                  ),
                },
              ]
            : []
        }
      />
    </PageContainer>
  );
}
