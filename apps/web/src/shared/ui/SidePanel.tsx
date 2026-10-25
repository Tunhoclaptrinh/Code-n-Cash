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
}

/** The few numbers a decision turns on, as small tiles. */
export function KeyFigures({ items }: { items: KeyFigure[] }) {
  return (
    <div className={styles.figures}>
      {items.map((item) => (
        <div key={item.key} className={styles.figure} data-tone={item.tone}>
          <span className={styles.figureLabel}>{item.label}</span>
          <span className={styles.figureValue}>{item.value}</span>
        </div>
      ))}
    </div>
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
