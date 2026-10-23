import { Badge, Drawer, Empty, Skeleton, Tag, Typography } from "antd";
import { ClockCircleOutlined, InboxOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { BaseButton } from "@codecash/ui";
import { listPendingTasks, type PendingTask } from "../api/tasks.api";
import { formatDate } from "../lib/format";
import styles from "./NotificationDrawer.module.css";

/** Pending work for the signed-in user, opened from the header bell (UniFlow NotificationDrawer). */
export function NotificationDrawer({
  open,
  userId,
  inboxPath,
  onClose,
}: {
  open: boolean;
  userId: string;
  inboxPath: string;
  onClose: () => void;
}) {
  const { t } = useTranslation("common");
  const { t: td } = useTranslation("domain");
  const navigate = useNavigate();
  const tasks = useQuery({
    queryKey: ["pending-tasks", userId],
    queryFn: listPendingTasks,
  });
  const go = (path: string) => {
    onClose();
    navigate(path);
  };
  const title = (task: PendingTask) =>
    task.milestoneType
      ? `${td(`taskKind.${task.kind}`)} · ${td(`milestoneType.${task.milestoneType}`)}`
      : td(`taskKind.${task.kind}`);
  return (
    <Drawer
      open={open}
      onClose={onClose}
      size={400}
      title={
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <InboxOutlined />
          {t("topbar.notifications")}
          <Badge count={tasks.data?.length ?? 0} />
        </span>
      }
      footer={
        <BaseButton variant="secondary" block onClick={() => go(inboxPath)}>
          {t("topbar.openInbox")}
        </BaseButton>
      }
    >
      {tasks.isPending ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : tasks.data?.length ? (
        <div className={styles.list}>
          {tasks.data.map((task) => (
            <button
              key={task.id}
              type="button"
              className={styles.item}
              onClick={() => go(task.href)}
              data-testid="notification-item"
            >
              <span className={styles.itemTitle}>{title(task)}</span>
              <span className={styles.itemMeta}>
                <Typography.Text type="secondary">
                  {task.sequence
                    ? `${task.contractId} · ${td("milestoneNo", { no: task.sequence })}`
                    : task.contractId}
                </Typography.Text>
                {task.dueDate ? (
                  <Typography.Text type="secondary">
                    <ClockCircleOutlined /> {formatDate(task.dueDate)}
                  </Typography.Text>
                ) : null}
                {task.overdueDays > 0 ? (
                  <Tag color="error" style={{ margin: 0 }}>
                    {td("overdue", { count: task.overdueDays })}
                  </Tag>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <Empty description={t("topbar.noPendingTasks")} />
      )}
    </Drawer>
  );
}
