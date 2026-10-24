import { TableRowActions } from "@/shared/ui/TableRowActions";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Alert, Space, Tag, Typography } from "antd";
import type { MenuProps } from "antd";
import {
  ArrowRightOutlined,
  EyeOutlined,
  FileSearchOutlined,
} from "@ant-design/icons";
import {
  BaseButton,
  DataTable,
  DetailModal,
  PageContainer,
  type FilterConfig,
  type StatisticsItem,
} from "@codecash/ui";
import type { TaskKind, TaskRow } from "@codecash/contracts";
import { listTasks } from "@/shared/api/domain";
import { useCurrentUser } from "@/shared/auth/session";
import { AppPage } from "@/shared/layout/AppPage";
import { formatDate, formatDecimalString } from "@/shared/lib/format";
import { useListQuery } from "@/shared/lib/useListQuery";
import { columnSearch } from "@/shared/ui/columnSearch";
import { OriginTag } from "@/shared/ui/DomainTags";

type Badge = TaskRow["badge"];
const BADGES: Badge[] = [
  "LATE_PENALTY_RISK",
  "YOUR_TURN",
  "MILESTONE_ON_HOLD",
  "ON_TIME",
];
const KINDS: TaskKind[] = [
  "SUBMIT_EVIDENCE",
  "RESUBMIT_EVIDENCE",
  "APPROVE_PAYMENT",
  "RESOLVE_DISPUTE",
  "SIGN_CONTRACT",
  "COMPLETE_DRAFT",
  "REVIEW_EXCEPTION",
  "DECIDE_EXCEPTION",
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

/** Work waiting for the signed-in user; each row comes from the latest engine decision (spec 9.5). */
export default function TaskInboxPage() {
  const { t } = useTranslation("milestones");
  const { t: tc } = useTranslation("common");
  const { t: td } = useTranslation("domain");
  const user = useCurrentUser();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<TaskRow>();
  // One page at a time from the API; the inbox order (most urgent first) is the default sort.
  const list = useListQuery<TaskRow>({
    auditExport: "tasks",
    key: ["pending-tasks", user.id],
    fetch: listTasks,
    sort: { by: "rank", order: "asc" },
  });
  const { filters, setFilter } = list;
  const facets = list.data?.facets ?? {};
  const count = (key: string, value: string) =>
    facets[key]?.find((f) => f.value === value)?.count ?? 0;
  const kinds = KINDS.filter((kind) => count("kind", kind));
  const tab = filters.badge?.length === 1 ? String(filters.badge[0]) : "ALL";

  const what = (r: TaskRow) =>
    r.eventTypes.length
      ? r.eventTypes.map((type) => td(`eventType.${type}`)).join(", ")
      : r.roles.length
        ? r.roles.map((role) => td(`approvalRole.${role}`)).join(", ")
        : r.reasonCode
          ? td(`reason.${r.reasonCode}`)
          : "—";
  const where = (r: TaskRow) =>
    r.sequence && r.milestoneType
      ? `${td("milestoneNo", { no: r.sequence })} · ${td(`milestoneType.${r.milestoneType}`)}`
      : r.contractTitle;

  const changeTab = (key: string) =>
    setFilter("badge", key === "ALL" ? undefined : [key]);
  const statistics: StatisticsItem[] = BADGES.map((badge) => ({
    title: t(`inbox.badge.${badge}`),
    value: count("badge", badge),
    backgroundColor: badgeColor[badge].bg,
    valueColor: badgeColor[badge].value,
    selected: tab === badge,
    onClick: () => changeTab(tab === badge ? "ALL" : badge),
  }));
  const filterConfig: FilterConfig[] = [
    {
      key: "contractId",
      label: t("inbox.columns.contract"),
      type: "select",
      operators: ["eq"],
      options: (facets.contractId ?? []).map((f) => ({
        value: f.value,
        label: f.value,
      })),
    },
    {
      key: "kind",
      label: t("inbox.columns.task"),
      type: "select",
      operators: ["eq"],
      options: kinds.map((value) => ({
        value,
        label: td(`taskKind.${value}`),
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
    ...(r.sequence
      ? [
          {
            key: "decision",
            icon: <FileSearchOutlined />,
            label: t("inbox.actions.openDecision"),
            onClick: () =>
              navigate(
                `/contracts/${r.contractId}/milestones/${r.sequence}/decision`,
              ),
          },
        ]
      : []),
  ];

  const columns = [
    {
      ...list.column("kind"),
      title: t("inbox.columns.task"),
      filters: kinds.map((value) => ({ text: td(`taskKind.${value}`), value })),
      filterMultiple: false,
      render: (_: unknown, r: TaskRow) => (
        <div style={{ cursor: "pointer" }} onClick={() => setDetail(r)}>
          <Typography.Text strong>{td(`taskKind.${r.kind}`)}</Typography.Text>
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
              {what(r)}
            </Typography.Text>
          </div>
        </div>
      ),
    },
    {
      ...list.column("contract"),
      title: t("inbox.columns.contract"),
      sorter: true,
      ...columnSearch(),
      render: (_: unknown, r: TaskRow) => (
        <>
          <Space size={6} wrap>
            <Typography.Text strong>{r.contractId}</Typography.Text>
            <OriginTag origin={r.origin} />
          </Space>
          <div>{where(r)}</div>
          <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
            {r.contractTitle}
          </Typography.Text>
        </>
      ),
    },
    {
      ...list.column("amount"),
      title: t("inbox.columns.amount"),
      align: "right" as const,
      sorter: true,
      render: (_: unknown, r: TaskRow) =>
        r.amountMillion ? formatDecimalString(r.amountMillion) : "—",
    },
    {
      ...list.column("dueDate"),
      dataIndex: "dueDate",
      title: t("inbox.columns.due"),
      sorter: true,
      render: (_: unknown, r: TaskRow) => (
        <>
          {r.dueDate ? formatDate(r.dueDate) : "—"}
          {r.overdueDays > 0 ? (
            <div>
              <Typography.Text type="danger" style={{ fontSize: 12.5 }}>
                {td("overdue", { count: r.overdueDays })}
              </Typography.Text>
            </div>
          ) : null}
        </>
      ),
    },
    {
      ...list.column("badge"),
      dataIndex: "badge",
      title: t("inbox.columns.status"),
      filters: BADGES.map((value) => ({
        text: t(`inbox.badge.${value}`),
        value,
      })),
      filterMultiple: false,
      render: (badge: Badge) => (
        <Tag color={badgeColor[badge].tag}>{t(`inbox.badge.${badge}`)}</Tag>
      ),
    },
  ];

  const onExport = list.exporter(
    columns,
    {
      kind: (r) => ({
        [t("inbox.columns.task")]: td(`taskKind.${r.kind}`),
        [t("inbox.columns.required")]: what(r),
      }),
      contract: (r) => ({
        [t("inbox.columns.contract")]: r.contractId,
        [t("inbox.columns.milestone")]: where(r),
      }),
      amount: (r) => r.amountMillion ?? "",
      dueDate: (r) => (r.dueDate ? formatDate(r.dueDate) : ""),
      badge: (r) => t(`inbox.badge.${r.badge}`),
    },
    "tasks",
  );

  return (
    <AppPage
      guide="tasks"
      active="tasks"
      breadcrumb={[{ label: tc("nav.tasks") }]}
    >
      <PageContainer>
        {list.result.isError ? (
          <Alert type="error" showIcon title={tc("common.loadError")} />
        ) : null}
        <DataTable<TaskRow>
          rowKey="id"
          scroll={{ x: 1400 }}
          columns={columns.map((column) => ({
            ...column,
            width:
              (
                {
                  kind: 270,
                  contract: 280,
                  amount: 160,
                  dueDate: 160,
                  badge: 220,
                } as Record<string, number>
              )[String(column.key)] ?? 200,
          }))}
          {...list.table}
          emptyText={t("inbox.empty")}
          statisticsData={statistics}
          tabs={[
            { key: "ALL", label: t("inbox.tabs.ALL") },
            ...BADGES.map((key) => ({ key, label: t(`inbox.badge.${key}`) })),
          ]}
          activeTab={tab}
          onTabChange={changeTab}
          searchPlaceholder={t("inbox.searchPlaceholder")}
          filters={filterConfig}
          exportable
          exportFilename="tasks"
          onExport={(options) => void onExport(options)}
          actionsWidth={104}
          customActions={(r) => (
            <TableRowActions
              primary={{
                label: t(`inbox.action.${r.kind}`),
                icon: <ArrowRightOutlined />,
                onClick: () => navigate(r.href),
              }}
              menu={menuFor(r)}
              moreLabel={t("inbox.actions.more")}
            />
          )}
        />
        <Typography.Paragraph type="secondary">
          {t("inbox.footer")}
        </Typography.Paragraph>
      </PageContainer>
      <DetailModal
        open={!!detail}
        title={detail ? td(`taskKind.${detail.kind}`) : undefined}
        record={detail}
        onClose={() => setDetail(undefined)}
        items={
          detail
            ? [
                {
                  key: "contract",
                  label: t("inbox.columns.contract"),
                  value: `${detail.contractId} · ${detail.contractTitle}`,
                  span: 2,
                },
                {
                  key: "milestone",
                  label: t("inbox.columns.milestone"),
                  value: where(detail),
                  span: 2,
                },
                {
                  key: "required",
                  label: t("inbox.columns.required"),
                  value: what(detail),
                  span: 2,
                },
                ...(detail.reasonCode
                  ? [
                      {
                        key: "reason",
                        label: t("inbox.detail.reason"),
                        value: td(`reason.${detail.reasonCode}`),
                        span: 2,
                      },
                    ]
                  : []),
                {
                  key: "due",
                  label: t("inbox.columns.due"),
                  value:
                    (detail.dueDate ? formatDate(detail.dueDate) : "—") +
                    (detail.overdueDays > 0
                      ? ` · ${td("overdue", { count: detail.overdueDays })}`
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
                  key: "origin",
                  label: t("inbox.detail.origin"),
                  value: <OriginTag origin={detail.origin} />,
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
