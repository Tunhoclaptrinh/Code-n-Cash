import { Alert, Button, Collapse, Typography } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import styles from "./guide.module.css";

/** Public, unsigned test files only; no real customer documents or credentials. */
export function DemoContractDownloads() {
  const { t } = useTranslation("common");
  const base = `${import.meta.env.BASE_URL}guide/samples/`;
  return (
    <section data-testid="guide-demo-contracts" className={styles.samples}>
      <Typography.Title level={4}>{t("guide.samples.title")}</Typography.Title>
      <Typography.Paragraph type="secondary" className={styles.samplesIntro}>
        {t("guide.samples.summary")}
      </Typography.Paragraph>
      <div className={styles.sampleDownloads}>
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
          className={styles.sampleBundle}
        >
          {t("guide.samples.all")}
        </Button>
      </div>
      <Collapse
        ghost
        size="small"
        className={styles.sampleDetails}
        items={[
          {
            key: "signers",
            label: t("guide.samples.details"),
            children: (
              <>
                <Alert type="info" showIcon title={t("guide.samples.notice")} />
                <Typography.Paragraph
                  style={{ marginTop: 10, marginBottom: 0 }}
                >
                  {t("guide.samples.signers")}
                </Typography.Paragraph>
              </>
            ),
          },
        ]}
      />
    </section>
  );
}
