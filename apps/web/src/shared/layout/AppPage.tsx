import { useEffect, useLayoutEffect, type ReactNode } from "react";
import { Breadcrumb } from "antd";
import { HomeOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { GuideButton } from "@/guide/GuideButton";
import type { GuideTopic } from "@/guide/topics";
import type { NavKey } from "./navConfig";
import { usePublishChrome, type BreadcrumbItem } from "./pageChrome";
import styles from "./AppLayout.module.css";

export type { BreadcrumbItem };

interface Props {
  /** Navigation entry to highlight; omit for screens outside the menu. */
  active?: NavKey;
  /** Trail to this screen; its last item is the page title. */
  breadcrumb: BreadcrumbItem[];
  /** Status tags shown after the title. */
  tags?: ReactNode;
  /** Page actions, on the right of the title. */
  extra?: ReactNode;
  /** Guide topic opened by the "How to use this page" button of the title row. */
  guide?: GuideTopic;
  /** Extra class on the page body, e.g. for page-scoped CSS variables. */
  contentClassName?: string;
  children: ReactNode;
}

/**
 * Body of a signed-in screen. The header and sidebar live in `AppLayout` and stay mounted across
 * navigation; this component publishes the active nav key and renders the title row: the
 * breadcrumb, whose last item is the page heading, with the page's tags and actions. Pages do not
 * repeat a title or a subtitle below it.
 */
export function AppPage({
  active,
  breadcrumb,
  tags,
  extra,
  guide,
  contentClassName,
  children,
}: Props) {
  const { t } = useTranslation("common");
  const publish = usePublishChrome();
  const trail = JSON.stringify(breadcrumb);
  useLayoutEffect(() => {
    publish({ active, breadcrumb: JSON.parse(trail) as BreadcrumbItem[] });
  }, [publish, active, trail]);
  const title = breadcrumb.at(-1)?.label;
  useEffect(() => {
    document.title = title ? `${title} · ${t("brand.name")}` : t("brand.name");
  }, [title, t]);
  return (
    <div className={[styles.page, contentClassName].filter(Boolean).join(" ")}>
      {breadcrumb.length ? (
        <div className={styles.pageHead}>
          <div className={styles.pageHeading}>
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
                ...breadcrumb.map((item, index) => ({
                  title:
                    index === breadcrumb.length - 1 ? (
                      <h1 className={styles.pageTitle}>{item.label}</h1>
                    ) : item.to ? (
                      <Link to={item.to}>{item.label}</Link>
                    ) : (
                      item.label
                    ),
                })),
              ]}
            />
            {tags ? <div className={styles.pageTags}>{tags}</div> : null}
          </div>
          {extra || guide ? (
            <div className={styles.pageExtra}>
              {guide ? <GuideButton topic={guide} /> : null}
              {extra}
            </div>
          ) : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}
