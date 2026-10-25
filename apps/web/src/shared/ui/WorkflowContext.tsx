import type { ReactNode } from "react";
import styles from "./WorkflowContext.module.css";

/** Contract context below the breadcrumb, without repeating the page title. */
export function WorkflowContext({ children }: { children: ReactNode }) {
  return <p className={styles.context}>{children}</p>;
}
