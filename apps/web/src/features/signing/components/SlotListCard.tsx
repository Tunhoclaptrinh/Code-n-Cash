import { Button, Segmented, Tooltip } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
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
  const widthPt = (pageNo: number) =>
    previewPages.find((p) => p.pageNo === pageNo)?.widthPt;
  return (
    <section className={cx(shared.card, styles.listCard)}>
      <div className={styles.listHeader}>
        <h2>{t("positions.list.title")}</h2>
        <Button
          size="small"
          className={styles.resetButton}
          loading={reset.isPending}
          onClick={() => reset.mutate()}
          data-testid="positions-suggest"
        >
          {t("positions.list.reset")}
        </Button>
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
              <b className={styles.cardTitle}>
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
            <div className={styles.cardMeta}>
              {box ? (
                <span
                  className={styles.cardPosition}
                  title={t("positions.list.position", {
                    page: box.page,
                    top: toMm(box.y, widthPt(box.page)),
                    left: toMm(box.x, widthPt(box.page)),
                    width: toMm(box.w, widthPt(box.page)),
                    height: toMm(box.h, widthPt(box.page)),
                  })}
                >
                  {t("prepLite.positions.page", { page: box.page })}
                </span>
              ) : null}
              <Button
                type="link"
                size="small"
                className={styles.cardLink}
                onClick={() => selectStep(step.stepNo)}
              >
                {t("positions.showArea")}
              </Button>
              {box ? (
                <Tooltip title={t("positions.list.remove")}>
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    aria-label={t("positions.list.remove")}
                    className={styles.cardRemove}
                    onClick={() => put(step.stepNo, null)}
                    data-testid={`slot-remove-${step.stepNo}`}
                  />
                </Tooltip>
              ) : null}
            </div>
            {wrongSignerArea(config, step) ? (
              <span className={styles.checkTextFail}>
                {t("positions.missingPrintedName")}
              </span>
            ) : null}
            {/* The look is one choice of two, so it reads as a segmented switch. */}
            <Segmented
              block
              size="small"
              aria-label={t("positions.list.look.label")}
              value={look}
              options={(["NAME_AND_TIME", "WITH_TITLE"] as const).map(
                (option) => ({
                  value: option,
                  label: t(`positions.list.look.${option}`),
                }),
              )}
              onChange={(option) =>
                setLooks((current) => ({
                  ...current,
                  [step.stepNo]: option as typeof look,
                }))
              }
              data-testid={`slot-look-${step.stepNo}`}
            />
          </div>
        );
      })}
    </section>
  );
}
