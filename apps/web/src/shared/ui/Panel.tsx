import type { ReactNode } from "react";
import styles from "./Panel.module.css";

/** Card surface for feature layouts that manage their own padding; it never clips its content. */
export function Panel({
  as: Element = "section",
  className,
  children,
}: {
  as?: "section" | "div";
  className?: string;
  children: ReactNode;
}) {
  return (
    <Element className={[styles.panel, className].filter(Boolean).join(" ")}>
      {children}
    </Element>
  );
}
