import { useLayoutEffect, type ReactNode } from "react";
import { Breadcrumb } from "antd";
import { HomeOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
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
 * Body of a signed-in screen. The header and sidebar live in `AppLayout` and stay mounted
 * across navigation; this component publishes the active nav key and renders the breadcrumb
 * above the page, in the style of the base PageContainer breadcrumb.
 */
export function AppPage({
  active,
  breadcrumb,
  contentClassName,
  children,
}: Props) {
  const { t } = useTranslation("common");
  const publish = usePublishChrome();
  const trail = JSON.stringify(breadcrumb);
  useLayoutEffect(() => {
    publish({ active, breadcrumb: JSON.parse(trail) as BreadcrumbItem[] });
  }, [publish, active, trail]);
  return (
    <div className={[styles.page, contentClassName].filter(Boolean).join(" ")}>
      {breadcrumb.length ? (
        <Breadcrumb
          className={styles.breadcrumb}
          items={[
            {
              title: (
                <Link to="/" aria-label={t("nav.home")}>
                  <HomeOutlined />
                </Link>
              ),
            },
            ...breadcrumb.map((item) => ({
              title: item.to ? (
                <Link to={item.to}>{item.label}</Link>
              ) : (
                item.label
              ),
            })),
          ]}
        />
      ) : null}
      {children}
    </div>
  );
}
