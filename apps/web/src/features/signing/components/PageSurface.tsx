import { useTranslation } from "react-i18next";
import { PdfPageImage } from "@/shared/ui/PdfPageImage";
import type { CanvasView } from "../hooks/useCanvasView";
import type { SlotEditor } from "../hooks/useSlotEditor";
import { cx } from "../lib/helpers";
import {
  PAGE_WIDTH,
  pageHeightOf,
  type Box,
  type SlotFlag,
} from "../lib/signature-layout";
import { printedAreas } from "../lib/signer-placement";
import { toneClass } from "../lib/tone";
import type { SigningConfig } from "../types";
import { DraftPageContent } from "./DraftPageContent";
import styles from "./SignaturePositions.module.css";

interface PageSurfaceProps {
  contractId: string;
  config: SigningConfig;
  editor: SlotEditor;
  view: CanvasView;
  flags: Record<number, SlotFlag>;
}

/** The scaled page with its drawing surface, printed areas and signature boxes. */
export function PageSurface({
  contractId,
  config,
  editor,
  view,
  flags,
}: PageSurfaceProps) {
  const { t } = useTranslation("signing");
  const { steps, previewPages } = config;
  const {
    boxes,
    looks,
    activeStep,
    page,
    setActiveStep,
    setImageReady,
    onPageDown,
    onPageMove,
    onPageUp,
    onBoxDown,
    onBoxKey,
  } = editor;
  const { scale } = view;
  const visibleSteps = steps.filter(
    (step) => boxes[step.stepNo]?.page === page,
  );
  const height = pageHeightOf(previewPages, page);

  return (
    <div
      style={{
        width: Math.round(PAGE_WIDTH * scale),
        height: Math.round(height * scale),
      }}
      className={styles.pageBox}
    >
      <div
        data-pagearea="1"
        className={styles.page}
        style={{
          transform: `scale(${scale})`,
          height,
        }}
        onPointerDown={onPageDown}
        onPointerMove={onPageMove}
        onPointerUp={onPageUp}
        onPointerCancel={onPageUp}
      >
        {config.documentId ? (
          <PdfPageImage
            contractId={contractId}
            documentId={config.documentId}
            page={page}
            onReady={setImageReady}
          />
        ) : (
          <DraftPageContent config={config} page={page} />
        )}

        {steps.flatMap((step) =>
          printedAreas(config, step)
            .filter((area) => area.page === page)
            .map((area, index) => (
              <span
                key={`${step.stepNo}-${index}`}
                data-anchor-step={step.stepNo}
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: area.x,
                  top: area.y,
                  width: area.w,
                  height: area.h,
                  pointerEvents: "none",
                }}
              />
            )),
        )}
        {visibleSteps.map((step) => {
          const box = boxes[step.stepNo] as Box;
          const flag = flags[step.stepNo];
          const bad = flag.over || flag.overlap || flag.wrong;
          const selected = activeStep === step.stepNo;
          const look = looks[step.stepNo];
          return (
            <div
              key={step.stepNo}
              data-box="1"
              data-slot-step={step.stepNo}
              className={cx(
                toneClass(step.stepNo),
                styles.slot,
                bad && styles.slotBad,
                selected && styles.slotSelected,
              )}
              style={{
                left: box.x,
                top: box.y,
                width: box.w,
                height: box.h,
              }}
            >
              <button
                type="button"
                className={styles.slotButton}
                aria-label={t("positions.slot.aria", {
                  stepNo: step.stepNo,
                  party: t(`party.${step.party}`),
                })}
                onPointerDown={(event) => onBoxDown(event, step.stepNo, "move")}
                onKeyDown={(event) => onBoxKey(event, step.stepNo)}
                onFocus={() => setActiveStep(step.stepNo)}
              >
                <span className={styles.slotLine1}>
                  {t("slot.label", { stepNo: step.stepNo })}
                </span>
                <span className={styles.slotLine3}>{step.signerName}</span>
                {look === "WITH_TITLE" ? (
                  <span className={styles.slotLine4}>{step.signerTitle}</span>
                ) : null}
                <span className={styles.slotLine4}>
                  {t("positions.slot.signDate")}
                </span>
              </button>
              <span
                className={styles.slotHandle}
                aria-hidden="true"
                onPointerDown={(event) =>
                  onBoxDown(event, step.stepNo, "resize")
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
