import { useState } from "react";
import { Button, Calendar } from "antd";
import { LeftOutlined, RightOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import type { DashboardView } from "@codecash/contracts";
import { formatDate, formatDecimalString } from "@/shared/lib/format";
import viz from "./viz.module.css";
import styles from "./DueCalendar.module.css";

type DueItem = DashboardView["dueItems"][number];
type DueState = DueItem["state"];

const STATE_COLOR: Record<DueState, string> = {
  OVERDUE: "var(--viz-rejected)",
  HELD: "var(--viz-held)",
  PAYABLE: "var(--viz-payable)",
  PAID: "var(--viz-paid)",
  REJECTED: "var(--color-text-faint)",
};
const STATES: DueState[] = ["OVERDUE", "HELD", "PAYABLE", "PAID", "REJECTED"];
/** Dots under a day before the rest fold into "+n". */
const MAX_DOTS = 4;

/**
 * A small month calendar of due dates: a dot per milestone due that day, coloured by where it
 * stands, today ringed. Selecting a day lists its milestones with links to their decisions.
 */
export function DueCalendar({
  items,
  today,
}: {
  items: DueItem[];
  today: string;
}) {
  const { t } = useTranslation("dashboard");
  const { t: td } = useTranslation("domain");
  const byDate = new Map<string, DueItem[]>();
  for (const item of items)
    byDate.set(item.date, [...(byDate.get(item.date) ?? []), item]);
  // Open on today, or on the next day that has something due.
  const firstDue =
    items.find((item) => item.date >= today)?.date ?? items.at(-1)?.date;
  const [selected, setSelected] = useState<Dayjs>(() =>
    dayjs(byDate.has(today) ? today : (firstDue ?? today)),
  );
  const day = selected.format("YYYY-MM-DD");
  const dayItems = byDate.get(day) ?? [];

  return (
    <div className={`${viz.viz} ${styles.wrap}`} data-testid="due-calendar">
      <Calendar
        fullscreen={false}
        value={selected}
        onSelect={(value) => setSelected(value)}
        onChange={(value) => setSelected(value)}
        headerRender={({ value, onChange }) => (
          <div className={styles.header}>
            <h2 className={styles.title}>{t("calendar.title")}</h2>
            <span className={styles.nav}>
              <Button
                type="text"
                size="small"
                icon={<LeftOutlined />}
                aria-label={t("calendar.previous")}
                onClick={() => onChange(value.subtract(1, "month"))}
              />
              <b className={styles.month}>{value.format("MM/YYYY")}</b>
              <Button
                type="text"
                size="small"
                icon={<RightOutlined />}
                aria-label={t("calendar.next")}
                onClick={() => onChange(value.add(1, "month"))}
              />
              <Button
                size="small"
                onClick={() => onChange(dayjs(today))}
                disabled={value.isSame(dayjs(today), "day")}
              >
                {t("calendar.today")}
              </Button>
            </span>
          </div>
        )}
        fullCellRender={(date, info) => {
          if (info.type !== "date") return info.originNode;
          const key = date.format("YYYY-MM-DD");
          const due = byDate.get(key) ?? [];
          return (
            <div
              className={styles.cell}
              data-today={key === today || undefined}
              data-selected={key === day || undefined}
              data-outside={date.month() !== selected.month() || undefined}
              aria-label={
                due.length
                  ? `${formatDate(key)}: ${t("calendar.count", { count: due.length })}`
                  : undefined
              }
            >
              <span className={styles.dayNumber}>{date.date()}</span>
              <span className={styles.dots}>
                {due.slice(0, MAX_DOTS).map((item) => (
                  <i
                    key={`${item.contractId}-${item.sequence}`}
                    style={{ background: STATE_COLOR[item.state] }}
                  />
                ))}
                {due.length > MAX_DOTS ? (
                  <em>+{due.length - MAX_DOTS}</em>
                ) : null}
              </span>
            </div>
          );
        }}
      />
      <div className={styles.legend}>
        {STATES.map((state) => (
          <span key={state}>
            <i style={{ background: STATE_COLOR[state] }} />
            {t(`calendar.state.${state}`)}
          </span>
        ))}
      </div>
      <div className={styles.day} aria-live="polite">
        <b className={styles.dayTitle}>
          {t("calendar.dayTitle", { date: formatDate(day) })}
        </b>
        {dayItems.length ? (
          <ul>
            {dayItems.map((item) => (
              <li key={`${item.contractId}-${item.sequence}`}>
                <i style={{ background: STATE_COLOR[item.state] }} />
                <Link
                  to={`/contracts/${item.contractId}/milestones/${item.sequence}/decision`}
                >
                  {item.contractId} · {td("milestoneNo", { no: item.sequence })}
                </Link>
                <span>{t(`calendar.state.${item.state}`)}</span>
                <span className={styles.amount}>
                  {formatDecimalString(item.amountMillion)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.dayEmpty}>{t("calendar.none")}</p>
        )}
      </div>
    </div>
  );
}
