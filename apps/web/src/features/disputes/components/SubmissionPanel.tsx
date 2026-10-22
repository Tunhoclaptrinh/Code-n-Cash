import { useTranslation } from "react-i18next";
import { formatDateTime, formatMillionVnd } from "@/shared/lib/format";
import type { Dispute } from "../types";
import styles from "./SubmissionPanel.module.css";

/** Left column: what the supplier sent and what each outcome would pay. */
export function SubmissionPanel({ dispute }: { dispute: Dispute }) {
  const { t } = useTranslation("disputes");

  return (
    <section className={styles.panel}>
      <h2 className={styles.heading}>{t("submission.title")}</h2>
      <div className={styles.message}>
        <div className={styles.author}>
          <span className={styles.avatar}>{dispute.raisedBy.initials}</span>
          <b>
            {t("submission.author", {
              name: dispute.raisedBy.name,
              organization: dispute.raisedBy.organizationName,
            })}
          </b>
          <span className={styles.time}>
            {formatDateTime(dispute.raisedAt)}
          </span>
        </div>
        <div>{t("submission.quote", { message: dispute.message })}</div>
        {dispute.evidence.map((file) => (
          <div key={file.id} className={styles.file}>
            <span className={styles.fileKind}>{file.kind}</span>
            {file.fileName}
          </div>
        ))}
      </div>

      <h2 className={`${styles.heading} ${styles.headingSpaced}`}>
        {t("impact.title")}
      </h2>
      <div className={styles.impact}>
        <div className={styles.impactCard}>
          <div className={styles.impactLabel}>{t("impact.keepPenalty")}</div>
          <b className={styles.impactValue}>
            {formatMillionVnd(dispute.impact.keepPenaltyMillion)}
          </b>
          <span className={styles.unit}> {t("impact.unit")}</span>
        </div>
        <div className={`${styles.impactCard} ${styles.impactCardGood}`}>
          <div className={styles.impactLabel}>{t("impact.waivePenalty")}</div>
          <b className={`${styles.impactValue} ${styles.impactValueGood}`}>
            {formatMillionVnd(dispute.impact.waivePenaltyMillion)}
          </b>
          <span className={styles.unit}> {t("impact.unit")}</span>
        </div>
      </div>
      <div className={styles.footnote}>{t("impact.footnote")}</div>
    </section>
  );
}
