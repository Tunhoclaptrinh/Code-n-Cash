import { Button } from "antd";
import { CompressOutlined, ExpandOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import type { CanvasView } from "../hooks/useCanvasView";
import type { SlotEditor } from "../hooks/useSlotEditor";
import { cx } from "../lib/helpers";
import type { SlotFlag } from "../lib/signature-layout";
import type { SigningConfig } from "../types";
import { PageSurface } from "./PageSurface";
import { PagerBar } from "./PagerBar";
import styles from "./SignaturePositions.module.css";
import shared from "./shared.module.css";

interface PositionsCanvasCardProps {
  contractId: string;
  config: SigningConfig;
  editor: SlotEditor;
  view: CanvasView;
  flags: Record<number, SlotFlag>;
}

/** Left column: workspace header, signer chips, page canvas and pager. */
export function PositionsCanvasCard({
  contractId,
  config,
  editor,
  view,
  flags,
}: PositionsCanvasCardProps) {
  const { t } = useTranslation("signing");
  const { activeStep, selectStep } = editor;
  const { expanded, setExpanded, canvasRef, canvasHeight } = view;
  return (
    <section className={cx(shared.card, styles.canvasCard)}>
      <div className={styles.canvasHeader}>
        <span className={styles.fileMeta}>{config.fileName}</span>
        <Button
          size="small"
          icon={expanded ? <CompressOutlined /> : <ExpandOutlined />}
          onClick={() => setExpanded((value) => !value)}
          aria-pressed={expanded}
          data-testid="signature-expand"
        >
          {t(
            expanded
              ? "positions.collapseWorkspace"
              : "positions.expandWorkspace",
          )}
        </Button>
      </div>
      <div className={styles.chips}>
        {config.steps.map((step) => {
          const on = activeStep === step.stepNo;
          const params = {
            stepNo: step.stepNo,
            party: t(`party.${step.party}`),
          };
          return (
            <button
              key={step.stepNo}
              type="button"
              className={on ? styles.chipOn : styles.chip}
              aria-pressed={on}
              data-testid={`signer-step-${step.stepNo}`}
              onClick={() => selectStep(step.stepNo)}
            >
              {t(
                on ? "positions.stepChipActive" : "positions.stepChip",
                params,
              )}
            </button>
          );
        })}
        <span className={styles.hint}>{t("prepLite.positions.hint")}</span>
      </div>
      <div
        className={styles.canvas}
        ref={canvasRef}
        data-testid="signature-canvas"
        style={{ height: canvasHeight }}
      >
        <PageSurface
          contractId={contractId}
          config={config}
          editor={editor}
          view={view}
          flags={flags}
        />
      </div>
      <PagerBar config={config} editor={editor} view={view} />
    </section>
  );
}
