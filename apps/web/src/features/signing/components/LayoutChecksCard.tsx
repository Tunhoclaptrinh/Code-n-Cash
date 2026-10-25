import { useTranslation } from "react-i18next";
import { cx } from "../lib/helpers";
import type { LayoutCheck } from "../lib/signature-layout";
import styles from "./SignaturePositions.module.css";
import shared from "./shared.module.css";

/** Live checklist of the layout rules, announced politely to assistive tech. */
export function LayoutChecksCard({ checks }: { checks: LayoutCheck[] }) {
  const { t } = useTranslation("signing");
  return (
    <section className={cx(shared.card, styles.checksCard)} aria-live="polite">
      <h2>{t("positions.checks.title")}</h2>
      {checks.map((check) => {
        const pending = check.pending && check.ok;
        const state = pending ? "Pending" : check.ok ? "Ok" : "Fail";
        return (
          <div key={check.code} className={styles.check}>
            <span className={styles[`checkIcon${state}`]} aria-hidden="true">
              {pending ? "•" : check.ok ? "✓" : "✕"}
            </span>
            <span className={styles[`checkText${state}`]}>
              {t(`positions.checks.${check.code}`)}
            </span>
          </div>
        );
      })}
    </section>
  );
}
