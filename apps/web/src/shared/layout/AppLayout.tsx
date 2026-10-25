import { useCallback, useState } from "react";
import {
  App,
  Avatar,
  Badge,
  Button,
  Drawer,
  Dropdown,
  Grid,
  Layout,
  Menu,
  Tag,
  Tooltip,
} from "antd";
import type { MenuProps } from "antd";
import {
  BellOutlined,
  LeftOutlined,
  LogoutOutlined,
  MenuOutlined,
  RightOutlined,
  UndoOutlined,
} from "@ant-design/icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Link,
  Outlet,
  useLocation,
  useNavigate,
  useNavigation,
} from "react-router-dom";
import { useAccess, useLocalStorage } from "@codecash/ui";
import { resetDemoData } from "../api/auth.api";
import { listPendingTasks } from "../api/tasks.api";
import { useDemoMode } from "../auth/useDemoMode";
import { useCurrentUser, useSession } from "../auth/session";
import { initialsOf } from "../lib/initials";
import { useOnboarding } from "../onboarding/OnboardingContext";
import { BrandMark } from "../ui/BrandMark";
import { navByRole, type NavItem } from "./navConfig";
import { NotificationDrawer } from "./NotificationDrawer";
import { PageChromeContext, type PageChrome } from "./pageChrome";
import { PreferenceControls } from "./PreferenceControls";
import styles from "./AppLayout.module.css";

const roleColor: Record<string, string> = {
  CONTRACT_OWNER: "blue",
  LEGAL_REVIEWER: "geekblue",
  FINANCE_APPROVER: "green",
  SECONDARY_APPROVER: "cyan",
  ADMIN_AUDITOR: "red",
  SYSTEM_ADMIN: "volcano",
  AUDITOR: "purple",
  SUPPLIER: "gold",
};

/**
 * Persistent frame for signed-in routes, following UniFlow's MainLayout: a full-width header
 * (brand, help/language/theme, notifications, account), a sidebar below it and the routed page.
 * Pages publish their breadcrumb and active nav entry through `AppPage`.
 */
