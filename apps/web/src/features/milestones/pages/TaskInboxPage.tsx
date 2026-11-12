import { TableRowActions, type ActionTone } from "@/shared/ui/TableRowActions";
import { ClickableCell } from "@/shared/ui/ClickableCell";
import { STAT_TONE } from "@/shared/ui/statTone";
import { useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Alert, Tag, Typography } from "antd";
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
import type {
  TaskGroup,
  TaskKind,
  TaskRow,
  TaskWaitingFor,
} from "@codecash/contracts";
import { listTasks } from "@/shared/api/domain";
import { useCurrentUser } from "@/shared/auth/session";
import { AppPage } from "@/shared/layout/AppPage";
import {
  formatDate,
  formatDecimalString,
  formatMonth,
} from "@/shared/lib/format";
import { useListQuery } from "@/shared/lib/useListQuery";
import { columnSearch } from "@/shared/ui/columnSearch";
import { OriginTag } from "@/shared/ui/DomainTags";
import { PersonChip } from "@/shared/ui/PersonChip";
import { MilestonePreviewLink } from "../components/PendingItems";
import styles from "./TaskInboxPage.module.css";

type Badge = TaskRow["badge"];
const BADGES: Badge[] = [
  "LATE_PENALTY_RISK",
  "YOUR_TURN",
  "MILESTONE_ON_HOLD",
  "ON_TIME",
];
const GROUPS: TaskGroup[] = ["MINE", "UPCOMING", "WAITING"];
const KINDS: TaskKind[] = [
  "SUBMIT_EVIDENCE",
  "RESUBMIT_EVIDENCE",
  "APPROVE_PAYMENT",
  "RESOLVE_DISPUTE",
  "TRANSFER_PAYMENT",
  "SIGN_CONTRACT",
  "COMPLETE_DRAFT",
  "REVIEW_EXCEPTION",
  "DECIDE_EXCEPTION",
  "FOLLOW_UP",
];
const badgeTag: Record<Badge, string> = {
  LATE_PENALTY_RISK: "error",
  YOUR_TURN: "processing",
  MILESTONE_ON_HOLD: "warning",
  ON_TIME: "success",
};
const groupTone = {
  MINE: STAT_TONE.blue,
  UPCOMING: STAT_TONE.violet,
  WAITING: STAT_TONE.amber,
} satisfies Record<TaskGroup, { bg: string; value: string }>;

/** "Phú Minh Technology JSC · Nhà cung cấp nộp Hoàn thành dịch vụ, Hoá đơn". */
function describeWaiting(t: TFunction, waiting: TaskWaitingFor): string {
  const subjects = waiting.subjects
    .map((subject) =>
      waiting.kind === "APPROVAL"
        ? t(`domain:approvalRole.${subject}`)
        : t(`domain:eventType.${subject}`),
    )
    .join(", ");
  const roles = waiting.roles
    .map((role) => t(`common:roles.${role}.name`))
    .join(" / ");
  return t("milestones:inbox.waiting", {
    who: [waiting.organizationName, roles].filter(Boolean).join(" · "),
    what: t(`milestones:inbox.waitingWhat.${waiting.kind}`, {
      subjects,
      count: waiting.subjects.length,
    }),
  });
}

/** "Phú Minh Technology JSC · Nhà cung cấp": the party and role a row waits for. */
const whoOf = (t: TFunction, waiting: TaskWaitingFor) =>
  [
    waiting.organizationName,
    waiting.roles.map((role) => t(`common:roles.${role}.name`)).join(" / "),
  ]
    .filter(Boolean)
    .join(" · ");

/**
 * Work for the signed-in user, from the same "what is left" items as each milestone screen:
 * what is their turn now, what comes once something else is done, and what they wait for.
 */
