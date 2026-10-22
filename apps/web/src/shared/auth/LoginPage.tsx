import { useState } from "react";
import { Form, Input, Button, Card, Alert, Typography, Space } from "antd";
import { LockOutlined, MailOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { Navigate, useNavigate } from "react-router-dom";
import { homeByRole } from "../layout/navConfig";
import { useSession } from "./session";
export default function LoginPage() {
  const { t } = useTranslation("common");
  const { user, signIn } = useSession();
  const navigate = useNavigate();
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to={homeByRole[user.role]} replace />;
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "linear-gradient(140deg,#eef3ff,#f8fafc)",
      }}
    >
      <Card
        style={{
          width: 420,
          maxWidth: "calc(100vw - 32px)",
          boxShadow: "0 16px 64px #315bea18",
        }}
      >
        <Space orientation="vertical" size={20} style={{ width: "100%" }}>
          <Typography.Title level={3}>{t("brand.name")}</Typography.Title>
          <Typography.Text type="secondary">
            {t("brand.product")}
          </Typography.Text>
          <Typography.Title level={4}>{t("login.title")}</Typography.Title>
          {error ? (
            <Alert type="error" title={t("login.errors.INVALID_CREDENTIALS")} />
          ) : null}
          <Form
            layout="vertical"
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
        </Space>
      </Card>
    </div>
  );
}
