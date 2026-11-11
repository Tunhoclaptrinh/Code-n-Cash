import { useState, type ReactNode } from "react";
import { Button, Popover, Spin } from "antd";
import {
  CheckCircleFilled,
  ClockCircleOutlined,
  ExclamationCircleFilled,
} from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import type {
  MilestoneDetail,
  PendingItem,
  PersonRef,
  WaitingOn,
} from "@codecash/contracts";
import { getMilestoneDetail } from "@/shared/api/domain";
import { formatDate, formatDateTime } from "@/shared/lib/format";
import { PersonChip } from "@/shared/ui/PersonChip";
import { SideSection } from "@/shared/ui/SidePanel";
import styles from "./MilestoneDecision.module.css";

/**
 * "Who must do what next" on a milestone. Every item comes from the API (`MilestoneDetail.pending`):
 * the page only lays it out, links it and previews it on hover. It decides nothing.
 */

type Rules = MilestoneDetail["rules"];
interface Progress {
  done: number;
  quorum: number;
}

/** The thing to do, in business words: the document, the approving role, or the kind of item. */
export function pendingTitle(td: TFunction, item: PendingItem) {
  if (item.kind === "EVIDENCE" || item.kind === "UNAUTHORIZED")
    return td(`eventType.${item.subject}`);
  if (item.kind === "APPROVAL") return td(`approvalRole.${item.subject}`);
  return td(`pendingKind.${item.kind}`);
}

const rolesText = (tc: TFunction, item: Pick<PendingItem, "roles">) =>
  item.roles.map((role) => tc(`roles.${role}.name`)).join(" / ");

function StateIcon({ item }: { item: PendingItem }) {
  const { t: td } = useTranslation("domain");
  const label = td(`pendingState.${item.state}`);
  if (item.state === "DONE")
    return (
      <CheckCircleFilled
        className={styles.pendingIconDone}
        role="img"
        aria-label={label}
      />
    );
  if (item.state === "BLOCKING")
    return (
      <ExclamationCircleFilled
        className={styles.pendingIconBlocking}
        role="img"
        aria-label={label}
      />
    );
  return (
    <ClockCircleOutlined
      className={styles.pendingIconWaiting}
      role="img"
      aria-label={label}
    />
  );
}

/** "chờ 26 ngày · Hạn 02/11/2026 · quá hạn 9 ngày", only the parts the data gives. */
function timing(t: TFunction, item: PendingItem) {
  const parts: string[] = [];
  if (item.state === "DONE") return parts;
  if (item.waitingDays !== null)
    parts.push(
      item.waitingDays === 0
        ? t("pending.waitedToday")
        : t("pending.waitedShort", { count: item.waitingDays }),
    );
  if (item.dueBy)
    parts.push(t("pending.due", { date: formatDate(item.dueBy) }));
  if (item.overdueDays > 0 && item.graceUntil)
    parts.push(t("pending.graceUntil", { date: formatDate(item.graceUntil) }));
  if (item.overdueDays > 0)
    parts.push(t("pending.overdue", { count: item.overdueDays }));
  return parts;
}

function People({ item, limit = 2 }: { item: PendingItem; limit?: number }) {
  const { t } = useTranslation("milestones");
  const { t: tc } = useTranslation("common");
  if (!item.people.length)
    return <span className={styles.pendingMuted}>{t("pending.noPeople")}</span>;
  const shown = item.people.slice(0, limit);
  const rest = item.people.length - shown.length;
  return (
    <span className={styles.pendingPeople}>
      {shown.map((person) => (
        <PersonChip
          key={person.userId}
          person={person}
          organizationName={item.organization.name}
          roleLabel={rolesText(tc, item)}
        />
      ))}
      {rest > 0 ? <span className={styles.pendingMuted}>+{rest}</span> : null}
    </span>
  );
}

