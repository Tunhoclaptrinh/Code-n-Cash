import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Typography, Button, Tag, Alert } from "antd";
import { DataTable } from "@codecash/ui";
import { useCurrentUser } from "@/shared/auth/session";
import { AppShell } from "@/shared/layout/AppShell";
import { formatDate, formatMillionVnd, formatTime } from "@/shared/lib/format";
import { getTaskInbox } from "../api/tasks.api";
import { evidenceName, lowerCase } from "../lib/display";
import type { TaskRow } from "../types";
export default function TaskInboxPage() {
  const { t, i18n } = useTranslation("milestones");
  const { t: tc } = useTranslation("common");
  const user = useCurrentUser(),
    navigate = useNavigate();
  const inbox = useQuery({
    queryKey: ["milestones", "inbox", user.id],
    queryFn: () => getTaskInbox(user.id),
  });
  const name = (r: TaskRow) =>
    r.heading.kind === "MILESTONE"
      ? t(`milestoneKind.${r.heading.milestoneKind}`)
      : "";
  const columns = [
    {
      key: "task",
      title: t("inbox.columns.task"),
      render: (_: unknown, r: TaskRow) => (
        <b>
          {t(`inbox.task.${r.kind}`, {
            milestone: lowerCase(name(r), i18n.language),
          })}
        </b>
      ),
    },
    {
      key: "contract",
      title: t("inbox.columns.contractAndMilestone"),
      render: (_: unknown, r: TaskRow) => (
        <>
          {r.heading.kind === "MILESTONE"
            ? t("inbox.headingMilestone", {
                contractId: r.contractId,
                no: r.heading.no,
                name: name(r),
              })
            : t("inbox.headingTitle", {
                contractId: r.contractId,
                title: r.heading.title,
              })}
          <div>
            {r.subtitle.kind === "CONTRACT_AMOUNT"
              ? t("inbox.contractAmount", {
                  title: r.subtitle.title,
                  amount: formatMillionVnd(r.subtitle.amountMillion),
                })
              : r.subtitle.kind === "BUYER_SIGNED"
                ? t("inbox.buyerSigned", { time: formatTime(r.subtitle.at) })
                : t("inbox.requestReason", { reason: r.subtitle.text })}
          </div>
        </>
      ),
    },
    {
      key: "due",
      title: t("inbox.columns.due"),
      render: (_: unknown, r: TaskRow) => (
        <>
          {formatDate(r.dueDate)}
          {r.overdueDays > 0 ? (
            <div>{t("inbox.overdue", { count: r.overdueDays })}</div>
          ) : null}
        </>
      ),
    },
    {
      key: "required",
      title: t("inbox.columns.required"),
      render: (_: unknown, r: TaskRow) => (
        <ul>
          {r.requirements.map((x) => (
            <li key={x}>{evidenceName(t, x)}</li>
          ))}
        </ul>
      ),
    },
    {
      key: "status",
      title: t("inbox.columns.status"),
      render: (_: unknown, r: TaskRow) => (
        <Tag color={r.overdueDays ? "warning" : "blue"}>
          {t(`inbox.badge.${r.badge}`)}
        </Tag>
      ),
    },
    {
      key: "actions",
      title: t("inbox.columns.actions"),
      render: (_: unknown, r: TaskRow) => (
        <Button
          type={r.primary ? "primary" : "default"}
          onClick={() => navigate(r.href)}
        >
          {t(`inbox.action.${r.kind}`)}
        </Button>
      ),
    },
  ];
  return (
    <AppShell active="tasks" breadcrumb={[{ label: tc("nav.tasks") }]}>
      <Typography.Title level={2}>{t("inbox.title")}</Typography.Title>
      <Typography.Paragraph>
        {t("inbox.subtitle", { count: inbox.data?.length ?? 0 })}
      </Typography.Paragraph>
      <Typography.Paragraph>{t("inbox.intro")}</Typography.Paragraph>
      {inbox.isError ? (
        <Alert type="error" title={tc("common.loadError")} />
      ) : null}
      <DataTable<TaskRow>
        rowKey="id"
        dataSource={inbox.data ?? []}
        columns={columns}
        loading={inbox.isPending}
      />
      <Typography.Paragraph>{t("inbox.footer")}</Typography.Paragraph>
    </AppShell>
  );
}
