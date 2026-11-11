import { StatisticsCard } from "@codecash/ui";
import type { ReactNode } from "react";
import { CheckCircleFilled, CloseCircleFilled } from "@ant-design/icons";
import { Panel } from "./Panel";
import styles from "./SidePanel.module.css";

/** One card of the right-hand column; its sections are separated by thin rules, not by gaps. */
export function SideCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Panel
      as="div"
      className={[styles.card, className].filter(Boolean).join(" ")}
    >
      {children}
    </Panel>
  );
}

/** A titled block inside a `SideCard`; `extra` sits on the right of the title. */
export function SideSection({
  title,
  extra,
  children,
}: {
  title?: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={styles.section}>
      {title || extra ? (
        <div className={styles.sectionHeader}>
          {title ? <h3 className={styles.sectionTitle}>{title}</h3> : <span />}
          {extra}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export interface KeyFigure {
  key: string;
  label: ReactNode;
  value: ReactNode;
  tone?: "warning" | "success" | "danger";
  /** Short unit after the value, in small type ("triệu"). */
  unit?: ReactNode;
  /** One small line under the value. */
  description?: ReactNode;
  /** A state tag; after the label by default, or before the value. */
  tag?: ReactNode;
  tagPlacement?: "title" | "value";
  testId?: string;
}

const FIGURE_TONE = {
  warning: {
    backgroundColor: "var(--color-warning-soft)",
    valueColor: "var(--color-warning)",
  },
  success: {
    backgroundColor: "var(--color-success-soft)",
    valueColor: "var(--color-success)",
  },
  danger: {
    backgroundColor: "var(--color-danger-soft)",
    valueColor: "var(--color-danger)",
  },
} as const;

/**
 * The few numbers a decision turns on, as small tiles: the base StatisticsCard in its stacked,
 * small variant, so side panels and list headers share one statistic item.
 */
export function KeyFigures({
  items,
  minItemWidth = 120,
}: {
  items: KeyFigure[];
  minItemWidth?: number;
}) {
  return (
    <StatisticsCard
      hideCard
      variant="stacked"
      size="small"
      statShadow={false}
      rowGutter={8}
      minItemWidth={minItemWidth}
      cardStyle={{ border: "none" }}
      data={items.map((item) => ({
        key: item.key,
        title: item.label,
        value: item.value,
        unit: item.unit,
        description: item.description,
        tag: item.tag,
        tagPlacement: item.tagPlacement,
        testId: item.testId,
        ...(item.tone
          ? FIGURE_TONE[item.tone]
          : { backgroundColor: "var(--color-surface-muted)" }),
      }))}
    />
  );
}

export interface InfoItem {
  key: string;
  label: ReactNode;
  value: ReactNode;
}

/** Label and value rows aligned on two columns. */
export function InfoGrid({ items }: { items: InfoItem[] }) {
  return (
    <dl className={styles.info}>
      {items.map((item) => (
        <div key={item.key} style={{ display: "contents" }}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export interface CheckItem {
  key: string;
  ok: boolean;
  text: ReactNode;
}

/** Conditions met or missing, with an icon each; wraps into two columns when there is room. */
export function CheckList({
  items,
  labels,
}: {
  items: CheckItem[];
  /** Spoken state of each icon, so the state never relies on colour alone. */
  labels: { ok: string; missing: string };
}) {
  return (
    <ul className={styles.checks}>
      {items.map((item) => (
        <li key={item.key}>
          {item.ok ? (
            <CheckCircleFilled
              className={styles.checkOk}
              role="img"
              aria-label={labels.ok}
            />
          ) : (
            <CloseCircleFilled
              className={styles.checkMissing}
              role="img"
              aria-label={labels.missing}
            />
          )}
          <span>{item.text}</span>
        </li>
      ))}
    </ul>
  );
}