export default function TaskInboxPage() {
  const { t } = useTranslation("milestones");
  const { t: tc } = useTranslation("common");
  const { t: td } = useTranslation("domain");
  const user = useCurrentUser();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<TaskRow>();
  // One page at a time from the API; it opens on what is the user's turn now.
  const list = useListQuery<TaskRow>({
    syncUrl: true,
    auditExport: "tasks",
    key: ["pending-tasks", "list", user.id],
    fetch: listTasks,
    sort: { by: "rank", order: "asc" },
    filters: { group: ["MINE"] },
  });
  const { filters, setFilters } = list;
  const facets = list.data?.facets ?? {};
  const count = (key: string, value: string) =>
    facets[key]?.find((f) => f.value === value)?.count ?? 0;
  const kinds = KINDS.filter((kind) => count("kind", kind));
  const group =
    filters.group?.length === 1
      ? (String(filters.group[0]) as TaskGroup)
      : null;
  const late =
    filters.badge?.length === 1 && filters.badge[0] === "LATE_PENALTY_RISK";
  const tab = group ?? "ALL";

  // What is still needed; empty when the task name already says it.
  const what = (r: TaskRow) =>
    r.kind === "FOLLOW_UP" && r.waitingFor?.subjects.length
      ? r.waitingFor.subjects
          .map((subject) =>
            r.waitingFor?.kind === "APPROVAL"
              ? td(`approvalRole.${subject}`)
              : td(`eventType.${subject}`),
          )
          .join(", ")
      : r.eventTypes.length
        ? r.eventTypes.map((type) => td(`eventType.${type}`)).join(", ")
        : r.roles.length
          ? r.roles.map((role) => td(`approvalRole.${role}`)).join(", ")
          : "";
  const where = (r: TaskRow) =>
    r.sequence && r.milestoneType
      ? `${td("milestoneNo", { no: r.sequence })} · ${td(`milestoneType.${r.milestoneType}`)}`
      : r.contractTitle;
  const waited = (r: TaskRow) =>
    r.waitingDays === null
      ? null
      : r.waitingDays === 0
        ? t("inbox.waitedToday")
        : t(r.group === "WAITING" ? "inbox.waited" : "inbox.waitedYou", {
            count: r.waitingDays,
          });

  // Filters without the given keys, then with the given values: tabs and pills never stack.
  const withFilters = (next: Record<string, string[] | null>) => {
    const merged: typeof filters = { ...filters };
    for (const [key, values] of Object.entries(next))
      if (values) merged[key] = values;
      else delete merged[key];
    setFilters(merged);
  };
  // Tiles and tabs are one choice: a tile picks its tab, a second click on it shows every task.
  const changeTab = (key: string) =>
    withFilters({ badge: null, group: key === "ALL" ? null : [key] });
  const statistics: StatisticsItem[] = [
    {
      colSpan: { xs: 12, sm: 12, md: 6 },
      title: t("inbox.group.MINE"),
      value: count("group", "MINE"),
      backgroundColor: groupTone.MINE.bg,
      valueColor: groupTone.MINE.value,
      selected: group === "MINE" && !late,
      onClick: () => changeTab(group === "MINE" && !late ? "ALL" : "MINE"),
    },
    {
      colSpan: { xs: 12, sm: 12, md: 6 },
      title: t("inbox.badge.LATE_PENALTY_RISK"),
      value: count("badge", "LATE_PENALTY_RISK"),
      backgroundColor: STAT_TONE.red.bg,
      valueColor: STAT_TONE.red.value,
      selected: late,
      onClick: () =>
        withFilters({
          group: null,
          badge: late ? null : ["LATE_PENALTY_RISK"],
        }),
    },
    ...(["UPCOMING", "WAITING"] as const).map((key) => ({
      colSpan: { xs: 12, sm: 12, md: 6 },
      title: t(`inbox.group.${key}`),
      value: count("group", key),
      backgroundColor: groupTone[key].bg,
      valueColor: groupTone[key].value,
      selected: group === key && !late,
      onClick: () => changeTab(group === key && !late ? "ALL" : key),
    })),
  ];
  const filterConfig: FilterConfig[] = [
    {
      key: "dueMonth",
      label: t("inbox.columns.dueMonth"),
      type: "select",
      operators: ["eq"],
      options: (facets.dueMonth ?? [])
        .filter((f) => f.value)
        .map((f) => ({ value: f.value, label: formatMonth(f.value) })),
    },
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
        <ClickableCell onOpen={() => setDetail(r)}>
          <Typography.Text strong>
            {r.kind === "FOLLOW_UP" && r.waitingFor
              ? t(`inbox.followUp.${r.waitingFor.kind}`)
              : td(`taskKind.${r.kind}`)}
          </Typography.Text>
          {what(r) ? <div className={styles.secondary}>{what(r)}</div> : null}
          {r.group === "UPCOMING" && r.waitingFor ? (
            <div className={styles.after} data-testid="task-after">
              {t("inbox.after", { what: describeWaiting(t, r.waitingFor) })}
            </div>
          ) : null}
        </ClickableCell>
      ),
    },
    {
      ...list.column("contract"),
      title: t("inbox.columns.contract"),
      sorter: true,
      ...columnSearch(),
      render: (_: unknown, r: TaskRow) => (
        <>
          <Typography.Text strong>{r.contractId}</Typography.Text>
          <div>
            {r.sequence ? (
              <MilestonePreviewLink
                contractId={r.contractId}
                sequence={r.sequence}
              >
                {where(r)}
              </MilestonePreviewLink>
            ) : (
              where(r)
            )}
          </div>
          {r.sequence && r.milestoneType ? (
            <div className={styles.secondary}>{r.contractTitle}</div>
          ) : null}
        </>
      ),
    },
    {
      key: "who",
      title: t("inbox.columns.who"),
      render: (_: unknown, r: TaskRow) =>
        r.group === "WAITING" && r.waitingFor ? (
          <div className={styles.who}>
            <span className={styles.secondary}>{whoOf(t, r.waitingFor)}</span>
            <span className={styles.people}>
              {r.waitingFor.people.slice(0, 2).map((person) => (
                <PersonChip
                  key={person.userId}
                  person={person}
                  organizationName={r.waitingFor?.organizationName}
                />
              ))}
              {r.waitingFor.people.length > 2 ? (
                <span className={styles.secondary}>
                  +{r.waitingFor.people.length - 2}
                </span>
              ) : null}
            </span>
            {waited(r) ? (
              <span className={styles.secondary}>{waited(r)}</span>
            ) : null}
          </div>
        ) : (
          <div className={styles.who}>
            <Tag color="processing" style={{ margin: 0 }}>
              {tc("person.you")}
            </Tag>
            {waited(r) ? (
              <span className={styles.secondary}>{waited(r)}</span>
            ) : null}
          </div>
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
              <Typography.Text type="danger" style={{ fontSize: 13 }}>
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
      render: (badge: Badge, r: TaskRow) =>
        r.group === "MINE" ? (
          <Tag color={badgeTag[badge]}>{t(`inbox.badge.${badge}`)}</Tag>
        ) : (
          <Tag color={r.group === "UPCOMING" ? "purple" : "default"}>
            {t(`inbox.groupShort.${r.group}`)}
          </Tag>
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
      who: (r) =>
        r.waitingFor
          ? `${describeWaiting(t, r.waitingFor)}${r.waitingFor.people.length ? ` (${r.waitingFor.people.map((p) => p.name).join(", ")})` : ""}`
          : tc("person.you"),
      amount: (r) => r.amountMillion ?? "",
      dueDate: (r) => (r.dueDate ? formatDate(r.dueDate) : ""),
      badge: (r) =>
        r.group === "MINE"
          ? t(`inbox.badge.${r.badge}`)
          : t(`inbox.group.${r.group}`),
    },
    "tasks",
  );

  const primaryLabel = (r: TaskRow) => t(`inbox.action.${r.kind}`);
  // The row button's colour says what the step does (approve, resolve a problem, continue).
  const toneOf = (kind: TaskRow["kind"]): ActionTone =>
    kind === "APPROVE_PAYMENT" ||
    kind === "DECIDE_EXCEPTION" ||
    kind === "TRANSFER_PAYMENT" ||
    kind === "SIGN_CONTRACT"
      ? "success"
      : kind === "RESOLVE_DISPUTE" || kind === "REVIEW_EXCEPTION"
        ? "warning"
        : kind === "FOLLOW_UP"
          ? "neutral"
          : "primary";

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
        {group ? (
          <Alert type="info" showIcon title={t(`inbox.groupHint.${group}`)} />
        ) : null}
        <DataTable<TaskRow>
          mobileCards
          columnSettings={{ storageKey: "tasks" }}
          hideCard
          rowKey="id"
          scroll={{ x: 1060 }}
          columns={columns.map((column) => ({
            ...column,
            width:
              (
                {
                  kind: 190,
                  contract: 230,
                  who: 180,
                  amount: 110,
                  dueDate: 130,
                  badge: 140,
                } as Record<string, number>
              )[String(column.key)] ?? 200,
          }))}
          {...list.table}
          emptyText={t(`inbox.emptyGroup.${group ?? "ALL"}`)}
          statisticsData={statistics}
          tabs={[
            ...GROUPS.map((key) => ({
              key,
              label: `${t(`inbox.group.${key}`)} (${count("group", key)})`,
            })),
            { key: "ALL", label: t("inbox.tabs.ALL") },
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
                label: primaryLabel(r),
                icon: <ArrowRightOutlined />,
                tone: toneOf(r.kind),
                onClick: () => navigate(r.href),
              }}
              menu={menuFor(r)}
              moreLabel={t("inbox.actions.more")}
            />
          )}
        />
      </PageContainer>
      <DetailModal
        open={!!detail}
        title={
          detail
            ? detail.kind === "FOLLOW_UP" && detail.waitingFor
              ? t(`inbox.followUp.${detail.waitingFor.kind}`)
              : td(`taskKind.${detail.kind}`)
            : undefined
        }
        record={detail}
        onClose={() => setDetail(undefined)}
        items={
          detail
            ? [
                {
                  key: "group",
                  label: t("inbox.detail.group"),
                  value: t(`inbox.groupHint.${detail.group}`),
                  span: 2,
                },
                ...(what(detail)
                  ? [
                      {
                        key: "required",
                        label: t("inbox.columns.required"),
                        value: what(detail),
                        span: 2,
                      },
                    ]
                  : []),
                ...(detail.waitingFor
                  ? [
                      {
                        key: "waiting",
                        label:
                          detail.group === "UPCOMING"
                            ? t("inbox.detail.after")
                            : t("inbox.columns.who"),
                        value: (
                          <div className={styles.who}>
                            <span>{describeWaiting(t, detail.waitingFor)}</span>
                            <span className={styles.people}>
                              {detail.waitingFor.people.map((person) => (
                                <PersonChip
                                  key={person.userId}
                                  person={person}
                                  organizationName={
                                    detail.waitingFor?.organizationName
                                  }
                                />
                              ))}
                            </span>
                          </div>
                        ),
                        span: 2,
                      },
                    ]
                  : []),
                ...(waited(detail)
                  ? [
                      {
                        key: "waited",
                        label: t("inbox.detail.waited"),
                        value: waited(detail),
                      },
                    ]
                  : []),
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
              {primaryLabel(detail)}
            </BaseButton>
          ) : null
        }
      />
    </AppPage>
  );
}
