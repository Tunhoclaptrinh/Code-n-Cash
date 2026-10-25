import { useState } from "react";
import { fold } from "@codecash/contracts";
import {
  Alert,
  Avatar,
  Button,
  Dropdown,
  Form,
  Input,
  Tag,
  Typography,
} from "antd";
import {
  AuditOutlined,
  DownOutlined,
  FileProtectOutlined,
  LockOutlined,
  MailOutlined,
  SafetyCertificateOutlined,
  UserSwitchOutlined,
} from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Navigate, useNavigate } from "react-router-dom";
import { listDemoAccounts, type DemoAccount } from "../api/auth.api";
import { homeByRole } from "../layout/navConfig";
import { initialsOf } from "../lib/initials";
import { PreferenceControls } from "../layout/PreferenceControls";
import { useOnboarding } from "../onboarding/OnboardingContext";
import { BrandMark } from "../ui/BrandMark";
import { useSession } from "./session";
import styles from "./LoginPage.module.css";

const HIGHLIGHTS = [
  { key: "sign", icon: <SafetyCertificateOutlined /> },
  { key: "evidence", icon: <FileProtectOutlined /> },
  { key: "audit", icon: <AuditOutlined /> },
] as const;

export default function LoginPage() {
  const { t } = useTranslation("common");
  const { phase } = useOnboarding();
  const { user, signIn, signInDemo } = useSession();
  const navigate = useNavigate();
  const [form] = Form.useForm<{ email: string; password: string }>();
  const [demoSearch, setDemoSearch] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const demo = useQuery({
    queryKey: ["demo-accounts"],
    queryFn: listDemoAccounts,
    staleTime: 30_000,
    retry: 1,
    refetchOnWindowFocus: "always",
    refetchInterval: (query) =>
      query.state.status === "error" ? 5_000 : false,
  });
  if (user) return <Navigate to={homeByRole[user.role]} replace />;

  /** Fills the form so the choice is visible, then signs in without a password. */
  const signInWithDemo = async (account: DemoAccount) => {
    form.setFieldsValue({ email: account.email, password: "" });
    setBusy(true);
    setError(false);
    try {
      const actor = await signInDemo(account.email);
      navigate(homeByRole[actor.role], { replace: true });
    } catch {
      setError(true);
      setBusy(false);
    }
  };
  const featured = demo.data?.featured ?? [];
  const organizations = demo.data?.organizations ?? [];
  const demoEnabled = demo.data?.enabled !== false;
  const accountItem = (account: DemoAccount) => ({
    key: account.email,
    onClick: () => void signInWithDemo(account),
    label: (
      <span className={styles.demoItem} data-testid="demo-account">
        <Avatar size={32} className={styles.demoAvatar}>
          {initialsOf(account.displayName)}
        </Avatar>
        <span className={styles.demoText}>
          <b>{account.displayName}</b>
          <small>
            {account.email}
            {account.partyId ? ` · ${account.partyId}` : ""}
          </small>
        </span>
        <Tag color="blue" style={{ margin: 0 }}>
          {t(`roles.${account.role}.name`)}
        </Tag>
      </span>
    ),
  });
  const foundAccounts = [
    ...featured,
    ...organizations.flatMap((org) => org.accounts),
  ].filter((account) =>
    fold(
      [
        account.displayName,
        account.email,
        account.organization,
        account.partyId,
        t(`roles.${account.role}.name`),
      ].join(" "),
    ).includes(fold(demoSearch.trim())),
  );
  return (
    <div className={styles.page}>
      <aside className={styles.brandPanel}>
        <div className={styles.brand}>
          <BrandMark size={40} inverse />
          <span>
            <b>{t("brand.name")}</b>
            <small>{t("brand.product")}</small>
          </span>
        </div>
        <p className={styles.tagline}>{t("login.subtitle")}</p>
        <ul className={styles.highlights}>
          {HIGHLIGHTS.map((item) => (
            <li key={item.key}>
              <span className={styles.highlightIcon}>{item.icon}</span>
              {t(`login.highlights.${item.key}`)}
            </li>
          ))}
        </ul>
      </aside>
      <main className={styles.formPanel}>
        <div
          className={styles.toolbar}
          style={phase === "tips" ? { zIndex: 1002 } : undefined}
        >
          {demoEnabled ? (
            <Dropdown
              trigger={["click"]}
              placement="bottomRight"
              popupRender={(menu) => (
                <div
                  style={{
                    background: "var(--bg-surface-card)",
                    padding: 8,
                    borderRadius: 8,
                    maxWidth: "calc(100vw - 24px)",
                    width: 520,
                  }}
                >
                  <Input.Search
                    autoFocus
                    value={demoSearch}
                    onChange={(e) => setDemoSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== "Escape") e.stopPropagation();
                    }}
                    placeholder={t("login.demoSearch")}
                    data-testid="demo-account-search"
                    style={{ marginBottom: 8 }}
                  />
                  {menu}
                </div>
              )}
              menu={{
                style: { maxHeight: "70vh", overflowY: "auto" },
                items: demoSearch.trim()
                  ? foundAccounts.map(accountItem)
                  : featured.length || organizations.length
                    ? [
                        {
                          type: "group",
                          key: "featured",
                          label: t("login.demoFeatured"),
                          children: featured.map(accountItem),
                        },
                        { type: "divider" },
                        {
                          key: "all",
                          label: t("login.demoAll"),
                          children: organizations.map((org) => ({
                            key: org.id,
                            label: `${org.id} · ${org.name}`,
                            children: org.accounts.map(accountItem),
                          })),
                        },
                      ]
                    : [
                        {
                          key: "status",
                          disabled: true,
                          label: t(
                            demo.isError
                              ? "login.demoUnavailable"
                              : demo.isPending
                                ? "common.loading"
                                : "login.demoEmpty",
                          ),
                        },
                        {
                          key: "retry",
                          label: t("common.retry"),
                          onClick: () => void demo.refetch(),
                        },
                      ],
              }}
            >
              <Button
                type="text"
                icon={<UserSwitchOutlined />}
                data-testid="demo-accounts"
                loading={demo.isFetching}
              >
                {t("login.demoAccounts")} <DownOutlined />
              </Button>
            </Dropdown>
          ) : null}
          <PreferenceControls />
        </div>
        <div className={styles.form}>
          <div className={styles.compactBrand}>
            <BrandMark size={36} />
            <b>{t("brand.name")}</b>
          </div>
          <Typography.Title level={2} className={styles.title}>
            {t("login.title")}
          </Typography.Title>
          <Typography.Paragraph type="secondary">
            {t("brand.product")}
          </Typography.Paragraph>
          {error ? (
            <Alert
              type="error"
              showIcon
              title={t("login.errors.INVALID_CREDENTIALS")}
              style={{ marginBottom: 16 }}
            />
          ) : null}
          {demo.isError ? (
            <Alert
              type="warning"
              showIcon
              title={t("login.demoUnavailable")}
              action={
                <Button
                  size="small"
                  loading={demo.isFetching}
                  onClick={() => void demo.refetch()}
                >
                  {t("common.retry")}
                </Button>
              }
              style={{ marginBottom: 16 }}
              data-testid="demo-accounts-error"
            />
          ) : null}
          <Form
            form={form}
            layout="vertical"
            requiredMark={false}
            size="large"
            onFinish={async ({ email, password }) => {
              setBusy(true);
              setError(false);
              try {
                const actor = await signIn(email, password);
                navigate(homeByRole[actor.role], { replace: true });
              } catch {
                setError(true);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Form.Item
              name="email"
              label={t("login.email")}
              rules={[
                {
                  required: true,
                  message: t("forms.required", { field: t("login.email") }),
                },
                {
                  type: "email",
                  message: t("forms.email", { field: t("login.email") }),
                },
                {
                  max: 254,
                  message: t("forms.invalid", { field: t("login.email") }),
                },
              ]}
            >
              <Input
                placeholder={t("login.emailPlaceholder")}
                maxLength={254}
                prefix={<MailOutlined />}
                autoComplete="username"
              />
            </Form.Item>
            <Form.Item
              name="password"
              label={t("login.password")}
              rules={[
                {
                  required: true,
                  message: t("forms.required", { field: t("login.password") }),
                },
              ]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                autoComplete="current-password"
                placeholder={t("forms.enter", { field: t("login.password") })}
                maxLength={1024}
              />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={busy} block>
              {t("login.submit")}
            </Button>
          </Form>
          {demoEnabled ? (
            <Typography.Paragraph type="secondary" className={styles.hint}>
              {t("login.demoHint")}
            </Typography.Paragraph>
          ) : null}
        </div>
      </main>
    </div>
  );
}