export function AppLayout() {
  const { t } = useTranslation("common");
  const { t: tp } = useTranslation("platform");
  const user = useCurrentUser();
  const { signOut } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const navigation = useNavigation();
  const { phase } = useOnboarding();
  const screens = Grid.useBreakpoint();
  const desktop = screens.lg ?? true;
  const [collapsed, setCollapsed] = useLocalStorage(
    "codecash.sider.collapsed",
    false,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [chrome, setChrome] = useState<PageChrome>({ breadcrumb: [] });
  const publish = useCallback((next: PageChrome) => setChrome(next), []);

  // Count the same list the notification drawer shows, so badge and list always agree.
  const pending = useQuery({
    queryKey: ["pending-tasks", user.id],
    queryFn: listPendingTasks,
  });
  const pendingCount = pending.data?.length ?? 0;

  // Demo deployments only: the system administrator restores the initial data before a session.
  const { modal, message } = App.useApp();
  const { hasPermission } = useAccess(user);
  const canResetDemo = useDemoMode() && hasPermission("demo:reset");
  const resetDemo = useMutation({
    mutationFn: resetDemoData,
    onSuccess: () => {
      void message.success(t("topbar.resetDemo.done"));
      signOut();
    },
    onError: () => void message.error(t("topbar.resetDemo.failed")),
  });
  const confirmResetDemo = () =>
    modal.confirm({
      title: t("topbar.resetDemo.title"),
      content: t("topbar.resetDemo.body"),
      okText: t("topbar.resetDemo.ok"),
      okButtonProps: { danger: true },
      onOk: () => resetDemo.mutateAsync(),
    });
  const sections = navByRole[user.role];
  const navItems = sections.flatMap((section) => section.items);
  const inbox = navItems.find((item) => item.badge);

  const label = (item: { labelKey: string; ns?: string }) =>
    item.ns === "platform" ? tp(item.labelKey) : t(item.labelKey);
  const go = (to: string) => {
    setDrawerOpen(false);
    navigate(to);
  };
  const toMenuItem = (
    item: NavItem,
  ): NonNullable<MenuProps["items"]>[number] =>
    item.children
      ? {
          key: item.key,
          icon: <item.icon />,
          label: label(item),
          children: item.children.map((child) => ({
            key: child.to,
            label: label(child),
            onClick: () => go(child.to),
          })),
        }
      : {
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
          onClick: () => go(item.to),
        };
  // Business areas get a heading; when the sidebar is collapsed a divider stands in for it.
  const menuItems: MenuProps["items"] = sections.flatMap((section, index) =>
    desktop && collapsed
      ? [
          ...(index > 0 ? [{ type: "divider" as const }] : []),
          ...section.items.map(toMenuItem),
        ]
      : [
          {
            type: "group" as const,
            key: section.labelKey,
            label: t(section.labelKey),
            children: section.items.map(toMenuItem),
          },
        ],
  );
  const submenuKeys = navItems
    .filter((item) => item.children)
    .map((item) => item.key);

  const accountMenu: MenuProps["items"] = [
    {
      key: "profile",
      disabled: true,
      label: (
        <div className={styles.profile}>
          <b>{user.displayName}</b>
          <span>{user.email}</span>
        </div>
      ),
    },
    { type: "divider" },
    ...(canResetDemo
      ? [
          {
            key: "reset-demo",
            icon: <UndoOutlined />,
            label: t("topbar.resetDemo.action"),
            onClick: confirmResetDemo,
          },
        ]
      : []),
    {
      key: "logout",
      icon: <LogoutOutlined />,
      danger: true,
      label: t("topbar.signOut"),
      onClick: signOut,
    },
  ];

  const menu = (
    <Menu
      className="base-sidebar-menu"
      mode="inline"
      aria-label={t("nav.label")}
      selectedKeys={[chrome.active ?? "", location.pathname]}
      defaultOpenKeys={submenuKeys}
      items={menuItems}
    />
  );
  const footerCollapsed = desktop && collapsed;
  // Only the organisation the user works for; build and environment details stay out of the UI.
  const siderFooter = footerCollapsed ? null : (
    <div className={styles.siderFooter}>
      <div className={styles.siderFooterTitle}>{t("sider.organization")}</div>
      <div className={styles.siderFooterText}>{user.roleChipOrganization}</div>
    </div>
  );

  return (
    <Layout className={styles.shell}>
      <Layout.Header
        className={styles.header}
        style={phase === "tips" ? { zIndex: 1002 } : undefined}
      >
        <div className={styles.headerLeft}>
          {desktop ? null : (
            <Button
              type="text"
              icon={<MenuOutlined />}
              onClick={() => setDrawerOpen(true)}
              aria-label={t("topbar.openMenu")}
            />
          )}
          <Link to="/" className={styles.brand} aria-label={t("brand.name")}>
            <BrandMark size={32} />
            {screens.sm === false ? null : (
              <span className={styles.brandText}>
                <b>{t("brand.name")}</b>
                <small>{t("brand.product")}</small>
              </span>
            )}
          </Link>
        </div>
        <div className={styles.actions}>
          <PreferenceControls compact={!desktop} />
          {inbox ? (
            <Tooltip title={t("topbar.notifications")}>
              <Badge count={pendingCount} size="small" offset={[-4, 4]}>
                <Button
                  type="text"
                  shape="circle"
                  icon={<BellOutlined />}
                  onClick={() => setNotificationsOpen(true)}
                  aria-label={t("topbar.notifications")}
                  data-testid="header-notifications"
                />
              </Badge>
            </Tooltip>
          ) : null}
          <Dropdown
            trigger={["click"]}
            menu={{ items: accountMenu }}
            placement="bottomRight"
          >
            <button
              type="button"
              className={styles.account}
              aria-label={t("topbar.account")}
            >
              <Avatar size={30} className={styles.avatar}>
                {initialsOf(user.displayName)}
              </Avatar>
              {screens.md ? (
                <>
                  <span className={styles.accountName}>{user.displayName}</span>
                  <Tag color={roleColor[user.role]} className={styles.roleTag}>
                    {t(`roles.${user.role}.name`)}
                  </Tag>
                </>
              ) : null}
            </button>
          </Dropdown>
        </div>
        <div
          className={styles.progress}
          data-active={navigation.state === "loading"}
          aria-hidden="true"
        />
      </Layout.Header>

      <Layout hasSider className={styles.body}>
        {desktop ? (
          <Layout.Sider
            width={240}
            collapsedWidth={70}
            collapsed={collapsed}
            trigger={null}
            className={styles.sider}
          >
            <div className={styles.siderInner}>
              <div className={styles.siderMenu}>{menu}</div>
              {siderFooter}
            </div>
            <button
              type="button"
              className={styles.collapse}
              onClick={() => setCollapsed(!collapsed)}
              aria-label={t(collapsed ? "topbar.expand" : "topbar.collapse")}
              title={t(collapsed ? "topbar.expand" : "topbar.collapse")}
            >
              {collapsed ? <RightOutlined /> : <LeftOutlined />}
            </button>
          </Layout.Sider>
        ) : (
          <Drawer
            placement="left"
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            size={280}
            title={
              <span className={styles.brand}>
                <BrandMark size={28} />
                <span className={styles.brandText}>
                  <b>{t("brand.name")}</b>
                  <small>{t("brand.product")}</small>
                </span>
              </span>
            }
            styles={{ body: { padding: "8px 0" } }}
          >
            {menu}
            {siderFooter}
          </Drawer>
        )}
        <Layout.Content className={styles.content}>
          <PageChromeContext.Provider value={publish}>
            <Outlet />
          </PageChromeContext.Provider>
        </Layout.Content>
      </Layout>

      {inbox ? (
        <NotificationDrawer
          open={notificationsOpen}
          userId={user.id}
          inboxPath={inbox.to}
          onClose={() => setNotificationsOpen(false)}
        />
      ) : null}
    </Layout>
  );
}
