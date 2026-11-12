import { useState, type ReactNode } from "react";
import { Badge, Button, Drawer, Empty, Segmented, Skeleton, Tag } from "antd";
import {
  AuditOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  FileProtectOutlined,
  FireOutlined,
  SettingOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import type {
  ActivityCategory,
  ActivityEntry,
  DashboardView,
  TaskRow,
} from "@codecash/contracts";
import { describeAction } from "@/features/audit/lib/activityText";
import { getDashboard } from "../api/domain";
import {
  formatDate,
  formatDateTime,
  formatDecimalString,
  formatTime,
} from "../lib/format";
import { routeAllowed } from "./navConfig";
import type { Notifications } from "./useNotifications";
import type { LiveStatus } from "./useLiveUpdates";
import styles from "./NotificationDrawer.module.css";

type Tab = "tasks" | "alerts" | "updates";
type Alert = DashboardView["attention"][number];
type Tone = "danger" | "warning" | "primary" | "success" | "neutral";

const CATEGORY: Record<ActivityCategory, { icon: ReactNode; tone: Tone }> = {
  SIGN: { icon: <EditOutlined />, tone: "primary" },
  EVIDENCE: { icon: <FileProtectOutlined />, tone: "primary" },
  APPROVAL: { icon: <CheckCircleOutlined />, tone: "success" },
  DISPUTE: { icon: <AuditOutlined />, tone: "danger" },
  SYSTEM: { icon: <SettingOutlined />, tone: "neutral" },
};
const ALERT_TONE: Record<Alert["kind"], Tone> = {
  OPEN_DISPUTE: "danger",
  OVERDUE: "danger",
  DUE_SOON: "warning",
  SEQUENCE_WARNING: "warning",
  LOW_CONFIDENCE: "warning",
};

/** Where an update leads, if the viewer may open it: the event's row, the milestone, the contract. */
function updateHref(e: ActivityEntry) {
  if (e.links.eventId)
    return `/contracts/${e.contractCode}/milestones/${e.milestoneNo}/decision?${new URLSearchParams({ event: e.links.eventId })}`;
  if (e.links.milestone)
    return `/contracts/${e.contractCode}/milestones/${e.milestoneNo}/decision`;
  if (e.links.contract) return `/contracts/${e.contractCode}`;
  return `/activity-log?${new URLSearchParams({ "f.contractCode": e.contractCode })}`;
}

const sameDay = (iso: string) =>
  new Date(iso).toDateString() === new Date().toDateString();

/**
 * Notification centre behind the header bell: the user's own tasks, warnings in their scope
 * (overdue, disputes, due soon) and what others recently did on their contracts. Everything is
 * read from the API, which decides scope and links; unread marks are a per-browser convenience.
 */
export function NotificationDrawer({
  open,
  userId,
  permissions,
  inboxPath,
  feed,
  live,
  onClose,
}: {
  open: boolean;
  userId: string;
  permissions: readonly string[];
  inboxPath: string;
  feed: Notifications;
  live: LiveStatus;
  onClose: () => void;
}) {
  const { t } = useTranslation("common");
  const { t: td } = useTranslation("domain");
  const { t: ta } = useTranslation("audit");
  const { t: tdash } = useTranslation("dashboard");
  const navigate = useNavigate();
  const canAlerts = routeAllowed("/dashboard", permissions);
  // Shares the overview's query: opening the drawer on the overview costs nothing.
  const overview = useQuery({
    queryKey: ["dashboard", userId],
    queryFn: getDashboard,
    enabled: open && canAlerts,
  });
  const alerts = overview.data?.attention ?? [];
  const tabs: Tab[] = [
    ...(feed.canTasks ? (["tasks"] as const) : []),
    ...(canAlerts ? (["alerts"] as const) : []),
    ...(feed.canUpdates ? (["updates"] as const) : []),
  ];
  const [chosen, setChosen] = useState<Tab | null>(null);
  // Open on what needs the user most: tasks, then unread updates, then warnings.
  const tab: Tab =
    chosen && tabs.includes(chosen)
      ? chosen
      : feed.tasks.length && tabs.includes("tasks")
        ? "tasks"
        : feed.unread.size && tabs.includes("updates")
          ? "updates"
          : (tabs[0] ?? "tasks");

  const go = (path: string) => {
    onClose();
    navigate(path);
  };
  const late = feed.tasks.filter((task) => task.overdueDays > 0);
  const waiting = feed.tasks.filter((task) => task.overdueDays <= 0);

  const taskItem = (task: TaskRow) => (
    <Item
      key={task.id}
      tone={task.overdueDays > 0 ? "danger" : "primary"}
      icon={task.overdueDays > 0 ? <FireOutlined /> : <ClockCircleOutlined />}
      title={td(`taskKind.${task.kind}`)}
      subject={[
        task.contractId,
        task.sequence ? td("milestoneNo", { no: task.sequence }) : null,
        task.milestoneType ? td(`milestoneType.${task.milestoneType}`) : null,
      ]
        .filter(Boolean)
        .join(" · ")}
      meta={
        task.overdueDays > 0 ? (
          <Tag color="error">{td("overdue", { count: task.overdueDays })}</Tag>
        ) : task.dueDate ? (
          <span>
            {t("notifications.due", { date: formatDate(task.dueDate) })}
          </span>
        ) : null
      }
      onClick={() => go(task.href)}
      testId="notification-item"
    />
  );

  const body = (() => {
    if (tab === "tasks") {
      if (feed.tasksLoading) return <Skeleton active paragraph={{ rows: 4 }} />;
      if (!feed.tasks.length)
        return <Calm text={t("notifications.empty.tasks")} />;
      return (
        <>
          {late.length ? (
            <Group label={t("notifications.groups.late")}>
              {late.map(taskItem)}
            </Group>
          ) : null}
          {waiting.length ? (
            <Group label={t("notifications.groups.waiting")}>
              {waiting.map(taskItem)}
            </Group>
          ) : null}
        </>
      );
    }
    if (tab === "alerts") {
      if (overview.isPending)
        return <Skeleton active paragraph={{ rows: 4 }} />;
      if (!alerts.length)
        return <Calm text={t("notifications.empty.alerts")} />;
      return (
        <Group>
          {alerts.map((alert, index) => (
            <Item
              key={`${alert.contractId}-${alert.sequence}-${alert.kind}-${index}`}
              tone={ALERT_TONE[alert.kind]}
              icon={
                ALERT_TONE[alert.kind] === "danger" ? (
                  <ExclamationCircleOutlined />
                ) : (
                  <WarningOutlined />
                )
              }
              title={tdash(`attention.kind.${alert.kind}`)}
              subject={`${alert.contractId} · ${td("milestoneNo", { no: alert.sequence })}`}
              meta={
                <span>
                  {tdash("million", {
                    value: formatDecimalString(alert.amountMillion),
                  })}
                  {alert.dueDate
                    ? ` · ${tdash("attention.due", { date: formatDate(alert.dueDate) })}`
                    : ""}
                </span>
              }
              onClick={() =>
                go(
                  `/contracts/${alert.contractId}/milestones/${alert.sequence}/${
                    alert.kind === "OPEN_DISPUTE" ? "dispute" : "decision"
                  }`,
                )
              }
              testId="notification-alert"
            />
          ))}
        </Group>
      );
    }
    if (feed.updatesLoading) return <Skeleton active paragraph={{ rows: 4 }} />;
    if (!feed.updates.length)
      return <Calm text={t("notifications.empty.updates")} />;
    return (
      <Group>
        {feed.updates.map((entry) => (
          <Item
            key={entry.id}
            unread={feed.unread.has(entry.id)}
            tone={CATEGORY[entry.category].tone}
            icon={CATEGORY[entry.category].icon}
            title={entry.actor.displayName ?? ta("actorNames.SYSTEM")}
            subject={describeAction(ta, entry.action, { short: true })}
            meta={
              <span>
                {entry.milestoneNo === null
                  ? entry.contractCode
                  : `${entry.contractCode} · ${td("milestoneNo", { no: entry.milestoneNo })}`}
                {" · "}
                {sameDay(entry.at)
                  ? formatTime(entry.at)
                  : formatDateTime(entry.at)}
              </span>
            }
            onClick={() => go(updateHref(entry))}
            testId="notification-update"
          />
        ))}
      </Group>
    );
  })();

  const footer =
    tab === "updates"
      ? { label: t("notifications.openActivity"), to: "/activity-log" }
      : tab === "alerts"
        ? { label: t("notifications.openOverview"), to: "/dashboard" }
        : { label: t("topbar.openInbox"), to: inboxPath };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size={420}
      className={styles.drawer}
      title={
        <span className={styles.head}>
          <span className={styles.title}>
            {t("topbar.notifications")}
            <span
              className={styles.live}
              data-status={live}
              title={t(`notifications.live.${live}Hint`)}
              data-testid="notifications-live"
            >
              <i aria-hidden />
              {t(`notifications.live.${live}`)}
            </span>
          </span>
          {feed.canUpdates ? (
            <Button
              type="link"
              size="small"
              disabled={!feed.unread.size}
              onClick={feed.markAllRead}
              data-testid="notifications-read-all"
            >
              {t("notifications.markRead")}
            </Button>
          ) : null}
        </span>
      }
      footer={
        <Button block onClick={() => go(footer.to)}>
          {footer.label}
        </Button>
      }
    >
      {tabs.length > 1 ? (
        <Segmented<Tab>
          block
          value={tab}
          onChange={setChosen}
          className={styles.tabs}
          data-testid="notifications-tabs"
          options={tabs.map((key) => ({
            value: key,
            label: (
              <span className={styles.tabLabel}>
                {t(`notifications.tabs.${key}`)}
                <Badge
                  count={
                    key === "tasks"
                      ? feed.tasks.length
                      : key === "updates"
                        ? feed.unread.size
                        : alerts.length
                  }
                  size="small"
                  color={
                    key === "updates"
                      ? "blue"
                      : key === "alerts"
                        ? "orange"
                        : undefined
                  }
                  showZero={false}
                />
              </span>
            ),
          }))}
        />
      ) : null}
      <div className={styles.list} data-testid={`notifications-${tab}`}>
        {body}
      </div>
    </Drawer>
  );
}

function Group({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <section className={styles.group}>
      {label ? <h3 className={styles.groupLabel}>{label}</h3> : null}
      {children}
    </section>
  );
}

function Item({
  tone,
  icon,
  title,
  subject,
  meta,
  unread = false,
  onClick,
  testId,
}: {
  tone: Tone;
  icon: ReactNode;
  title: string;
  subject: string;
  meta?: ReactNode;
  unread?: boolean;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      className={styles.item}
      data-unread={unread || undefined}
      onClick={onClick}
      data-testid={testId}
    >
      <span className={styles.icon} data-tone={tone} aria-hidden>
        {icon}
      </span>
      <span className={styles.text}>
        <span className={styles.itemTitle}>{title}</span>
        <span className={styles.itemSubject}>{subject}</span>
        {meta ? <span className={styles.itemMeta}>{meta}</span> : null}
      </span>
      {unread ? <span className={styles.dot} aria-hidden /> : null}
    </button>
  );
}

function Calm({ text }: { text: string }) {
  return (
    <Empty
      image={Empty.PRESENTED_IMAGE_SIMPLE}
      description={text}
      className={styles.calm}
    />
  );
}
