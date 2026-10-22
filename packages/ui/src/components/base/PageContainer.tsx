import { uiText } from "../../i18n";
import React from "react";
import { Breadcrumb, Tabs, Skeleton, Tooltip } from "antd";
import { Link } from "react-router-dom";
import { HomeOutlined, QuestionCircleOutlined } from "@ant-design/icons";
import { PageContainerProps } from "./types";
export const PageContainer: React.FC<PageContainerProps> = ({
  title,
  tooltip,
  breadcrumbs,
  extra,
  tags,
  tabs,
  activeTabKey,
  onTabChange,
  children,
  style,
  contentStyle,
  loading = false,
}) => {
  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: 16, ...style }}
    >
      {(title || breadcrumbs) && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>
            {breadcrumbs && breadcrumbs.length > 0 && (
              <Breadcrumb
                style={{ marginBottom: 4, fontSize: 12 }}
                items={[
                  {
                    title: (
                      <Link
                        to="/dashboard"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <HomeOutlined />
                        {uiText("s738a4cd148")}
                      </Link>
                    ),
                  },
                  ...breadcrumbs.map((b) => ({
                    title: b.path ? (
                      <Link to={b.path}>{b.title}</Link>
                    ) : (
                      b.title
                    ),
                  })),
                ]}
              />
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h1
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  color: "var(--text-primary, #111827)",
                  letterSpacing: "-0.2px",
                  margin: 0,
                  lineHeight: 1.3,
                }}
              >
                {title}
              </h1>

              {tooltip && (
                <Tooltip title={tooltip}>
                  <QuestionCircleOutlined
                    style={{
                      color: "#9CA3AF",
                      fontSize: 14,
                      cursor: "help",
                    }}
                  />
                </Tooltip>
              )}

              {tags}
            </div>
          </div>

          {extra && (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {extra}
            </div>
          )}
        </div>
      )}

      {tabs && tabs.length > 0 && (
        <div
          style={{
            background: "var(--bg-surface-card, #FFFFFF)",
            padding: "0 16px",
            borderRadius: 8,
            border: "1px solid var(--border-subtle, #E5E7EB)",
          }}
        >
          <Tabs
            activeKey={activeTabKey}
            onChange={onTabChange}
            items={tabs.map((t) => ({ key: t.key, label: t.tab }))}
            style={{ marginBottom: -16 }}
          />
        </div>
      )}

      <div style={{ ...contentStyle }}>
        <Skeleton loading={loading} active paragraph={{ rows: 6 }}>
          {children}
        </Skeleton>
      </div>
    </div>
  );
};
export default PageContainer;
