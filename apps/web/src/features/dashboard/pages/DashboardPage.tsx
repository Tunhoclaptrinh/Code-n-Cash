import { useState, type ReactNode } from "react";
import {
  Button,
  Empty,
  Grid,
  Progress,
  Segmented,
  Space,
  Table,
  Tag,
  Tooltip,
} from "antd";
import {
  ArrowRightOutlined,
  AuditOutlined,
  CheckCircleOutlined,
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
  Donut,
  Legend,
  SegmentedBar,
  StackedColumns,
  type ChartPart,
} from "../components/charts";
import { DueCalendar } from "../components/DueCalendar";
import { WelcomeBanner } from "../components/WelcomeBanner";
import { fillMonths } from "../lib/months";
import styles from "./DashboardPage.module.css";

type ContractSummary = DashboardView["contracts"][number];
type Attention = DashboardView["attention"][number];

/** Near real time: the overview refreshes on its own while it is open. */
const REFRESH_MS = 30_000;
/** Plot height of the monthly chart, sized to its fixed-height tile. */
const CHART_HEIGHT = 322;
/** Rows of the "most money held" table; the full list is one click away. */
const TOP_CONTRACTS = 8;

type Spread = "status" | "decision";

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
/** Fixed categorical slot per status, so a status keeps its colour whatever else is shown. */
const STATUS_COLOR: Record<ContractSummary["status"], string> = {
  AWAITING_SIGNATURE: "var(--viz-c1)",
  PENDING_CONDITIONS: "var(--viz-c2)",
  NEEDS_REVIEW: "var(--viz-c3)",
  ALL_MILESTONES_ELIGIBLE: "var(--viz-c4)",
  CLOSED: "var(--viz-c5)",
  DRAFT: "var(--viz-c6)",
};

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
      bare
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
}: {
  data: DashboardView;
  myTasks: number | null;
  tasks: TaskRow[] | null;
  lateTasks: number;
  canList: boolean;
  canTasks: boolean;
  canActivity: boolean;
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

  const [spread, setSpread] = useState<Spread>("status");
  // On a phone the table keeps the contract, the money held and the action; the rest is a tap away.
  const wideTable = Grid.useBreakpoint().md !== false;

  const series = DECISIONS.map((decision) => ({
    key: decision,
    label: td(`decision.${decision}`),
    color: DECISION_COLOR[decision],
  }));

  return (
    <div className={styles.dashboard} data-testid="dashboard">
      <WelcomeBanner user={user} data={data} tasks={tasks} />

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

      <div className={styles.grid}>
        <Tile
          className={styles.money}
          title={t("money.title")}
          subtitle={t("money.caption", {
            planned: million(amounts.plannedMillion),
            count: milestones.total,
          })}
          extra={
            <Legend
              inline
              total={planned}
              parts={moneyParts.map((part) => ({ ...part, display: "" }))}
            />
          }
        >
          <SegmentedBar
            parts={moneyParts}
            legend={false}
            label={t("money.label")}
            testId="dashboard-money"
          />
        </Tile>

        <Tile
          className={styles.months}
          title={t("months.title")}
          subtitle={t("months.caption")}
          extra={
            <Legend
              inline
              parts={series.map((s) => ({ ...s, value: 0, display: "" }))}
            />
          }
        >
          {months.length ? (
            <StackedColumns
              data={months}
              series={series}
              legend={false}
              label={t("months.label")}
              height={CHART_HEIGHT}
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
        </Tile>

        <Tile className={styles.calendar}>
          <DueCalendar items={data.dueItems} today={data.today} />
        </Tile>

        <Tile
          id="dashboard-attention"
          className={styles.attentionTile}
          title={t("attention.title")}
          extra={
            data.attentionCount ? (
              <span className={styles.count}>{data.attentionCount}</span>
            ) : undefined
          }
        >
          {data.attention.length ? (
            <ul className={styles.attention} data-testid="dashboard-attention">
              {data.attention.map((item, index) => {
                const href = `/contracts/${item.contractId}/milestones/${item.sequence}/${
                  item.kind === "OPEN_DISPUTE" ? "dispute" : "decision"
                }`;
                return (
                  <li
                    key={`${item.contractId}-${item.sequence}-${item.kind}-${index}`}
                    data-kind={item.kind}
                  >
                    <Link to={href} className={styles.attentionLink}>
                      {item.contractId} ·{" "}
                      {td("milestoneNo", { no: item.sequence })}
                    </Link>
                    <span className={styles.attentionAmount}>
                      {t("million", { value: million(item.amountMillion) })}
                    </span>
                    <span className={styles.attentionKind}>
                      <Tag color={ATTENTION_COLOR[item.kind]}>
                        {t(`attention.kind.${item.kind}`)}
                      </Tag>
                      {item.dueDate
                        ? t("attention.due", { date: formatDate(item.dueDate) })
                        : null}
                    </span>
                    <Button
                      size="small"
                      color={
                        item.kind === "OPEN_DISPUTE" ? "orange" : "primary"
                      }
                      variant="text"
                      icon={<ArrowRightOutlined />}
                      aria-label={t("attention.open")}
                      title={t("attention.open")}
                      onClick={() => navigate(href)}
                      className={styles.attentionGo}
                    />
                  </li>
                );
              })}
            </ul>
          ) : (
            <Calm text={t("attention.none")} />
          )}
        </Tile>

        <Tile className={styles.reasons} title={t("reasons.title")}>
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
            <Calm text={t("reasons.none")} />
          )}
        </Tile>

        <Tile
          className={styles.spread}
          title={t("spread.title")}
          extra={
            <Segmented
              size="small"
              value={spread}
              onChange={(value) => setSpread(value as Spread)}
              options={[
                { value: "status", label: t("spread.status") },
                { value: "decision", label: t("spread.decision") },
              ]}
              data-testid="dashboard-spread"
            />
          }
        >
          {spread === "status" ? (
            <Donut
              testId="dashboard-status"
              label={t("spread.statusLabel")}
              total={data.contractCount}
              caption={t("spread.contracts")}
              data={STATUS_ORDER.filter((key) => status(key) > 0).map(
                (key) => ({
                  key,
                  label: td(`contractStatus.${key}`),
                  value: status(key),
                  display: status(key),
                  color: STATUS_COLOR[key],
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
          ) : (
            <Donut
              testId="dashboard-decisions"
              label={t("spread.decisionLabel")}
              total={milestones.total}
              caption={t("spread.milestones")}
              data={DECISIONS.map((decision) => ({
                key: decision,
                label: td(`decision.${decision}`),
                value: data.byDecision[decision] ?? 0,
                display: data.byDecision[decision] ?? 0,
                color: DECISION_COLOR[decision],
              }))}
            />
          )}
          {spread === "status" && canList ? (
            <p className={styles.hint}>{t("status.caption")}</p>
          ) : null}
        </Tile>

        <Tile
          className={styles.contracts}
          title={t("contracts.title")}
          extra={
            canList ? (
              <Link to="/contracts" className={styles.allLink}>
                {t("contracts.all")} <ArrowRightOutlined />
              </Link>
            ) : undefined
          }
        >
          <Table<ContractSummary>
            size="small"
            rowKey="contractId"
            pagination={false}
            tableLayout="fixed"
            scroll={wideTable ? { x: 1132 } : undefined}
            dataSource={data.contracts.slice(0, TOP_CONTRACTS)}
            data-testid="dashboard-contracts"
            columns={[
              {
                key: "contract",
                title: t("contracts.columns.contract"),
                width: wideTable ? 300 : undefined,
                ellipsis: { showTitle: false },
                render: (_, row) => (
                  <Link
                    to={`/contracts/${row.contractId}`}
                    title={`${row.contractId} · ${row.title}`}
                  >
                    <b>{row.contractId}</b>
                    <span className={styles.contractTitle}> · {row.title}</span>
                  </Link>
                ),
              },
              {
                key: "status",
                title: t("contracts.columns.status"),
                responsive: ["md"],
                width: 168,
                render: (_, row) => <ContractStatusTag status={row.status} />,
              },
              {
                key: "progress",
                title: t("contracts.columns.progress"),
                responsive: ["md"],
                width: 176,
                render: (_, row) => {
                  const total = size(row.plannedMillion);
                  const paid = total
                    ? (size(row.paidMillion) / total) * 100
                    : 0;
                  const ready = total
                    ? (size(row.payableMillion) / total) * 100
                    : 0;
                  return (
                    <Tooltip
                      title={t("contracts.progressText", {
                        ready: Math.round(paid + ready),
                        paid: million(row.paidMillion),
                        planned: million(row.plannedMillion),
                      })}
                    >
                      <Progress
                        percent={Math.round(paid + ready)}
                        success={{ percent: Math.round(paid) }}
                        size="small"
                        className={styles.progress}
                      />
                    </Tooltip>
                  );
                },
              },
              {
                key: "held",
                title: t("contracts.columns.held"),
                width: 150,
                align: "right",
                render: (_, row) =>
                  row.held ? (
                    <span className={styles.num}>
                      {million(row.heldMillion)}
                      <span className={styles.numSub}>
                        {t("contracts.heldCount", { count: row.held })}
                      </span>
                    </span>
                  ) : (
                    <span className={styles.none}>—</span>
                  ),
              },
              {
                key: "issues",
                title: t("contracts.columns.issues"),
                responsive: ["md"],
                width: 150,
                render: (_, row) =>
                  row.overdue || row.openDisputes ? (
                    <Space size={4} wrap={false}>
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
                    <span className={styles.none}>—</span>
                  ),
              },
              {
                key: "nextDue",
                title: t("contracts.columns.nextDue"),
                responsive: ["md"],
                width: 112,
                render: (_, row) =>
                  row.nextDue ? (
                    <span className={styles.num}>
                      {formatDate(row.nextDue)}
                    </span>
                  ) : (
                    <span className={styles.none}>—</span>
                  ),
              },
              {
                key: "actions",
                width: 76,
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
        </Tile>
      </div>
    </div>
  );
}

/**
 * One tile of the dashboard grid: a white card with a heading row (title, short caption, and an
 * optional control on the right) over a body that fills the tile. Tiles in a row share a fixed
 * height set by the grid; a body taller than that scrolls inside the tile.
 */
function Tile({
  id,
  className,
  title,
  subtitle,
  extra,
  children,
}: {
  id?: string;
  className?: string;
  title?: string;
  subtitle?: string;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className={`${styles.tile} ${className ?? ""}`} data-tile>
      {title ? (
        <header className={styles.tileHead}>
          <div className={styles.tileHeading}>
            <h2 className={styles.tileTitle}>{title}</h2>
            {subtitle ? <p className={styles.tileCaption}>{subtitle}</p> : null}
          </div>
          {extra ? <div className={styles.tileExtra}>{extra}</div> : null}
        </header>
      ) : null}
      <div className={styles.tileBody}>{children}</div>
    </section>
  );
}

/** A quiet "nothing here" line, centred in the tile. */
function Calm({ text }: { text: string }) {
  return (
    <p className={styles.calm}>
      <CheckCircleOutlined /> {text}
    </p>
  );
}
