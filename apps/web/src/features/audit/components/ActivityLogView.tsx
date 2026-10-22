import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Tag, Typography } from "antd";
import { EyeOutlined } from "@ant-design/icons";
import {
  DataTable,
  DetailModal,
  IconButton,
  PageContainer,
  exportToCSV,
  exportToJSON,
  useFilters,
  usePagination,
  type FilterConfig,
  type StatisticsItem,
} from "@codecash/ui";
import { formatDateTime } from "@/shared/lib/format";
import { columnSearch } from "@/shared/ui/columnSearch";
import {
  actorName,
  contractReference,
  describeAction,
  filterActivity,
} from "../lib/activityText";
import type {
  ActivityCategory,
  ActivityEntry,
  ActivityFilters,
} from "../types";

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
const EMPTY: ActivityFilters = {
  contractCode: "",
  actorId: "",
  category: "",
  from: "",
  to: "",
};

/** Append-only audit trail: list, filter, inspect and export. There is no edit or delete. */
export function ActivityLogView({
  entries,
  loading,
  onRefresh,
}: {
  entries: ActivityEntry[];
  loading: boolean;
  onRefresh: () => void;
}) {
  const { t } = useTranslation("audit");
  const [tab, setTab] = useState<ActivityCategory | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<ActivityEntry>();
  const { filters, updateFilter, clearFilters } =
    useFilters<ActivityFilters>(EMPTY);
  const { page, pageSize, goToPage, handleTableChange } = usePagination(1, 10);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return filterActivity(entries, {
      ...filters,
      category: tab === "ALL" ? filters.category : tab,
    })
      .filter(
        (e) =>
          !query ||
          [
            describeAction(t, e.action),
            actorName(t, e),
            contractReference(t, e),
          ].some((text) => text.toLowerCase().includes(query)),
      )
      .sort((a, b) => b.at.localeCompare(a.at));
  }, [entries, filters, tab, search, t]);

  const changeTab = (key: string) => {
    setTab(key as ActivityCategory | "ALL");
    goToPage(1);
  };
  // System entries are automatic; the pills cover the four human activity types.
  const statistics: StatisticsItem[] = categories
    .filter((category) => category !== "SYSTEM")
    .map((category) => ({
      title: t(`categories.${category}`),
      value: entries.filter((e) => e.category === category).length,
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
      options: [...new Set(entries.map((x) => x.contractCode))]
        .sort()
        .map((value) => ({ value, label: value })),
    },
    {
      key: "actorId",
      label: t("filters.actor"),
      type: "select",
      options: [
        ...new Map(
          entries.map((x) => [
            x.actor.id,
            { value: x.actor.id, label: actorName(t, x) },
          ]),
        ).values(),
      ],
    },
    { key: "from", label: t("filters.from"), type: "date" },
    { key: "to", label: t("filters.to"), type: "date" },
  ];

  const columns = [
    {
      key: "at",
      dataIndex: "at",
      title: t("table.columns.time"),
      sorter: (a: ActivityEntry, b: ActivityEntry) => a.at.localeCompare(b.at),
      render: formatDateTime,
    },
    {
      key: "actor",
      title: t("table.columns.actor"),
      filters: [...new Set(entries.map((e) => e.actor.role))].map((role) => ({
        text: t(`actorRoles.${role}`),
        value: role,
      })),
      onFilter: (value: unknown, e: ActivityEntry) => e.actor.role === value,
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
      key: "category",
      dataIndex: "category",
      title: t("table.columns.category"),
      filters: categories.map((value) => ({
        text: t(`categories.${value}`),
        value,
      })),
      onFilter: (value: unknown, e: ActivityEntry) => e.category === value,
      render: (c: ActivityCategory) => (
        <Tag color={categoryColor[c].tag}>{t(`categories.${c}`)}</Tag>
      ),
    },
    {
      key: "action",
      title: t("table.columns.action"),
      ...columnSearch<ActivityEntry>((e) => describeAction(t, e.action)),
      render: (_: unknown, e: ActivityEntry) => describeAction(t, e.action),
    },
    {
      key: "contract",
      title: t("table.columns.contract"),
      filters: [...new Set(entries.map((e) => e.contractCode))]
        .sort()
        .map((value) => ({ text: value, value })),
      filterSearch: true,
      onFilter: (value: unknown, e: ActivityEntry) => e.contractCode === value,
      render: (_: unknown, e: ActivityEntry) => (
        <Link to={`/contracts/${e.contractCode}`}>
          {contractReference(t, e)}
        </Link>
      ),
    },
  ];

  const exportRows = (list: ActivityEntry[]) =>
    list.map((e) => ({
      [t("table.columns.time")]: formatDateTime(e.at),
      [t("table.columns.actor")]: actorName(t, e),
      [t("table.actorRoleColumn")]: t(`actorRoles.${e.actor.role}`),
      [t("table.columns.category")]: t(`categories.${e.category}`),
      [t("table.columns.action")]: describeAction(t, e.action),
      [t("table.columns.contract")]: contractReference(t, e),
    }));

  return (
    <PageContainer
      title={t("title")}
      subtitle={t("subtitle")}
      tooltip={t("appendOnly")}
    >
      <DataTable<ActivityEntry>
        rowKey="id"
        dataSource={visible}
        columns={columns}
        loading={loading}
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
        searchValue={search}
        onSearch={(value) => {
          setSearch(value);
          goToPage(1);
        }}
        searchPlaceholder={t("filters.searchPlaceholder")}
        filters={filterConfig}
        filterValues={filters}
        onFilterChange={(key, value) => {
          updateFilter(key as keyof ActivityFilters, value ?? "");
          goToPage(1);
        }}
        onClearFilters={clearFilters}
        onRefresh={onRefresh}
        pagination={{ current: page, pageSize, total: visible.length }}
        onPaginationChange={handleTableChange}
        exportable
        exportFilename={t("export.fileName")}
        onExport={(options) => {
          const rows = exportRows(
            options.scope === "page"
              ? visible.slice((page - 1) * pageSize, page * pageSize)
              : options.scope === "custom"
                ? visible.slice(0, options.limit)
                : visible,
          );
          const name = t("export.fileName").replace(/\.csv$/, "");
          if (options.format === "json") exportToJSON(rows, name);
          else exportToCSV(rows, name);
        }}
        onView={(e) => setDetail(e)}
        customActions={(e) => (
          <IconButton
            icon={<EyeOutlined />}
            tooltip={t("detail.view")}
            onClick={() => setDetail(e)}
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
