import { useState, type ReactNode } from "react";
import {
  Button,
  Col,
  Empty,
  Progress,
  Row,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import {
  ArrowRightOutlined,
  AuditOutlined,
  CloudUploadOutlined,
  DatabaseOutlined,
  ExceptionOutlined,
  FileTextOutlined,
  HistoryOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { PageContainer, StatisticsCard } from "@codecash/ui";
import type { DashboardView, Decision, TaskRow } from "@codecash/contracts";
import { getDashboard } from "@/shared/api/domain";
import { listPendingTasks } from "@/shared/api/tasks.api";
import { useCurrentUser } from "@/shared/auth/session";
import { AppPage } from "@/shared/layout/AppPage";
import { routeAllowed } from "@/shared/layout/navConfig";
import {
  formatDate,
  formatDateTime,
  formatDecimalString,
  formatMonth,
} from "@/shared/lib/format";
import { ActionBar, type BarAction } from "@/shared/ui/ActionBar";
import { ContractStatusTag } from "@/shared/ui/DomainTags";
import { PageState } from "@/shared/ui/PageState";
import { STAT_TONE } from "@/shared/ui/statTone";
import { TableRowActions } from "@/shared/ui/TableRowActions";
import {
  BarList,
  SegmentedBar,
  StackedColumns,
  type ChartPart,
} from "../components/charts";
import { DueCalendar } from "../components/DueCalendar";
import { WelcomeBanner } from "../components/WelcomeBanner";
import styles from "./DashboardPage.module.css";

type ContractSummary = DashboardView["contracts"][number];
type Attention = DashboardView["attention"][number];

/** Near real time: the overview refreshes on its own while it is open. */
const REFRESH_MS = 30_000;
/** Attention rows shown before "show all". */
const ATTENTION_PREVIEW = 6;

const DECISION_COLOR: Record<Decision, string> = {
  RELEASE: "var(--viz-payable)",
  PENALTY: "var(--viz-penalty)",
  HOLD: "var(--viz-held)",
  REJECT: "var(--viz-rejected)",
};
const DECISIONS: Decision[] = ["RELEASE", "PENALTY", "HOLD", "REJECT"];
const ATTENTION_COLOR: Record<Attention["kind"], string> = {
  OPEN_DISPUTE: "error",
  OVERDUE: "volcano",
  DUE_SOON: "warning",
  SEQUENCE_WARNING: "gold",
  LOW_CONFIDENCE: "processing",
};
const STATUS_ORDER: ContractSummary["status"][] = [
  "AWAITING_SIGNATURE",
  "PENDING_CONDITIONS",
  "NEEDS_REVIEW",
  "ALL_MILESTONES_ELIGIBLE",
  "CLOSED",
  "DRAFT",
];

/** Million VND string to a number, for drawing only: shown amounts keep the exact string. */
const size = (value: string) => Number(value) || 0;

/**
 * Overview of every contract the user may see: where the money stands, when it falls due, why
 * it is held, what needs a person now, and shortcuts to the screens that act on it. Every figure
 * comes from the API (stored evaluations and payments); the page only draws and links.
 */
export default function DashboardPage() {
  const { t } = useTranslation("dashboard");
  const navigate = useNavigate();
  const user = useCurrentUser();
  const can = (path: string) => routeAllowed(path, user.permissions);
  const [allAttention, setAllAttention] = useState(false);
  const view = useQuery({
    queryKey: ["dashboard", user.id],
    queryFn: getDashboard,
    refetchInterval: REFRESH_MS,
  });
  // The same query as the menu badge and the notification drawer: one request for all three.
  const tasks = useQuery({
    queryKey: ["pending-tasks", user.id],
    queryFn: listPendingTasks,
    enabled: can("/tasks"),
  });
  const data = view.data;
  const myTasks = tasks.data?.filter((task) => task.group === "MINE") ?? [];
  const lateTasks = myTasks.filter((task) => task.overdueDays > 0).length;

  const shortcut = (
    key: string,
    path: string,
    icon: ReactNode,
    extra: Partial<BarAction> = {},
  ): BarAction[] =>
    can(path)
      ? [
          {
            key,
            label: t(`actions.${key}`),
            icon,
            onClick: () => navigate(path),
            testId: `dashboard-go-${key}`,
            ...extra,
          },
        ]
      : [];
  const actions: BarAction[] = [
    ...(can("/tasks")
      ? [
          {
            key: "tasks",
            label: myTasks.length
              ? t("actions.tasks", { count: myTasks.length })
              : t("actions.tasksNone"),
            icon: <UnorderedListOutlined />,
            pinned: true,
            button: { type: "primary" } as const,
            onClick: () => navigate("/tasks"),
            testId: "dashboard-go-tasks",
          },
        ]
      : []),
    ...shortcut("upload", "/contracts/new", <CloudUploadOutlined />, {
      pinned: true,
    }),
    ...shortcut("contracts", "/contracts", <FileTextOutlined />),
    ...shortcut("exceptions", "/exceptions", <ExceptionOutlined />),
    ...shortcut("activity", "/activity-log", <HistoryOutlined />),
    ...shortcut("data", "/data", <DatabaseOutlined />),
    ...shortcut("verify", "/verify", <SafetyCertificateOutlined />),
    {
      key: "refresh",
      label: t("actions.refresh"),
      icon: <ReloadOutlined />,
      loading: view.isFetching,
      onClick: () => void view.refetch(),
      testId: "dashboard-refresh",
    },
  ];

  return (
    <AppPage
      active="dashboard"
      breadcrumb={[{ label: t("title") }]}
      extra={
        <ActionBar
          actions={actions}
          moreLabel={t("actions.more")}
          testId="dashboard-actions"
        />
      }
    >
      <PageContainer>
        {view.isLoading ? (
          <PageState kind="loading" />
        ) : view.isError || !data ? (
          <PageState kind="error" onRetry={() => void view.refetch()} />
        ) : data.contractCount === 0 ? (
          <Empty description={t("contracts.none")} />
        ) : (
          <Overview
            data={data}
            myTasks={can("/tasks") ? myTasks.length : null}
            tasks={can("/tasks") ? myTasks : null}
            lateTasks={lateTasks}
            canList={can("/contracts")}
            canTasks={can("/tasks")}
            canActivity={can("/activity-log")}
            allAttention={allAttention}
            onToggleAttention={() => setAllAttention((all) => !all)}
          />
        )}
      </PageContainer>
    </AppPage>
  );
}

function Overview({
  data,
  myTasks,
  tasks,
  lateTasks,
  canList,
  canTasks,
  canActivity,
  allAttention,
  onToggleAttention,
}: {
  data: DashboardView;
  myTasks: number | null;
  tasks: TaskRow[] | null;
  lateTasks: number;
  canList: boolean;
  canTasks: boolean;
  canActivity: boolean;
  allAttention: boolean;
  onToggleAttention: () => void;
}) {
  const { t } = useTranslation("dashboard");
  const { t: td } = useTranslation("domain");
  const navigate = useNavigate();
  const user = useCurrentUser();
  const { amounts, milestones } = data;
  const planned = size(amounts.plannedMillion);
  const pct = (value: string) =>
    planned > 0 ? Math.round((size(value) / planned) * 1000) / 10 : 0;
  const million = (value: string) => formatDecimalString(value);
  const status = (key: ContractSummary["status"]) => data.byStatus[key] ?? 0;
  const listOf = (path: string) => (canList ? () => navigate(path) : undefined);

  const moneyParts: ChartPart[] = [
    ["paid", amounts.paidMillion, "var(--viz-paid)", "light"],
    ["payable", amounts.payableMillion, "var(--viz-payable)", "dark"],
    ["penalty", amounts.penaltyMillion, "var(--viz-penalty)", "light"],
    ["held", amounts.heldMillion, "var(--viz-held)", "light"],
    ["rejected", amounts.rejectedMillion, "var(--viz-rejected)", "light"],
  ].map(([key, value, color, ink]) => ({
    key,
    label: t(`money.parts.${key}`),
    value: size(value),
    display: t("million", { value: million(value) }),
    color,
    ink: ink as "light" | "dark",
  }));

  const currentMonth = data.today.slice(0, 7);
  // Every month between the first and the last due date, so the axis is a true time scale.
  const months = fillMonths(data.byMonth).map((month) => ({
    key: month.month,
    label: formatMonth(month.month, true),
    title: t("months.month", { month: formatMonth(month.month) }),
    current: month.month === currentMonth,
    parts: DECISIONS.map((decision) => ({
      key: decision,
      label: td(`decision.${decision}`),
      value: size(month.amounts[decision]),
      display: t("million", { value: million(month.amounts[decision]) }),
      color: DECISION_COLOR[decision],
    })),
    extra:
      size(month.paidMillion) > 0 ? (
        <div style={{ marginTop: 4, fontSize: 12 }}>
          {t("months.paid")}:{" "}
          <b>{t("million", { value: million(month.paidMillion) })}</b>
        </div>
      ) : undefined,
  }));

  const attention = allAttention
    ? data.attention
    : data.attention.slice(0, ATTENTION_PREVIEW);

  return (
    <div className={styles.dashboard} data-testid="dashboard">
      <WelcomeBanner user={user} data={data} tasks={tasks} />
      <Typography.Text type="secondary" className={styles.updated}>
        {t("updated", { at: formatDateTime(data.generatedAt) })} ·{" "}
        {t("today", { date: formatDate(data.today) })}
      </Typography.Text>

      <StatisticsCard
        hideCard
        variant="stacked"
        statShadow={false}
        rowGutter={12}
        data={[
          ...(myTasks !== null
            ? [
                {
                  key: "myTurn",
                  title: t("kpi.myTurn"),
                  value: myTasks,
                  description: lateTasks
                    ? t("kpi.myTurnHint", { count: lateTasks })
                    : t("kpi.myTurnClear"),
                  backgroundColor: STAT_TONE.blue.bg,
                  valueColor: STAT_TONE.blue.value,
                  onClick: () => navigate("/tasks"),
                  testId: "kpi-my-turn",
                },
              ]
            : []),
          {
            key: "contracts",
            title: t("kpi.contracts"),
            value: data.contractCount,
            description: t("kpi.contractsHint", {
              active:
                status("PENDING_CONDITIONS") +
                status("NEEDS_REVIEW") +
                status("ALL_MILESTONES_ELIGIBLE"),
              signing: status("AWAITING_SIGNATURE"),
            }),
            backgroundColor: STAT_TONE.indigo.bg,
            valueColor: STAT_TONE.indigo.value,
            onClick: listOf("/contracts"),
            testId: "kpi-contracts",
          },
          {
            key: "paid",
            title: t("kpi.paid"),
            value: million(amounts.paidMillion),
            unit: t("unit"),
            description: t("kpi.paidHint", {
              pct: pct(amounts.paidMillion),
              count: milestones.paid,
            }),
            backgroundColor: STAT_TONE.sky.bg,
            valueColor: STAT_TONE.sky.value,
            testId: "kpi-paid",
          },
          {
            key: "payable",
            title: t("kpi.payable"),
            value: million(amounts.payableMillion),
            unit: t("unit"),
            description: t("kpi.payableHint", { count: milestones.payable }),
            backgroundColor: STAT_TONE.green.bg,
            valueColor: STAT_TONE.green.value,
            testId: "kpi-payable",
          },
          {
            key: "held",
            title: t("kpi.held"),
            value: million(amounts.heldMillion),
            unit: t("unit"),
            description: t("kpi.heldHint", {
              count: milestones.held,
              overdue: milestones.overdue,
            }),
            backgroundColor: STAT_TONE.violet.bg,
            valueColor: STAT_TONE.violet.value,
            testId: "kpi-held",
          },
          {
            key: "penalty",
            title: t("kpi.penalty"),
            value: million(amounts.penaltyMillion),
            unit: t("unit"),
            description: t("kpi.penaltyHint", {
              rejected: million(amounts.rejectedMillion),
            }),
            backgroundColor: STAT_TONE.orange.bg,
            valueColor: STAT_TONE.orange.value,
            testId: "kpi-penalty",
          },
        ].map((item) => ({
          ...item,
          colSpan: { xs: 12, md: 8, xl: myTasks !== null ? 4 : 24 / 5 },
        }))}
      />

      <Block
        title={t("money.title")}
        subtitle={t("money.caption", {
          planned: million(amounts.plannedMillion),
          count: milestones.total,
        })}
      >
        <SegmentedBar
          parts={moneyParts}
          label={t("money.label")}
          testId="dashboard-money"
        />
      </Block>

      <Row gutter={[24, 24]}>
        <Col xs={24} xl={15}>
          <Block title={t("months.title")} subtitle={t("months.caption")}>
            {months.length ? (
              <StackedColumns
                data={months}
                series={DECISIONS.map((decision) => ({
                  key: decision,
                  label: td(`decision.${decision}`),
                  color: DECISION_COLOR[decision],
                }))}
                label={t("months.label")}
                height={280}
                onSelect={
                  canTasks
                    ? (month) =>
                        navigate(
                          `/tasks?${new URLSearchParams({ "f.dueMonth": month })}`,
                        )
                    : undefined
                }
                testId="dashboard-months"
              />
            ) : (
              <Empty description={t("months.empty")} />
            )}
          </Block>
        </Col>
        <Col xs={24} xl={9}>
          <Block title={t("calendar.title")} subtitle={t("calendar.caption")}>
            <DueCalendar items={data.dueItems} today={data.today} />
          </Block>
        </Col>
      </Row>

      <Row gutter={[24, 24]}>
        <Col xs={24} xl={15}>
          <Block
            id="dashboard-attention"
            title={t("attention.title")}
            subtitle={t("attention.caption", {
              count: data.attentionCount,
            })}
          >
            {attention.length ? (
              <>
                <ul
                  className={styles.attention}
                  data-testid="dashboard-attention"
                >
                  {attention.map((item, index) => (
                    <li
                      key={`${item.contractId}-${item.sequence}-${item.kind}-${index}`}
                    >
                      <Tag color={ATTENTION_COLOR[item.kind]}>
                        {t(`attention.kind.${item.kind}`)}
                      </Tag>
                      <Link
                        to={`/contracts/${item.contractId}/milestones/${item.sequence}/decision`}
                        className={styles.attentionLink}
                      >
                        {item.contractId} ·{" "}
                        {td("milestoneNo", { no: item.sequence })}
                      </Link>
                      <span className={styles.attentionMeta}>
                        {t("million", { value: million(item.amountMillion) })}
                        {item.dueDate
                          ? ` · ${t("attention.due", { date: formatDate(item.dueDate) })}`
                          : ""}
                      </span>
                      <Button
                        type="text"
                        size="small"
                        color={
                          item.kind === "OPEN_DISPUTE" ? "orange" : "primary"
                        }
                        variant="text"
                        icon={<ArrowRightOutlined />}
                        aria-label={t("attention.open")}
                        title={t("attention.open")}
                        onClick={() =>
                          navigate(
                            item.kind === "OPEN_DISPUTE"
                              ? `/contracts/${item.contractId}/milestones/${item.sequence}/dispute`
                              : `/contracts/${item.contractId}/milestones/${item.sequence}/decision`,
                          )
                        }
                      />
                    </li>
                  ))}
                </ul>
                {data.attention.length > ATTENTION_PREVIEW ? (
                  <Button type="link" onClick={onToggleAttention}>
                    {allAttention
                      ? t("attention.showLess")
                      : t("attention.showAll", {
                          count: data.attention.length,
                        })}
                  </Button>
                ) : null}
              </>
            ) : (
              <Empty description={t("attention.none")} />
            )}
          </Block>
        </Col>
        <Col xs={24} xl={9}>
          <Space orientation="vertical" size={24} style={{ width: "100%" }}>
            <Block title={t("reasons.title")}>
              {data.holdReasons.length ? (
                <BarList
                  testId="dashboard-reasons"
                  data={data.holdReasons.map((reason) => ({
                    key: reason.reason,
                    label: td(`reason.${reason.reason}`),
                    value: size(reason.amountMillion),
                    display: t("reasons.value", {
                      amount: million(reason.amountMillion),
                      count: reason.milestones,
                    }),
                    color: "var(--viz-held)",
                  }))}
                />
              ) : (
                <Empty description={t("reasons.none")} />
              )}
            </Block>
            <Block
              title={t("status.title")}
              subtitle={canList ? t("status.caption") : undefined}
            >
              <BarList
                testId="dashboard-status"
                data={STATUS_ORDER.filter((key) => status(key) > 0).map(
                  (key) => ({
                    key,
                    label: td(`contractStatus.${key}`),
                    value: status(key),
                    display: status(key),
                    color: "var(--viz-paid)",
                  }),
                )}
                onSelect={
                  canList
                    ? (key) =>
                        navigate(
                          `/contracts?${new URLSearchParams({ "f.status": key })}`,
                        )
                    : undefined
                }
              />
            </Block>
            <Block title={t("decisions.title")}>
              <BarList
                testId="dashboard-decisions"
                data={DECISIONS.map((decision) => ({
                  key: decision,
                  label: td(`decision.${decision}`),
                  value: data.byDecision[decision] ?? 0,
                  display: data.byDecision[decision] ?? 0,
                  color: DECISION_COLOR[decision],
                }))}
              />
            </Block>
          </Space>
        </Col>
      </Row>

      <Block
        title={t("contracts.title")}

        extra={
          canList ? (
            <Link to="/contracts">
              {t("contracts.all")} <ArrowRightOutlined />
            </Link>
          ) : undefined
        }
      >
        <Table<ContractSummary>
          size="small"
          rowKey="contractId"
          pagination={false}
          scroll={{ x: 900 }}
          dataSource={data.contracts}
          data-testid="dashboard-contracts"
          columns={[
            {
              key: "contract",
              title: t("contracts.columns.contract"),
              width: 260,
              render: (_, row) => (
                <Link to={`/contracts/${row.contractId}`}>
                  <b>{row.contractId}</b> · {row.title}
                </Link>
              ),
            },
            {
              key: "status",
              title: t("contracts.columns.status"),
              width: 150,
              render: (_, row) => <ContractStatusTag status={row.status} />,
            },
            {
              key: "progress",
              title: t("contracts.columns.progress"),
              width: 200,
              render: (_, row) => {
                const total = size(row.plannedMillion);
                const paid = total ? (size(row.paidMillion) / total) * 100 : 0;
                const ready = total
                  ? (size(row.payableMillion) / total) * 100
                  : 0;
                return (
                  <div>
                    <Progress
                      percent={Math.round(paid + ready)}
                      success={{ percent: Math.round(paid) }}
                      showInfo={false}
                      size="small"
                    />
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {t("contracts.progressText", {
                        ready: Math.round(paid + ready),
                        paid: million(row.paidMillion),
                        planned: million(row.plannedMillion),
                      })}
                    </Typography.Text>
                  </div>
                );
              },
            },
            {
              key: "held",
              title: t("contracts.columns.held"),
              width: 170,
              align: "right",
              render: (_, row) =>
                row.held
                  ? t("contracts.heldValue", {
                      amount: million(row.heldMillion),
                      count: row.held,
                    })
                  : "—",
            },
            {
              key: "issues",
              title: t("contracts.columns.issues"),
              width: 170,
              render: (_, row) =>
                row.overdue || row.openDisputes ? (
                  <Space size={4} wrap>
                    {row.overdue ? (
                      <Tag color="volcano" style={{ margin: 0 }}>
                        {t("contracts.overdue", { count: row.overdue })}
                      </Tag>
                    ) : null}
                    {row.openDisputes ? (
                      <Tag color="error" style={{ margin: 0 }}>
                        {t("contracts.disputes", { count: row.openDisputes })}
                      </Tag>
                    ) : null}
                  </Space>
                ) : (
                  <Typography.Text type="secondary">
                    {t("contracts.noIssue")}
                  </Typography.Text>
                ),
            },
            {
              key: "nextDue",
              title: t("contracts.columns.nextDue"),
              width: 120,
              render: (_, row) => (row.nextDue ? formatDate(row.nextDue) : "—"),
            },
            {
              key: "actions",
              width: 84,
              fixed: "right",
              render: (_, row) => (
                <TableRowActions
                  primary={{
                    label: t("contracts.open"),
                    icon: <ArrowRightOutlined />,
                    onClick: () => navigate(`/contracts/${row.contractId}`),
                  }}
                  menu={
                    canActivity
                      ? [
                          {
                            key: "activity",
                            icon: <AuditOutlined />,
                            label: t("contracts.activity"),
                            onClick: () =>
                              navigate(
                                `/activity-log?${new URLSearchParams({ "f.contractCode": row.contractId })}`,
                              ),
                          },
                        ]
                      : undefined
                  }
                />
              ),
            },
          ]}
        />
      </Block>
    </div>
  );
}

/** A titled part of the dashboard: heading and caption on the left, an optional link on the right. */
function Block({
  id,
  title,
  subtitle,
  extra,
  children,
}: {
  id?: string;
  title: string;
  subtitle?: string;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className={styles.block}>
      <header className={styles.blockHead}>
        <div>
          <h2 className={styles.blockTitle}>{title}</h2>
          {subtitle ? <p className={styles.blockCaption}>{subtitle}</p> : null}
        </div>
        {extra}
      </header>
      {children}
    </section>
  );
}

/** Months with no due milestone become zero columns between the first and the last month. */
function fillMonths(
  months: DashboardView["byMonth"],
): DashboardView["byMonth"] {
  if (months.length < 2) return months;
  const byKey = new Map(months.map((m) => [m.month, m]));
  const zero = Object.fromEntries(DECISIONS.map((d) => [d, "0.00"])) as Record<
    Decision,
    string
  >;
  const out: DashboardView["byMonth"] = [];
  let [year, month] = months[0].month.split("-").map(Number);
  const last = months[months.length - 1].month;
  for (let guard = 0; guard < 240; guard++) {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    out.push(
      byKey.get(key) ?? { month: key, amounts: zero, paidMillion: "0.00" },
    );
    if (key >= last) break;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return out;
}
