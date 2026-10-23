import { useTranslation } from "react-i18next";
import { BaseCard } from "@codecash/ui";
import styles from "./SidePanels.module.css";

interface PagePreviewPanelProps {
  page: number;
  total: number;
}

/** Thumbnail of the last page of the uploaded file, where the signature blocks sit. */
export function PagePreviewPanel({ page, total }: PagePreviewPanelProps) {
  const { t } = useTranslation("contracts");

  return (
    <BaseCard
      title={t("contractUpload.preview.title")}
      extra={t("contractUpload.preview.page", { page, total })}
    >
      <div className={styles.previewStage}>
        <div className={styles.sheet}>
          <div
            className={`${styles.line} ${styles.lineStrong}`}
            style={{ width: "70%" }}
          />
          <div className={styles.line} style={{ width: "92%" }} />
          <div className={styles.line} style={{ width: "88%" }} />
          <div className={styles.line} style={{ width: "60%" }} />
          <div className={styles.signatures}>
            <div className={styles.signatureBox}>
              <span>{t("contractUpload.preview.partyA")}</span>
            </div>
            <div className={styles.signatureBox}>
              <span>{t("contractUpload.preview.partyB")}</span>
            </div>
          </div>
        </div>
      </div>
    </BaseCard>
  );
}
