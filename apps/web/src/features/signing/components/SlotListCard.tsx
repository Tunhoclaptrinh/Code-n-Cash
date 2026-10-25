import { Button } from "antd";
import { useTranslation } from "react-i18next";
import type { SlotEditor } from "../hooks/useSlotEditor";
import { cx } from "../lib/helpers";
import { toMm, type SlotFlag } from "../lib/signature-layout";
import { wrongSignerArea } from "../lib/signer-placement";
import { toneClass } from "../lib/tone";
import type { SigningConfig } from "../types";
import styles from "./SignaturePositions.module.css";
import shared from "./shared.module.css";

interface SlotListCardProps {
  config: SigningConfig;
  editor: SlotEditor;
  flags: Record<number, SlotFlag>;
}

/** One card per signing step with its position, look options and actions. */
export function SlotListCard({ config, editor, flags }: SlotListCardProps) {
  const { t } = useTranslation("signing");
  const { steps, previewPages } = config;
  const { boxes, looks, setLooks, activeStep, put, reset, selectStep } = editor;
  return (
    <section className={cx(shared.card, styles.listCard)}>
      <div className={styles.listHeader}>
        <h2>{t("positions.list.title")}</h2>
        <button
          type="button"
          className={styles.resetButton}
          onClick={() => reset.mutate()}
          data-testid="positions-suggest"
        >
          {t("positions.list.reset")}
        </button>
      </div>
      {steps.map((step) => {
        const box = boxes[step.stepNo];
        const flag = flags[step.stepNo];
        const bad = Boolean(box && (flag.over || flag.overlap || flag.wrong));
        const on = activeStep === step.stepNo;
        const look = looks[step.stepNo];
        const status = !box ? "UNASSIGNED" : bad ? "NEEDS_FIX" : "ASSIGNED";
        return (
          <div
            key={step.stepNo}
            className={cx(
              toneClass(step.stepNo),
              styles.card,
              on && styles.cardActive,
            )}
          >
            <div className={styles.cardTop}>
              <span className={styles.cardNumber}>{step.stepNo}</span>
              <b>
                {t("positions.list.cardTitle", {
                  party: t(`party.${step.party}`),
                  person: step.signerName,
                })}
              </b>
              <span
                className={cx(
                  shared.pill,
                  styles.cardStatus,
                  styles[`status${status}`],
                )}
              >
                {t(`positions.list.status.${status}`)}
              </span>
            </div>
            <Button
              type="link"
              size="small"
              onClick={() => selectStep(step.stepNo)}
            >
              {t("positions.showArea")}
            </Button>
            {wrongSignerArea(config, step) ? (
              <span className={styles.checkTextFail}>
                {t("positions.missingPrintedName")}
              </span>
            ) : null}
            <div className={styles.cardPosition}>
              {box
                ? t("positions.list.position", {
                    page: box.page,
                    top: toMm(
                      box.y,
                      previewPages.find((p) => p.pageNo === box.page)?.widthPt,
                    ),
                    left: toMm(
                      box.x,
                      previewPages.find((p) => p.pageNo === box.page)?.widthPt,
                    ),
                    width: toMm(
                      box.w,
                      previewPages.find((p) => p.pageNo === box.page)?.widthPt,
                    ),
                    height: toMm(
                      box.h,
                      previewPages.find((p) => p.pageNo === box.page)?.widthPt,
                    ),
                  })
                : t("positions.list.empty")}
            </div>
            <div className={styles.cardActions}>
              <span className={styles.cardLookLabel}>
                {t("positions.list.look.label")}
              </span>
              {(["NAME_AND_TIME", "WITH_TITLE"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={cx(
                    styles.lookButton,
                    look === option && styles.lookButtonOn,
                  )}
                  aria-pressed={look === option}
                  onClick={() =>
                    setLooks((current) => ({
                      ...current,
                      [step.stepNo]: option,
                    }))
                  }
                >
                  {t(`positions.list.look.${option}`)}
                </button>
              ))}
              <button
                type="button"
                className={cx(
                  styles.removeButton,
                  !box && styles.removeButtonOff,
                )}
                onClick={() => put(step.stepNo, null)}
              >
                {t("positions.list.remove")}
              </button>
            </div>
          </div>
        );
      })}
    </section>
  );
}
