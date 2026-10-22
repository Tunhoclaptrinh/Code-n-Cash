import { useState } from "react";
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
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const demo = useQuery({
    queryKey: ["demo-accounts"],
    queryFn: listDemoAccounts,
    staleTime: Infinity,
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
  const demoAccounts = demo.data ?? [];
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
          {demoAccounts.length ? (
            <Dropdown
              trigger={["click"]}
              placement="bottomRight"
              menu={{
                items: demoAccounts.map((account) => ({
                  key: account.email,
                  onClick: () => void signInWithDemo(account),
                  label: (
                    <span
                      className={styles.demoItem}
                      data-testid="demo-account"
                    >
                      <Avatar size={32} className={styles.demoAvatar}>
                        {initialsOf(account.displayName)}
                      </Avatar>
                      <span className={styles.demoText}>
                        <b>{account.displayName}</b>
                        <small>{account.email}</small>
                      </span>
                      <Tag color="blue" style={{ margin: 0 }}>
                        {t(`roles.${account.role}.name`)}
                      </Tag>
                    </span>
                  ),
                })),
              }}
            >
              <Button
                type="text"
                icon={<UserSwitchOutlined />}
                data-testid="demo-accounts"
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
              rules={[{ required: true, type: "email" }]}
            >
              <Input prefix={<MailOutlined />} autoComplete="username" />
            </Form.Item>
            <Form.Item
              name="password"
              label={t("login.password")}
              rules={[{ required: true }]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                autoComplete="current-password"
              />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={busy} block>
              {t("login.submit")}
            </Button>
          </Form>
          {demoAccounts.length ? (
            <Typography.Paragraph type="secondary" className={styles.hint}>
              {t("login.demoHint")}
            </Typography.Paragraph>
          ) : null}
        </div>
      </main>
    </div>
  );
}
