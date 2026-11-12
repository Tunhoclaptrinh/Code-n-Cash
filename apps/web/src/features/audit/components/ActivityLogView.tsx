import { TableRowActions } from "@/shared/ui/TableRowActions";
import { STAT_TONE } from "@/shared/ui/statTone";
import { useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { Button, Segmented, Space, Tag, Tooltip, Typography } from "antd";
import {
  AimOutlined,
  ArrowRightOutlined,
  AuditOutlined,
  CheckCircleOutlined,
  DownloadOutlined,
  EditOutlined,
  FileProtectOutlined,
  SettingOutlined,
  EyeOutlined,
  FileSearchOutlined,
  FileTextOutlined,
} from "@ant-design/icons";
import {
  DataTable,
  DetailModal,
  downloadBlob,
  PageContainer,
  type FilterConfig,
  type StatisticsItem,
} from "@codecash/ui";
import { listActivity } from "@/shared/api/domain";
import { platform } from "@/shared/api/platform";
import { useApiErrorMessage } from "@/features/milestones/hooks/useApiErrorMessage";
import { useCurrentUser } from "@/shared/auth/session";
import { formatDate, formatDateTime, formatTime } from "@/shared/lib/format";
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
import styles from "./ActivityLogView.module.css";

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
  SIGN: { tag: "processing", ...STAT_TONE.blue },
  EVIDENCE: { tag: "cyan", ...STAT_TONE.sky },
  APPROVAL: {
    tag: "success",
    ...STAT_TONE.green,
  },
  DISPUTE: { tag: "error", ...STAT_TONE.red },
  SYSTEM: {
    tag: "default",
    bg: "var(--bg-surface-alt)",
    value: "var(--text-primary)",
  },
};
const categoryIcon: Record<ActivityCategory, ReactNode> = {
  SIGN: <EditOutlined />,
  EVIDENCE: <FileProtectOutlined />,
  APPROVAL: <CheckCircleOutlined />,
  DISPUTE: <AuditOutlined />,
  SYSTEM: <SettingOutlined />,
};
/**
 * Append-only audit trail: list, filter, inspect and export; there is no edit or delete. Entries
 * are read page by page from the API, newest first; every filter and the search are part of the
 * request, so the total and the export are exactly the matching entries.
 */

/**
 * Where an entry leads, if the viewer may open it (the API says so in `links`): a milestone's
 * decision, else the contract.
 */
const activityHref = (e: ActivityEntry) =>
  e.links.milestone
    ? `/contracts/${e.contractCode}/milestones/${e.milestoneNo}/decision`
    : e.links.contract
      ? `/contracts/${e.contractCode}`
      : null;

/** The event's row on its milestone's decision screen, opened and highlighted there. */
const eventHref = (e: ActivityEntry) =>
  e.links.eventId
    ? `/contracts/${e.contractCode}/milestones/${e.milestoneNo}/decision?${new URLSearchParams({ event: e.links.eventId })}`
    : null;

