import { useCallback, useState } from "react";
import {
  Avatar,
  Badge,
  Breadcrumb,
  Button,
  Drawer,
  Dropdown,
  Grid,
  Layout,
  Menu,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import type { MenuProps } from "antd";
import {
  BellOutlined,
  CheckOutlined,
  GlobalOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuOutlined,
  MenuUnfoldOutlined,
  MoonOutlined,
  SunOutlined,
} from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, Outlet, useNavigate, useNavigation } from "react-router-dom";
import { useAppConfig, useLocalStorage } from "@codecash/ui";
import { getPendingTaskCount } from "../api/tasks.api";
import { useCurrentUser, useSession } from "../auth/session";
import { initialsOf } from "../lib/initials";
import { BrandMark } from "../ui/BrandMark";
import { navByRole, type NavItem } from "./navConfig";
import { PageChromeContext, type PageChrome } from "./pageChrome";
import styles from "./AppLayout.module.css";

/**
 * Persistent frame for every signed-in route: sidebar (drawer on small screens), header and
 * the routed page. Pages publish their breadcrumb and active nav entry through `AppPage`.
 */
export function AppLayout() {
  const { t, i18n } = useTranslation("common");
  const { t: tp } = useTranslation("platform");
  const user = useCurrentUser();
  const { signOut } = useSession();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const { themeMode, toggleTheme } = useAppConfig();
  const screens = Grid.useBreakpoint();
  const desktop = screens.lg ?? true;
  const [collapsed, setCollapsed] = useLocalStorage(
    "codecash.sider.collapsed",
    false,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [chrome, setChrome] = useState<PageChrome>({ breadcrumb: [] });
  const publish = useCallback((next: PageChrome) => setChrome(next), []);

  const pending = useQuery({
    queryKey: ["pending-task-count", user.id],
    queryFn: () => getPendingTaskCount(user.id),
  });
  const pendingCount = pending.data ?? 0;
  const groups = navByRole[user.role];
  const inbox = groups
    .flatMap((group) => group.items)
    .find((item) => item.badge);

  const label = (item: NavItem) =>
    item.ns === "platform" ? tp(item.labelKey) : t(item.labelKey);
  const menuItems: MenuProps["items"] = groups.map((group) => ({
    type: "group",
    key: group.labelKey,
    label: collapsed && desktop ? null : t(group.labelKey),
    children: group.items.map((item) => ({
      key: item.key,
      icon: <item.icon />,
      label: (
        <span className={styles.menuLabel}>
          {label(item)}
          {item.badge && pendingCount > 0 ? (
            <Badge count={pendingCount} size="small" />
          ) : null}
        </span>
      ),
      onClick: () => {
        setDrawerOpen(false);
        navigate(item.to);
      },
    })),
  }));

  const language = i18n.language?.startsWith("vi") ? "vi" : "en";
  const accountMenu: MenuProps["items"] = [
    {
      key: "profile",
      disabled: true,
      label: (
        <div className={styles.profile}>
          <Typography.Text strong>{user.displayName}</Typography.Text>
          <Typography.Text type="secondary">{user.email}</Typography.Text>
          <Tag color="blue">{t(`roles.${user.role}.name`)}</Tag>
        </div>
      ),
    },
    { type: "divider" },
    {
      key: "logout",
      icon: <LogoutOutlined />,
      danger: true,
      label: t("topbar.signOut"),
      onClick: signOut,
    },
  ];

  const sider = (
    <>
      <Link to="/" className={styles.brand} aria-label={t("brand.name")}>
        <BrandMark />
        {collapsed && desktop ? null : (
          <span className={styles.brandText}>
            <b>{t("brand.name")}</b>
            <small>{t("brand.product")}</small>
          </span>
        )}
      </Link>
      <Menu
        mode="inline"
        aria-label={t("nav.label")}
        selectedKeys={chrome.active ? [chrome.active] : []}
        items={menuItems}
        className={styles.menu}
      />
    </>
  );

  return (
    <Layout className={styles.shell}>
      {desktop ? (
        <Layout.Sider
          width={248}
          collapsedWidth={72}
          collapsed={collapsed}
          trigger={null}
          className={styles.sider}
        >
          {sider}
        </Layout.Sider>
      ) : (
        <Drawer
          placement="left"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          size={280}
          closable={false}
          styles={{ body: { padding: 0 } }}
          className={styles.drawer}
        >
          {sider}
        </Drawer>
      )}
      <Layout className={styles.main}>
        <div
          className={styles.progress}
          data-active={navigation.state === "loading"}
          aria-hidden="true"
        />
        <Layout.Header className={styles.header}>
          {desktop ? (
            <Tooltip title={t(collapsed ? "topbar.expand" : "topbar.collapse")}>
              <Button
                type="text"
                icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                onClick={() => setCollapsed(!collapsed)}
                aria-label={t(collapsed ? "topbar.expand" : "topbar.collapse")}
              />
            </Tooltip>
          ) : (
            <Button
              type="text"
              icon={<MenuOutlined />}
              onClick={() => setDrawerOpen(true)}
              aria-label={t("topbar.openMenu")}
            />
          )}
          {desktop ? (
            <Breadcrumb
              className={styles.breadcrumb}
              items={chrome.breadcrumb.map((item) => ({
                title: item.to ? (
                  <Link to={item.to}>{item.label}</Link>
                ) : (
                  item.label
                ),
              }))}
            />
          ) : (
            <Link to="/" className={styles.compactBrand}>
              <BrandMark size={28} />
            </Link>
          )}
          <div className={styles.actions}>
            <Dropdown
              trigger={["click"]}
              menu={{
                selectedKeys: [language],
                items: (["vi", "en"] as const).map((code) => ({
                  key: code,
                  label: t(`languages.${code}`),
                  icon: language === code ? <CheckOutlined /> : <span />,
                  onClick: () => void i18n.changeLanguage(code),
                })),
              }}
            >
              <Button
                type="text"
                icon={<GlobalOutlined />}
                aria-label={t("topbar.language")}
              >
                {desktop ? language.toUpperCase() : null}
              </Button>
            </Dropdown>
            <Tooltip
              title={t(
                themeMode === "dark" ? "topbar.themeLight" : "topbar.themeDark",
              )}
            >
              <Button
                type="text"
                icon={themeMode === "dark" ? <SunOutlined /> : <MoonOutlined />}
                onClick={toggleTheme}
                aria-label={t(
                  themeMode === "dark"
                    ? "topbar.themeLight"
                    : "topbar.themeDark",
                )}
              />
            </Tooltip>
            {inbox ? (
              <Tooltip
                title={
                  pendingCount
                    ? t("topbar.pendingTasks", { count: pendingCount })
                    : t("topbar.noPendingTasks")
                }
              >
                <Badge count={pendingCount} size="small" offset={[-4, 4]}>
                  <Button
                    type="text"
                    icon={<BellOutlined />}
                    onClick={() => navigate(inbox.to)}
                    aria-label={t("topbar.notifications")}
                  />
                </Badge>
              </Tooltip>
            ) : null}
            <Dropdown trigger={["click"]} menu={{ items: accountMenu }}>
              <Button
                type="text"
                className={styles.account}
                aria-label={t("topbar.account")}
              >
                <Avatar size={32} className={styles.avatar}>
                  {initialsOf(user.displayName)}
                </Avatar>
                {screens.md ? (
                  <span className={styles.accountText}>
                    <b>{user.displayName}</b>
                    <small>{t(`roles.${user.role}.name`)}</small>
                  </span>
                ) : null}
              </Button>
            </Dropdown>
          </div>
        </Layout.Header>
        <Layout.Content className={styles.content}>
          <PageChromeContext.Provider value={publish}>
            <Outlet />
          </PageChromeContext.Provider>
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
