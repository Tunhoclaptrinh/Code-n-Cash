import { useLayoutEffect, type ReactNode } from "react";
import type { NavKey } from "./navConfig";
import { usePublishChrome, type BreadcrumbItem } from "./pageChrome";
import styles from "./AppLayout.module.css";

export type { BreadcrumbItem };

interface Props {
  /** Navigation entry to highlight; omit for screens outside the menu. */
  active?: NavKey;
  breadcrumb: BreadcrumbItem[];
  /** Extra class on the page body, e.g. for page-scoped CSS variables. */
  contentClassName?: string;
  children: ReactNode;
}

/**
 * Body of a signed-in screen. The sidebar and header live in `AppLayout` and stay mounted
 * across navigation; this component only publishes the page's breadcrumb and active nav key.
 */
export function AppPage({
  active,
  breadcrumb,
  contentClassName,
  children,
}: Props) {
  const publish = usePublishChrome();
  const trail = JSON.stringify(breadcrumb);
  useLayoutEffect(() => {
    publish({ active, breadcrumb: JSON.parse(trail) as BreadcrumbItem[] });
  }, [publish, active, trail]);
  return (
    <div className={[styles.page, contentClassName].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
}
