import { useState, type ReactNode } from "react";
import {
  Layout,
  Menu,
  Avatar,
  Dropdown,
  Breadcrumb,
  Space,
  Button,
  Badge,
  Tag,
  Drawer,
  Empty,
} from "antd";
import {
  MenuOutlined,
  BellOutlined,
  SettingOutlined,
  DatabaseOutlined,
  SunOutlined,
  MoonOutlined,
} from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAppConfig } from "@codecash/ui";
import { getPendingTaskCount } from "../api/tasks.api";
import { useCurrentUser, useSession } from "../auth/session";
import { Icon } from "../ui/Icon";
import { navByRole, type NavKey } from "./navConfig";
export interface BreadcrumbItem {
  label: string;
  to?: string;
}
interface Props {
  active: NavKey | "platform" | "data";
  breadcrumb: BreadcrumbItem[];
  showNotifications?: boolean;
  contentClassName?: string;
  children: ReactNode;
}
export function AppShell({
  active,
  breadcrumb,
  showNotifications = false,
  contentClassName,
  children,
}: Props) {
  const { t, i18n } = useTranslation("common");
  const { t: tp } = useTranslation("platform");
  const user = useCurrentUser();
  const { signOut } = useSession();
  const navigate = useNavigate();
  const { themeMode, toggleTheme } = useAppConfig();
  const [collapsed, setCollapsed] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const tasks = useQuery({
    queryKey: ["pending-task-count", user.id],
    queryFn: () => getPendingTaskCount(user.id),
  });
  const items = navByRole[user.role].map((item) => ({
    key: item.key,
    icon: <Icon name={item.icon} />,
    label: (
      <Space>
        {t(item.labelKey)}
        {item.badge ? <Badge count={tasks.data ?? 0} /> : null}
      </Space>
    ),
    onClick: () => navigate(item.to),
  }));
  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Layout.Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        breakpoint="lg"
        collapsedWidth={64}
        theme={themeMode === "dark" ? "dark" : "light"}
        width={240}
        style={{ borderRight: "1px solid #e5e9f2" }}
      >
        <div
          style={{
            height: 72,
            padding: 20,
            fontWeight: 800,
            color: "#315bea",
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
        >
          {collapsed ? "CC" : t("brand.name")}
        </div>
        <Menu
          theme={themeMode === "dark" ? "dark" : "light"}
          mode="inline"
          selectedKeys={[active]}
          items={[
            ...items,
            { type: "divider" },
            ...(user.role !== "SUPPLIER"
              ? [
                  {
                    key: "data",
                    icon: <DatabaseOutlined />,
                    label: tp("data.title"),
                    onClick: () => navigate("/data"),
                  },
                ]
              : []),
            ...(user.role === "ADMIN_AUDITOR"
              ? [
                  {
                    key: "platform",
                    icon: <SettingOutlined />,
                    label: tp("title"),
                    onClick: () => navigate("/platform/organizations"),
                  },
                ]
              : []),
          ]}
        />
      </Layout.Sider>
      <Layout>
        <Layout.Header
          style={{
            padding: "0 24px",
            height: 64,
            display: "flex",
            gap: 16,
            alignItems: "center",
            background: themeMode === "dark" ? "#141414" : "white",
            borderBottom: "1px solid #e5e9f2",
          }}
        >
          <Button
            type="text"
            icon={<MenuOutlined />}
            onClick={() => setCollapsed((x) => !x)}
            aria-label={tp("navigation")}
          />
          <Breadcrumb
            items={breadcrumb.map((x) => ({
              title: x.to ? (
                <a onClick={() => navigate(x.to!)}>{x.label}</a>
              ) : (
                x.label
              ),
            }))}
          />
          <Space style={{ marginLeft: "auto" }}>
            <Tag>{t(`roles.${user.role}.name`)}</Tag>
            <Button
              type="text"
              icon={themeMode === "dark" ? <SunOutlined /> : <MoonOutlined />}
              onClick={toggleTheme}
              aria-label={tp("theme")}
            />
            {showNotifications ? (
              <Badge count={tasks.data ?? 0}>
                <Button
                  type="text"
                  icon={<BellOutlined />}
                  onClick={() => setNotifications(true)}
                  aria-label={t("topbar.notifications")}
                />
              </Badge>
            ) : null}
            <Dropdown
              trigger={["click"]}
              menu={{
                items: [
                  { key: "user", label: user.displayName, disabled: true },
                  {
                    key: "vi",
                    label: t("languages.vi"),
                    onClick: () => void i18n.changeLanguage("vi"),
                  },
                  {
                    key: "en",
                    label: t("languages.en"),
                    onClick: () => void i18n.changeLanguage("en"),
                  },
                  { type: "divider" },
                  {
                    key: "logout",
                    label: t("topbar.signOut"),
                    onClick: () => {
                      signOut();
                    },
                  },
                ],
              }}
            >
              <Button type="text" aria-label={t("topbar.account")}>
                <Avatar style={{ background: "#315bea" }}>
                  {t(`roles.${user.role}.short`)}
                </Avatar>
              </Button>
            </Dropdown>
          </Space>
        </Layout.Header>
        <Layout.Content
          className={contentClassName}
          style={{ padding: 24, minWidth: 0 }}
        >
          {children}
        </Layout.Content>
      </Layout>
      <Drawer
        open={notifications}
        onClose={() => setNotifications(false)}
        title={t("topbar.notifications")}
      >
        <Empty description={tp("notificationsHint")} />
      </Drawer>
    </Layout>
  );
}
