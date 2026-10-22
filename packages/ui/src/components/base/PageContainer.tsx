import { uiText } from "../../i18n";
import React from "react";
import { Breadcrumb, Tabs, Skeleton, theme } from "antd";
import { PageHeader } from "./PageHeader";
import { Link } from "react-router-dom";
import { HomeOutlined } from "@ant-design/icons";
import { PageContainerProps } from "./types";
export const PageContainer: React.FC<PageContainerProps> = ({
  title,
  subtitle,
  icon,
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
  const { token } = theme.useToken();
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 20,
        minWidth: 0,
        ...style,
      }}
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
          <div style={{ minWidth: 0 }}>
            {breadcrumbs && breadcrumbs.length > 0 && (
              <Breadcrumb
                style={{ marginBottom: 4, fontSize: 12 }}
                items={[
                  {
                    title: (
                      <Link
                        to="/contracts"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <HomeOutlined />
                        {uiText("nav.home")}
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

            <PageHeader
              title={title}
              subtitle={subtitle}
              icon={icon}
              tags={tags}
              tooltip={tooltip}
            />
          </div>

          {extra && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              {extra}
            </div>
          )}
        </div>
      )}

      {tabs && tabs.length > 0 && (
        <div
          style={{
            background: token.colorBgContainer,
            padding: "0 16px",
            borderRadius: 8,
            border: `1px solid ${token.colorBorderSecondary}`,
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

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 20,
          minWidth: 0,
          ...contentStyle,
        }}
      >
        <Skeleton loading={loading} active paragraph={{ rows: 6 }}>
          {children}
        </Skeleton>
      </div>
    </div>
  );
};
export default PageContainer;
