import { Alert, Button, Space, Typography } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";

/** Public, unsigned test files only; no real customer documents or credentials. */
export function DemoContractDownloads() {
  const { t } = useTranslation("common");
  const base = `${import.meta.env.BASE_URL}guide/samples/`;
  return (
    <section data-testid="guide-demo-contracts" style={{ marginBottom: 20 }}>
      <Typography.Title level={4}>{t("guide.samples.title")}</Typography.Title>
      <Alert
        type="info"
        showIcon
        title={t("guide.samples.notice")}
        style={{ marginBottom: 12 }}
      />
      <Space wrap>
        {[1, 2, 3, 4].map((count) => (
          <Button
            key={count}
            icon={<DownloadOutlined />}
            href={`${base}CodeCash-${count}-signers.pdf`}
            download
          >
            {t("guide.samples.pdf", { count })}
          </Button>
        ))}
        <Button
          icon={<DownloadOutlined />}
          href={`${base}CodeCash-PDF-1-4-nguoi-ky.zip`}
          download
        >
          {t("guide.samples.all")}
        </Button>
      </Space>
      <Typography.Paragraph
        type="secondary"
        style={{ marginTop: 10, marginBottom: 0 }}
      >
        {t("guide.samples.signers")}
      </Typography.Paragraph>
    </section>
  );
}
