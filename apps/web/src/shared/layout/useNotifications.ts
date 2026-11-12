import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App } from "antd";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import type { ActivityEntry, TaskRow } from "@codecash/contracts";
import { listActivity } from "../api/domain";
import { listPendingTasks } from "../api/tasks.api";
import { routeAllowed } from "./navConfig";

/** Tasks are what the user must do: checked often. */
const TASKS_EVERY_MS = 30_000;
/** Updates are what others did in the user's scope: checked a little less often. */
const UPDATES_EVERY_MS = 60_000;
/** Newest updates kept in the drawer; older ones live in the activity log. */
const UPDATES_LIMIT = 30;

const seenKey = (userId: string) => `codecash.notifications.seen.${userId}`;

function readSeen(userId: string): string | null {
  try {
    return localStorage.getItem(seenKey(userId));
  } catch {
    return null;
  }
}

function writeSeen(userId: string, at: string) {
  try {
    localStorage.setItem(seenKey(userId), at);
  } catch {
    /* Storage blocked: unread marks then last for this page only. */
  }
}

export interface Notifications {
  /** Open tasks of the user, as the task inbox shows them. */
  tasks: TaskRow[];
  tasksLoading: boolean;
  /** Recent activity by others in the user's scope, newest first (the API scopes it). */
  updates: ActivityEntry[];
  updatesLoading: boolean;
  /** Ids of updates newer than the last time the user marked them read. */
  unread: ReadonlySet<string>;
  /**
   * The number on the bell: the user's MINE tasks only, as the business spec requires
   * (docs/NGHIEP_VU.md). Unread updates show as a dot when there is no number.
   */
  badge: number;
  /** Some update from others has not been read yet. */
  hasUnread: boolean;
  markAllRead: () => void;
  canTasks: boolean;
  canUpdates: boolean;
}

/**
 * One source for the bell, the drawer and the overview: the user's tasks and what others did
 * recently, both refreshed in the background. "Read" is a per-browser marker (the newest update
 * time the user has seen), a viewing convenience only: it never hides a task, and tasks count
 * until they are done. A task that appears while the app is open raises a short notice.
 */
export function useNotifications(user: {
  id: string;
  permissions: readonly string[];
}): Notifications {
  const { t } = useTranslation("common");
  const { t: td } = useTranslation("domain");
  const { notification } = App.useApp();
  const navigate = useNavigate();
  const canTasks = routeAllowed("/tasks", user.permissions);
  const canUpdates = routeAllowed("/activity-log", user.permissions);

  const tasks = useQuery({
    queryKey: ["pending-tasks", user.id],
    queryFn: listPendingTasks,
    enabled: canTasks,
    refetchInterval: TASKS_EVERY_MS,
  });
  const updates = useQuery({
    queryKey: ["notification-updates", user.id],
    queryFn: () =>
      listActivity({
        page: 1,
        limit: UPDATES_LIMIT,
        filters: { mine: [false] },
        sortBy: "at",
        sortOrder: "desc",
      }),
    enabled: canUpdates,
    refetchInterval: UPDATES_EVERY_MS,
    select: (page) => page.items,
  });

  const [seenAt, setSeenAt] = useState(() => readSeen(user.id));
  const newest = updates.data?.[0]?.at;
  // First visit on this browser: start from "everything so far is read", not from a backlog.
  useEffect(() => {
    if (seenAt === null && updates.isSuccess) {
      const at = newest ?? new Date().toISOString();
      writeSeen(user.id, at);
      setSeenAt(at);
    }
  }, [seenAt, updates.isSuccess, newest, user.id]);

  const unread = useMemo(
    () =>
      new Set(
        seenAt === null
          ? []
          : (updates.data ?? [])
              .filter((entry) => entry.at > seenAt)
              .map((entry) => entry.id),
      ),
    [updates.data, seenAt],
  );

  const markAllRead = useCallback(() => {
    const at = newest ?? new Date().toISOString();
    writeSeen(user.id, at);
    setSeenAt(at);
  }, [newest, user.id]);

  // A notice for each refresh that brings new tasks (not for the first load).
  const known = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!tasks.data) return;
    const ids = new Set(tasks.data.map((task) => task.id));
    const before = known.current;
    known.current = ids;
    if (!before) return;
    const fresh = tasks.data.filter((task) => !before.has(task.id));
    if (!fresh.length) return;
    const first = fresh[0];
    notification.info({
      key: "new-tasks",
      title: t("notifications.newTasks", { count: fresh.length }),
      description: [
        td(`taskKind.${first.kind}`),
        first.sequence
          ? `${first.contractId} · ${td("milestoneNo", { no: first.sequence })}`
          : first.contractId,
      ].join(" · "),
      placement: "bottomRight",
      duration: 8,
      onClick: () => {
        notification.destroy("new-tasks");
        navigate(fresh.length > 1 ? "/tasks" : first.href);
      },
      style: { cursor: "pointer" },
    });
  }, [tasks.data, notification, navigate, t, td]);

  const taskList = tasks.data ?? [];
  return {
    tasks: taskList,
    tasksLoading: canTasks && tasks.isPending,
    updates: updates.data ?? [],
    updatesLoading: canUpdates && updates.isPending,
    unread,
    badge: taskList.length,
    hasUnread: unread.size > 0,
    markAllRead,
    canTasks,
    canUpdates,
  };
}
