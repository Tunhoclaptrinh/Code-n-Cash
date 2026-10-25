import { Button, Select } from "antd";
import { Trans, useTranslation } from "react-i18next";
import type { CanvasView } from "../hooks/useCanvasView";
import type { SlotEditor } from "../hooks/useSlotEditor";
import { ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from "../lib/signature-layout";
import type { SigningConfig } from "../types";
import styles from "./SignaturePositions.module.css";

interface PagerBarProps {
  config: SigningConfig;
  editor: SlotEditor;
  view: CanvasView;
}

/** Page navigation, fit buttons and zoom controls under the canvas. */
export function PagerBar({ config, editor, view }: PagerBarProps) {
  const { t } = useTranslation("signing");
  const { page, setPage, firstPage, lastPage } = editor;
  const { fitMode, setFitMode, setZoom, viewZoom } = view;
  return (
    <div className={styles.pager}>
      <button
        type="button"
        className={styles.pagerButton}
        aria-label={t("positions.pager.previous")}
        disabled={page <= firstPage}
        onClick={() => setPage((value) => Math.max(firstPage, value - 1))}
      >
        ◀
      </button>
      <span>
        <Trans
          t={t}
          i18nKey="positions.pager.current"
          values={{ page, total: config.pageCount }}
          components={{ b: <b className={styles.strong} /> }}
        />
      </span>
      <button
        type="button"
        className={styles.pagerButton}
        aria-label={t("positions.pager.next")}
        disabled={page >= lastPage}
        onClick={() => setPage((value) => Math.min(lastPage, value + 1))}
      >
        ▶
      </button>
      <Select
        size="small"
        aria-label={t("positions.choosePage")}
        value={page}
        onChange={setPage}
        style={{ width: 110 }}
        options={config.previewPages.map((p) => ({
          value: p.pageNo,
          label: t("positions.pageNo", { page: p.pageNo }),
        }))}
      />
      <Button
        size="small"
        onClick={() => setFitMode("width")}
        aria-pressed={fitMode === "width"}
        data-testid="signature-fit-width"
      >
        {t("positions.fitWidth")}
      </Button>
      <Button
        size="small"
        onClick={() => setFitMode("page")}
        aria-pressed={fitMode === "page"}
        data-testid="signature-fit-page"
      >
        {t("positions.fitPage")}
      </Button>
      <span className={styles.zoom}>
        {t("positions.zoom.label")}
        <button
          type="button"
          className={styles.pagerButton}
          aria-label={t("positions.zoom.out")}
          onClick={() => {
            setFitMode(null);
            setZoom(Math.max(ZOOM_MIN, viewZoom - ZOOM_STEP));
          }}
        >
          −
        </button>
        <b className={styles.zoomValue}>{viewZoom}%</b>
        <button
          type="button"
          className={styles.pagerButton}
          aria-label={t("positions.zoom.in")}
          onClick={() => {
            setFitMode(null);
            setZoom(Math.min(ZOOM_MAX, viewZoom + ZOOM_STEP));
          }}
        >
          +
        </button>
      </span>
    </div>
  );
}
