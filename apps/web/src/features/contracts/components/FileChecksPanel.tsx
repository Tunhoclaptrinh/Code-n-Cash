import { useTranslation } from "react-i18next";
import { BaseCard } from "@codecash/ui";
import styles from "./SidePanels.module.css";

interface FileChecksPanelProps {
  pages: number;
  signingSteps: number;
}

/** Result of the automatic checks on the uploaded file. */
export function FileChecksPanel({ pages, signingSteps }: FileChecksPanelProps) {
  const { t } = useTranslation("contracts");

  return (
    <BaseCard title={t("contractUpload.checks.title")}>
      <div className={styles.check}>
        <span className={styles.checkMark} aria-hidden="true">
          ✓
        </span>
        <span>
          <b>{t("contractUpload.checks.readable.title")}</b>{" "}
          {t("contractUpload.checks.readable.detail", { pages })}
        </span>
      </div>
      <div className={styles.check}>
        <span className={styles.checkMark} aria-hidden="true">
          ✓
        </span>
        <span>
          <b>{t("contractUpload.checks.ready.title")}</b>{" "}
          {t("contractUpload.checks.ready.detail", { steps: signingSteps })}
        </span>
      </div>
      <div className={styles.check}>
        <span className={styles.checkMark} aria-hidden="true">
          ✓
        </span>
        <span>
          <b>{t("contractUpload.checks.unsigned.title")}</b>{" "}
          {t("contractUpload.checks.unsigned.detail")}
        </span>
      </div>
    </BaseCard>
  );
}