/** Everything about one item: the hover card behind its title. */
export function PendingCard({
  item,
  rules,
  progress,
}: {
  item: PendingItem;
  rules?: Rules;
  progress?: Progress;
}) {
  const { t } = useTranslation("milestones");
  const { t: td } = useTranslation("domain");
  const { t: tc } = useTranslation("common");
  const rule = item.rule
    ? rules?.find((r) => r.id === item.rule?.id)
    : undefined;
  const rows: Array<{ key: string; label: string; value: ReactNode }> = [
    {
      key: "party",
      label: t("pending.field.party"),
      value: `${td(`side.${item.side}`)} · ${item.organization.name}`,
    },
    { key: "role", label: t("pending.field.role"), value: rolesText(tc, item) },
  ];
  if (item.done)
    rows.push({
      key: "done",
      label: t("pending.field.done"),
      value: item.done.by ? (
        <span className={styles.pendingPeople}>
          <PersonChip
            person={item.done.by}
            organizationName={item.organization.name}
          />
          {formatDateTime(item.done.at)}
        </span>
      ) : (
        t("pending.doneBy", {
          name: item.done.byName,
          at: formatDateTime(item.done.at),
        })
      ),
    });
  else
    rows.push({
      key: "people",
      label: t("pending.field.people"),
      value: <People item={item} limit={6} />,
    });
  if (progress && item.kind === "APPROVAL")
    rows.push({
      key: "progress",
      label: t("pending.field.progress"),
      value: t("pending.progress", { ...progress }),
    });
  if (item.state !== "DONE" && item.waitingDays !== null)
    rows.push({
      key: "waited",
      label: t("pending.field.waited"),
      value:
        item.waitingDays === 0
          ? t("pending.waitedToday")
          : t("pending.waited", { count: item.waitingDays }),
    });
  if (item.dueBy)
    rows.push({
      key: "deadline",
      label: t("pending.field.deadline"),
      value:
        formatDate(item.dueBy) +
        (item.overdueDays > 0 && item.state !== "DONE"
          ? ` · ${t("pending.overdue", { count: item.overdueDays })}`
          : ""),
    });
  if (item.graceUntil)
    rows.push({
      key: "grace",
      label: t("pending.field.grace"),
      value: formatDate(item.graceUntil),
    });
  if (item.rule)
    rows.push({
      key: "rule",
      label: t("pending.field.rule"),
      value: t("pending.ruleValue", {
        priority: item.rule.priority,
        reason: rule
          ? td(`reason.${rule.reasonCode}`)
          : td(`pendingKind.${item.kind}`),
      }),
    });
  return (
    <div className={styles.pendingCard} data-testid="pending-card">
      <div className={styles.pendingCardHead}>
        <StateIcon item={item} />
        <b>{pendingTitle(td, item)}</b>
      </div>
      <p className={styles.pendingCardHint}>
        {t(`pending.hint.${item.state}`)}
      </p>
      <dl className={styles.pendingCardRows}>
        {rows.map((row) => (
          <div key={row.key}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * Runs an item's action: on this page when it is the page's own button (approve the payment,
 * scroll to the exception panel), otherwise by opening the screen where it is done.
 */
function usePendingAction(onTransfer?: () => void) {
  const navigate = useNavigate();
  const location = useLocation();
  return (item: PendingItem) => {
    const action = item.action;
    if (!action) return;
    if (action.kind === "TRANSFER" && onTransfer) return onTransfer();
    const [path, hash] = action.href.split("#");
    if (path === location.pathname) {
      if (hash)
        document.getElementById(hash)?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    navigate(action.href);
  };
}

function ActionButton({
  item,
  run,
}: {
  item: PendingItem;
  run: (item: PendingItem) => void;
}) {
  const { t: td } = useTranslation("domain");
  if (!item.action?.mine) return null;
  return (
    <Button
      size="small"
      type={item.state === "BLOCKING" ? "primary" : "default"}
      onClick={() => run(item)}
      data-testid={`pending-action-${item.key}`}
    >
      {td(`pendingAction.${item.action.kind}`, {
        subject: pendingTitle(td, item),
      })}
    </Button>
  );
}

/** One item: what, who, how long; its title opens the full card on hover, focus or tap. */
export function PendingRow({
  item,
  rules,
  progress,
  run,
}: {
  item: PendingItem;
  rules?: Rules;
  progress?: Progress;
  run: (item: PendingItem) => void;
}) {
  const { t } = useTranslation("milestones");
  const { t: td } = useTranslation("domain");
  const { t: tc } = useTranslation("common");
  const when = timing(t, item);
  return (
    <li
      className={styles.pendingRow}
      data-state={item.state}
      data-testid="pending-item"
      data-key={item.key}
    >
      <StateIcon item={item} />
      <div className={styles.pendingMain}>
        <div className={styles.pendingTitleLine}>
          <Popover
            content={
              <PendingCard item={item} rules={rules} progress={progress} />
            }
            trigger={["hover", "focus", "click"]}
            placement="bottomLeft"
          >
            <button type="button" className={styles.pendingTitle}>
              {pendingTitle(td, item)}
            </button>
          </Popover>
          {item.kind === "APPROVAL" && progress && item.state !== "DONE" ? (
            <span className={styles.pendingMuted}>
              {t("pending.progress", { ...progress })}
            </span>
          ) : null}
        </div>
        <div className={styles.pendingWho}>
          <span className={styles.pendingMuted}>
            {item.organization.name} · {rolesText(tc, item)}
          </span>
          {item.done ? (
            item.done.by ? (
              <PersonChip
                person={item.done.by}
                organizationName={item.organization.name}
              />
            ) : (
              <span>{item.done.byName}</span>
            )
          ) : (
            <People item={item} />
          )}
        </div>
        {item.done ? (
          <div className={styles.pendingWhen}>
            {formatDateTime(item.done.at)}
          </div>
        ) : when.length ? (
          <div
            className={styles.pendingWhen}
            data-overdue={item.overdueDays > 0 || undefined}
          >
            {when.join(" · ")}
          </div>
        ) : null}
      </div>
      <ActionButton item={item} run={run} />
    </li>
  );
}

/** The block under the decision headline: blocking items first, later ones next, done ones folded. */
export function PendingPanel({
  data,
  onTransfer,
}: {
  data: MilestoneDetail;
  onTransfer?: () => void;
}) {
  const { t } = useTranslation("milestones");
  const run = usePendingAction(onTransfer);
  const [showDone, setShowDone] = useState(false);
  const progress = data.evaluation.approvalRequired
    ? {
        done: data.evaluation.validApprovalCount,
        quorum: data.evaluation.quorum,
      }
    : undefined;
  const open = data.pending.filter((item) => item.state !== "DONE");
  const done = data.pending.filter((item) => item.state === "DONE");
  const blocking = open.filter((item) => item.state === "BLOCKING").length;
  const rows = showDone ? [...open, ...done] : open;
  return (
    <SideSection
      title={t("pending.title")}
      extra={
        open.length ? (
          <span className={styles.pendingMuted}>
            {t("pending.summary", {
              blocking,
              waiting: open.length - blocking,
            })}
          </span>
        ) : null
      }
    >
      {open.length === 0 && !showDone ? (
        <p className={styles.pendingMuted}>{t("pending.nothing")}</p>
      ) : null}
      <ul className={styles.pendingList} data-testid="pending-list">
        {rows.map((item) => (
          <PendingRow
            key={item.key}
            item={item}
            rules={data.rules}
            progress={progress}
            run={run}
          />
        ))}
      </ul>
      {done.length ? (
        <Button
          type="link"
          size="small"
          className={styles.pendingToggle}
          onClick={() => setShowDone((value) => !value)}
        >
          {showDone
            ? t("pending.hideDone")
            : t("pending.showDone", { count: done.length })}
        </Button>
      ) : null}
    </SideSection>
  );
}

/** Wraps any text (a condition, a document name) so that it previews the matching item. */
export function PendingPopover({
  items,
  rules,
  progress,
  children,
}: {
  items: PendingItem[];
  rules?: Rules;
  progress?: Progress;
  children: ReactNode;
}) {
  if (!items.length) return <>{children}</>;
  return (
    <Popover
      trigger={["hover", "focus", "click"]}
      placement="bottomLeft"
      content={
        <div className={styles.pendingCardStack}>
          {items.map((item) => (
            <PendingCard
              key={item.key}
              item={item}
              rules={rules}
              progress={progress}
            />
          ))}
        </div>
      }
    >
      <button type="button" className={styles.pendingTitle}>
        {children}
      </button>
    </Popover>
  );
}

/** The people the milestone waits for right now, as chips next to the "next step" sentence. */
export function BlockingPeople({ items }: { items: PendingItem[] }) {
  const { t: tc } = useTranslation("common");
  const seen = new Set<string>();
  const people: Array<{ person: PersonRef; item: PendingItem }> = [];
  for (const item of items.filter((i) => i.state === "BLOCKING"))
    for (const person of item.people)
      if (!seen.has(person.userId)) {
        seen.add(person.userId);
        people.push({ person, item });
      }
  if (!people.length) return null;
  return (
    <span className={styles.pendingPeople} data-testid="blocking-people">
      {people.slice(0, 4).map(({ person, item }) => (
        <PersonChip
          key={person.userId}
          person={person}
          organizationName={item.organization.name}
          roleLabel={rolesText(tc, item)}
        />
      ))}
    </span>
  );
}

/** Loads the milestone's items only when its preview opens; shares the decision page's cache. */
function LazyPending({
  contractId,
  sequence,
}: {
  contractId: string;
  sequence: number;
}) {
  const { t } = useTranslation("milestones");
  const run = usePendingAction();
  const detail = useQuery({
    queryKey: ["milestones", "decision", contractId, sequence],
    queryFn: () => getMilestoneDetail(contractId, sequence),
  });
  if (!detail.data)
    return (
      <span className={styles.pendingMuted}>
        <Spin size="small" /> {t("pending.loading")}
      </span>
    );
  const data = detail.data;
  const open = data.pending.filter((item) => item.state !== "DONE");
  const progress = data.evaluation.approvalRequired
    ? {
        done: data.evaluation.validApprovalCount,
        quorum: data.evaluation.quorum,
      }
    : undefined;
  return (
    <ul className={`${styles.pendingList} ${styles.pendingPreview}`}>
      {open.map((item) => (
        <PendingRow
          key={item.key}
          item={item}
          rules={data.rules}
          progress={progress}
          run={run}
        />
      ))}
    </ul>
  );
}

/**
 * "Đang chờ: Phú Minh Technology JSC · Nhà cung cấp (Hoá đơn)" for list rows. Hovering it loads the
 * milestone and shows each blocking item with its people and actions.
 */
export function WaitingOnLine({
  contractId,
  sequence,
  waitingOn,
  fallback,
}: {
  contractId: string;
  sequence: number;
  waitingOn: WaitingOn[];
  fallback: ReactNode;
}) {
  const { t: td } = useTranslation("domain");
  const { t: tc } = useTranslation("common");
  if (!waitingOn.length) return <>{fallback}</>;
  const text = waitingOn
    .map((group) => {
      const subjects = group.subjects
        .map((subject) =>
          group.kind === "APPROVAL"
            ? td(`approvalRole.${subject}`)
            : td(`eventType.${subject}`),
        )
        .join(", ");
      const who = `${group.organizationName} · ${rolesText(tc, group)}`;
      return subjects && group.kind !== "APPROVAL"
        ? `${who} (${subjects})`
        : group.kind === "APPROVAL"
          ? `${group.organizationName} · ${subjects}`
          : `${who} · ${td(`pendingKind.${group.kind}`)}`;
    })
    .join("; ");
  return (
    // The popup renders on first open only, so the milestone is fetched when someone looks.
    <Popover
      trigger={["hover", "focus", "click"]}
      placement="bottomLeft"
      content={<LazyPending contractId={contractId} sequence={sequence} />}
    >
      <button
        type="button"
        className={styles.pendingTitle}
        data-testid="waiting-on"
      >
        {text}
      </button>
    </Popover>
  );
}