export function ActivityLogView({
  initialContract = "",
}: {
  /** Contract to filter on when the page opens (`?contract=` in the URL). */
  initialContract?: string;
}) {
  const { t } = useTranslation("audit");
  const user = useCurrentUser();
  const [detail, setDetail] = useState<ActivityEntry>();
  const navigate = useNavigate();
  const failed = useApiErrorMessage();
  const download = useMutation({
    mutationFn: async (e: ActivityEntry) =>
      downloadBlob(
        await platform.download(
          `/evidence-documents/${encodeURIComponent(e.links.eventId ?? e.id)}/download`,
        ),
        e.links.document?.fileName ?? "evidence",
      ),
    onError: failed,
  });
  /** Reconciliation: from an entry to its contract, milestone, event and stored file. */
  const linkMenu = (e: ActivityEntry) => {
    const items: Array<{
      key: string;
      icon: ReactNode;
      label: string;
      onClick: () => void;
    }> = [];
    const go = (key: string, icon: ReactNode, to: string | null) => {
      if (to)
        items.push({
          key,
          icon,
          label: t(`links.${key}`),
          onClick: () => navigate(to),
        });
    };
    go("event", <FileSearchOutlined />, eventHref(e));
    go(
      "milestone",
      <AimOutlined />,
      e.links.milestone
        ? `/contracts/${e.contractCode}/milestones/${e.milestoneNo}/decision`
        : null,
    );
    go(
      "contract",
      <FileTextOutlined />,
      e.links.contract ? `/contracts/${e.contractCode}` : null,
    );
    if (e.links.document)
      items.push({
        key: "download",
        icon: <DownloadOutlined />,
        label: t("links.download"),
        onClick: () => download.mutate(e),
      });
    return items;
  };
  const list = useListQuery<
    ActivityEntry,
    Awaited<ReturnType<typeof listActivity>>
  >({
    syncUrl: true,
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
      key: "mine",
      label: t("filters.mine"),
      type: "select",
      operators: ["eq"],
      options: [{ value: true, label: t("filters.mineYes") }],
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

  const scope = filters.mine?.[0] === true ? "mine" : "all";
  const columns = [
    {
      ...list.column("at"),
      dataIndex: "at",
      title: t("table.columns.time"),
      sorter: true,
      width: 130,
      render: (at: string) => (
        <div className={styles.when}>
          <span>{formatDate(at)}</span>
          <small>{formatTime(at)}</small>
        </div>
      ),
    },
    {
      ...list.column("action"),
      title: t("table.columns.activity"),
      filters: columnFilters("action", (v) => actionLabel(t, v)),
      filterMultiple: false,
      filterSearch: true,
      render: (_: unknown, e: ActivityEntry) => (
        <div className={styles.activity}>
          <span
            className={styles.categoryIcon}
            style={{
              color: categoryColor[e.category].value,
              background: categoryColor[e.category].bg,
            }}
            title={t(`categories.${e.category}`)}
          >
            {categoryIcon[e.category]}
          </span>
          <div className={styles.activityText}>
            <span className={styles.sentence}>
              {describeAction(t, e.action, { short: true })}
            </span>
            <span className={styles.byline}>
              {actorName(t, e)} · {t(`actorRoles.${e.actor.role}`)}
              {e.mine ? (
                <Tag color="blue" className={styles.you}>
                  {t("table.you")}
                </Tag>
              ) : null}
            </span>
          </div>
        </div>
      ),
    },
    {
      ...list.column("contractCode"),
      title: t("table.columns.contract"),
      filters: columnFilters("contractCode", (v) => v),
      filterMultiple: false,
      filterSearch: true,
      width: 170,
      render: (_: unknown, e: ActivityEntry) => (
        <div className={styles.reference}>
          {e.links.contract ? (
            <Link to={`/contracts/${e.contractCode}`} className={styles.code}>
              {e.contractCode}
            </Link>
          ) : (
            <span className={styles.code}>{e.contractCode}</span>
          )}
          {e.milestoneNo !== null ? (
            e.links.milestone ? (
              <Link
                to={`/contracts/${e.contractCode}/milestones/${e.milestoneNo}/decision`}
              >
                {t("domain:milestoneNo", { no: e.milestoneNo })}
              </Link>
            ) : (
              <span>{t("domain:milestoneNo", { no: e.milestoneNo })}</span>
            )
          ) : null}
        </div>
      ),
    },
    {
      key: "evidence",
      title: t("table.columns.evidence"),
      width: 170,
      render: (_: unknown, e: ActivityEntry) =>
        e.links.eventId ? (
          <Space size={2}>
            <Link
              to={eventHref(e)!}
              className={`${styles.code} ${styles.evidenceLink}`}
            >
              {e.links.eventId}
            </Link>
            {e.links.document ? (
              <Tooltip title={t("links.download")}>
                <Button
                  type="text"
                  size="small"
                  icon={<DownloadOutlined />}
                  aria-label={t("links.download")}
                  loading={
                    download.isPending && download.variables?.id === e.id
                  }
                  onClick={() => download.mutate(e)}
                />
              </Tooltip>
            ) : null}
          </Space>
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        ),
    },
    {
      ...list.column("origin"),
      title: t("table.columns.origin"),
      width: 130,
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
      action: (e) => ({
        [t("table.columns.actor")]: actorName(t, e),
        [t("table.actorRoleColumn")]: t(`actorRoles.${e.actor.role}`),
        [t("table.columns.category")]: t(`categories.${e.category}`),
        [t("table.columns.action")]: describeAction(t, e.action),
      }),
      contractCode: (e) => contractReference(t, e),
      evidence: (e) => e.links.eventId ?? "",
      origin: (e) => t(`domain:origin.${e.origin}`),
    },
    t("export.fileName").replace(/\.csv$/, ""),
  );

  return (
    <PageContainer>
      <DataTable<ActivityEntry>
        mobileCards
        columnSettings={{ storageKey: "activity" }}
        hideCard
        rowKey="id"
        scroll={{ x: 1100 }}
        columns={columns}
        extra={
          // One click to reconcile one's own actions; the same "mine" filter as the builder.
          <Segmented
            size="small"
            value={scope}
            onChange={(value) =>
              setFilter("mine", value === "mine" ? [true] : undefined)
            }
            options={[
              { value: "all", label: t("scope.all") },
              {
                value: "mine",
                label: t("scope.mine", { count: count("mine", "true") }),
              },
            ]}
            data-testid="activity-scope"
          />
        }
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
        actionsWidth={84}
        customActions={(e) => {
          const href = activityHref(e);
          return (
            <TableRowActions
              primary={
                href
                  ? {
                      label: e.links.milestone
                        ? t("links.milestone")
                        : t("links.contract"),
                      icon: <ArrowRightOutlined />,
                      onClick: () => navigate(href),
                    }
                  : {
                      label: t("detail.view"),
                      icon: <EyeOutlined />,
                      tone: "neutral",
                      onClick: () => setDetail(e),
                    }
              }
              menu={[
                {
                  key: "detail",
                  icon: <EyeOutlined />,
                  label: t("detail.view"),
                  onClick: () => setDetail(e),
                },
                ...linkMenu(e),
              ]}
              moreLabel={t("links.more")}
            />
          );
        }}
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
                  value: contractReference(t, detail),
                },
                ...(linkMenu(detail).length
                  ? [
                      {
                        key: "links",
                        label: t("links.title"),
                        value: (
                          <Space wrap size={[8, 8]}>
                            {linkMenu(detail).map((item) => (
                              <Button
                                key={item.key}
                                size="small"
                                icon={item.icon}
                                onClick={() => {
                                  item.onClick();
                                  setDetail(undefined);
                                }}
                              >
                                {item.label}
                              </Button>
                            ))}
                          </Space>
                        ),
                      },
                    ]
                  : []),
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
