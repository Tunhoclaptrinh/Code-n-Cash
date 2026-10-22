import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Alert, Dropdown, Space, Tag, Typography } from "antd";
import type { MenuProps } from "antd";
import {
  ArrowRightOutlined,
  EyeOutlined,
  FileSearchOutlined,
  MenuOutlined,
} from "@ant-design/icons";
import {
  BaseButton,
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
import { useCurrentUser } from "@/shared/auth/session";
import { AppPage } from "@/shared/layout/AppPage";
import { columnSearch } from "@/shared/ui/columnSearch";
import { formatDate, formatMillionVnd, formatTime } from "@/shared/lib/format";
import { getTaskInbox } from "../api/tasks.api";
import { evidenceName, lowerCase } from "../lib/display";
import type { TaskKind, TaskRow } from "../types";

type Badge = TaskRow["badge"];
const BADGES: Badge[] = [
  "LATE_PENALTY_RISK",
  "YOUR_TURN",
  "MILESTONE_ON_HOLD",
  "ON_TIME",
];
const KINDS: TaskKind[] = [
  "SUBMIT_EVIDENCE",
  "SIGN_CONTRACT",
  "RESUBMIT_EVIDENCE",
  "APPROVE_PAYMENT",
];
const badgeColor: Record<Badge, { tag: string; bg: string; value: string }> = {
  LATE_PENALTY_RISK: {
    tag: "error",
    bg: "rgba(239, 68, 68, 0.08)",
    value: "#EF4444",
  },
  YOUR_TURN: {
    tag: "processing",
    bg: "rgba(49, 91, 234, 0.08)",
    value: "#315bea",
  },
  MILESTONE_ON_HOLD: {
    tag: "warning",
    bg: "rgba(245, 158, 11, 0.08)",
    value: "#F59E0B",
  },
  ON_TIME: { tag: "success", bg: "rgba(16, 185, 129, 0.08)", value: "#10B981" },
};

type Filters = { contractId?: string; kind?: TaskKind };

export default function TaskInboxPage() {
  const { t, i18n } = useTranslation("milestones");
  const { t: tc } = useTranslation("common");
  const user = useCurrentUser();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Badge | "ALL">("ALL");
  const [detail, setDetail] = useState<TaskRow>();
  const { filters, updateFilter, clearFilters } = useFilters<Filters>({});
  const { page, pageSize, goToPage, handleTableChange } = usePagination(1, 10);
  const inbox = useQuery({
    queryKey: ["milestones", "inbox", user.id],
    queryFn: () => getTaskInbox(user.id),
  });
  const rows = useMemo(() => inbox.data ?? [], [inbox.data]);
  const visible = useMemo(
    () =>
      rows.filter(
        (r) =>
          (tab === "ALL" || r.badge === tab) &&
          (!filters.contractId || r.contractId === filters.contractId) &&
          (!filters.kind || r.kind === filters.kind),
      ),
    [rows, tab, filters],
  );

  const name = (r: TaskRow) =>
    r.heading.kind === "MILESTONE"
      ? t(`milestoneKind.${r.heading.milestoneKind}`)
      : "";
  const taskTitle = (r: TaskRow) =>
    t(`inbox.task.${r.kind}`, {
      milestone: lowerCase(name(r), i18n.language),
    });
  const heading = (r: TaskRow) =>
    r.heading.kind === "MILESTONE"
      ? t("inbox.headingMilestone", {
          contractId: r.contractId,
          no: r.heading.no,
          name: name(r),
        })
      : t("inbox.headingTitle", {
          contractId: r.contractId,
          title: r.heading.title,
        });
  const subtitle = (r: TaskRow) =>
    r.subtitle.kind === "CONTRACT_AMOUNT"
      ? t("inbox.contractAmount", {
          title: r.subtitle.title,
          amount: formatMillionVnd(r.subtitle.amountMillion),
        })
      : r.subtitle.kind === "BUYER_SIGNED"
        ? t("inbox.buyerSigned", { time: formatTime(r.subtitle.at) })
        : t("inbox.requestReason", { reason: r.subtitle.text });
  const requirements = (r: TaskRow) =>
    r.requirements.map((x) => evidenceName(t, x)).join(", ");

  const changeTab = (key: string) => {
    setTab(key as Badge | "ALL");
    goToPage(1);
  };
  const statistics: StatisticsItem[] = BADGES.map((badge) => ({
    title: t(`inbox.badge.${badge}`),
    value: rows.filter((r) => r.badge === badge).length,
    backgroundColor: badgeColor[badge].bg,
    valueColor: badgeColor[badge].value,
    selected: tab === badge,
    onClick: () => changeTab(tab === badge ? "ALL" : badge),
  }));
  const filterConfig: FilterConfig[] = [
    {
      key: "contractId",
      label: t("inbox.columns.contractAndMilestone"),
      type: "select",
      options: [...new Set(rows.map((r) => r.contractId))]
        .sort()
        .map((value) => ({ value, label: value })),
    },
    {
      key: "kind",
      label: t("inbox.columns.task"),
      type: "select",
      options: KINDS.map((value) => ({
        value,
        label: t(`inbox.task.${value}`, { milestone: "" }).trim(),
      })),
    },
  ];
  const menuFor = (r: TaskRow): MenuProps["items"] => [
    {
      key: "detail",
      icon: <EyeOutlined />,
      label: t("inbox.actions.detail"),
      onClick: () => setDetail(r),
    },
    {
      key: "contract",
      icon: <FileSearchOutlined />,
      label: t("inbox.actions.openContract"),
      onClick: () => navigate(`/contracts/${r.contractId}`),
    },
  ];

  const columns = [
    {
      key: "task",
      title: t("inbox.columns.task"),
      filters: KINDS.map((value) => ({
        text: t(`inbox.task.${value}`, { milestone: "" }).trim(),
        value,
      })),
      onFilter: (value: unknown, r: TaskRow) => r.kind === value,
      render: (_: unknown, r: TaskRow) => (
        <div style={{ cursor: "pointer" }} onClick={() => setDetail(r)}>
          <Typography.Text strong>{taskTitle(r)}</Typography.Text>
        </div>
      ),
    },
    {
      key: "contract",
      title: t("inbox.columns.contractAndMilestone"),
      sorter: (a: TaskRow, b: TaskRow) =>
        a.contractId.localeCompare(b.contractId),
      ...columnSearch<TaskRow>((r) => `${heading(r)} ${subtitle(r)}`),
      render: (_: unknown, r: TaskRow) => (
        <>
          {heading(r)}
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
              {subtitle(r)}
            </Typography.Text>
          </div>
        </>
      ),
    },
    {
      key: "due",
      dataIndex: "dueDate",
      title: t("inbox.columns.due"),
      sorter: (a: TaskRow, b: TaskRow) => a.dueDate.localeCompare(b.dueDate),
      render: (_: unknown, r: TaskRow) => (
        <>
          {formatDate(r.dueDate)}
          {r.overdueDays > 0 ? (
            <div>
              <Typography.Text type="danger" style={{ fontSize: 12.5 }}>
                {t("inbox.overdue", { count: r.overdueDays })}
              </Typography.Text>
            </div>
          ) : null}
        </>
      ),
    },
    {
      key: "required",
      title: t("inbox.columns.required"),
      render: (_: unknown, r: TaskRow) => requirements(r),
    },
    {
      key: "status",
      dataIndex: "badge",
      title: t("inbox.columns.status"),
      filters: BADGES.map((value) => ({
        text: t(`inbox.badge.${value}`),
        value,
      })),
      onFilter: (value: unknown, r: TaskRow) => r.badge === value,
      render: (badge: Badge) => (
        <Tag color={badgeColor[badge].tag}>{t(`inbox.badge.${badge}`)}</Tag>
      ),
    },
  ];

  const exportRows = (list: TaskRow[]) =>
    list.map((r) => ({
      [t("inbox.columns.task")]: taskTitle(r),
      [t("inbox.columns.contractAndMilestone")]: heading(r),
      [t("inbox.columns.due")]: formatDate(r.dueDate),
      [t("inbox.columns.required")]: requirements(r),
      [t("inbox.columns.status")]: t(`inbox.badge.${r.badge}`),
    }));

  return (
    <AppPage active="tasks" breadcrumb={[{ label: tc("nav.tasks") }]}>
      <PageContainer
        title={t("inbox.title")}
        subtitle={t("inbox.subtitle", { count: rows.length })}
        tooltip={t("inbox.intro")}
      >
        {inbox.isError ? (
          <Alert type="error" showIcon title={tc("common.loadError")} />
        ) : null}
        <DataTable<TaskRow>
          rowKey="id"
          dataSource={visible}
          columns={columns}
          loading={inbox.isPending}
          emptyText={t("inbox.empty")}
          statisticsData={statistics}
          tabs={[
            { key: "ALL", label: t("inbox.tabs.ALL") },
            ...BADGES.map((key) => ({ key, label: t(`inbox.badge.${key}`) })),
          ]}
          activeTab={tab}
          onTabChange={changeTab}
          searchFields={["contractId"]}
          filters={filterConfig}
          filterValues={filters}
          onFilterChange={(key, value) => {
            updateFilter(key as keyof Filters, value || undefined);
            goToPage(1);
          }}
          onClearFilters={clearFilters}
          onRefresh={() => void inbox.refetch()}
          pagination={{ current: page, pageSize }}
          onPaginationChange={handleTableChange}
          exportable
          onExport={(options) => {
            const list = exportRows(
              options.scope === "page"
                ? visible.slice((page - 1) * pageSize, page * pageSize)
                : options.scope === "custom"
                  ? visible.slice(0, options.limit)
                  : visible,
            );
            if (options.format === "json") exportToJSON(list, "tasks");
            else exportToCSV(list, "tasks");
          }}
          customActions={(r) => (
            <Space size={4}>
              <IconButton
                icon={<ArrowRightOutlined />}
                tooltip={t(`inbox.action.${r.kind}`)}
                success={r.primary}
                onClick={() => navigate(r.href)}
              />
              <Dropdown
                menu={{ items: menuFor(r) }}
                trigger={["click"]}
                placement="bottomRight"
              >
                <IconButton
                  icon={<MenuOutlined />}
                  tooltip={t("inbox.actions.more")}
                />
              </Dropdown>
            </Space>
          )}
        />
        <Typography.Paragraph type="secondary">
          {t("inbox.footer")}
        </Typography.Paragraph>
      </PageContainer>
      <DetailModal
        open={!!detail}
        title={detail ? taskTitle(detail) : undefined}
        record={detail}
        onClose={() => setDetail(undefined)}
        items={
          detail
            ? [
                {
                  key: "contract",
                  label: t("inbox.columns.contractAndMilestone"),
                  value: heading(detail),
                  span: 2,
                },
                {
                  key: "subtitle",
                  label: t("inbox.detail.context"),
                  value: subtitle(detail),
                  span: 2,
                },
                {
                  key: "due",
                  label: t("inbox.columns.due"),
                  value:
                    formatDate(detail.dueDate) +
                    (detail.overdueDays > 0
                      ? ` · ${t("inbox.overdue", { count: detail.overdueDays })}`
                      : ""),
                },
                {
                  key: "status",
                  label: t("inbox.columns.status"),
                  value: (
                    <Tag color={badgeColor[detail.badge].tag}>
                      {t(`inbox.badge.${detail.badge}`)}
                    </Tag>
                  ),
                },
                {
                  key: "required",
                  label: t("inbox.columns.required"),
                  value: requirements(detail),
                  span: 2,
                },
              ]
            : []
        }
        extraActions={
          detail ? (
            <BaseButton
              variant="primary"
              icon={<ArrowRightOutlined />}
              onClick={() => navigate(detail.href)}
            >
              {t(`inbox.action.${detail.kind}`)}
            </BaseButton>
          ) : null
        }
      />
    </AppPage>
  );
}
