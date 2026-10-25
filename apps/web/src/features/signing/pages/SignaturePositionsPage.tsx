import { Button, Select } from "antd";
import { printedAreas, wrongSignerArea } from "../lib/signer-placement";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trans, useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AppPage } from "@/shared/layout/AppPage";
import {
  getDefaultSignatureSlots,
  getSigningConfig,
  saveSignatureSlots,
  signingKeys,
} from "../api/signingConfig.api";
import { PageState } from "@/shared/ui/PageState";
import { WizardStepper } from "../components/WizardStepper";
import { toneClass } from "../lib/tone";
import { cx } from "../lib/helpers";
import type {
  Rect,
  SignatureSlot,
  SigningConfig,
  SignStepView,
  SlotLook,
  SlotMap,
} from "../types";
import shared from "../components/shared.module.css";
import "../signingTokens.css";
import styles from "./SignaturePositionsPage.module.css";
import { PdfPageImage } from "@/shared/ui/PdfPageImage";
import { Alert } from "antd";

const PAGE_WIDTH = 520;
const PAGE_HEIGHT = 620;
const PAGE_WIDTH_MM = 210;
const ZOOM_MIN = 40;
const ZOOM_MAX = 125;
const ZOOM_STEP = 25;
const KEY_STEP = 4;
const LINE_WIDTHS = [94, 88, 91, 62, 90, 86, 93, 70, 88, 92, 84, 60];

type Box = Omit<SignatureSlot, "look">;
type Boxes = Record<number, Box | null>;
type Looks = Record<number, SlotLook>;
type DragState =
  | {
      mode: "draw";
      el: HTMLElement;
      sx: number;
      sy: number;
      moved: boolean;
      id: number;
      page: number;
    }
  | {
      mode: "move" | "resize";
      el: HTMLElement;
      id: number;
      start: Box;
      offX: number;
      offY: number;
    };

const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(high, value));
const toMm = (value: number, widthPt?: number) =>
  Math.round(
    (value * (widthPt ? (widthPt * 25.4) / 72 : PAGE_WIDTH_MM)) / PAGE_WIDTH,
  );
const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function fit(box: Box, height = PAGE_HEIGHT): Box {
  const w = clamp(Math.round(box.w), 80, 320);
  const h = clamp(Math.round(box.h), 40, 200);
  return {
    page: box.page,
    w,
    h,
    x: clamp(Math.round(box.x), 0, PAGE_WIDTH - w),
    y: clamp(Math.round(box.y), 0, height - h),
  };
}

function splitSlots(slots: SlotMap): { boxes: Boxes; looks: Looks } {
  const boxes: Boxes = {};
  const looks: Looks = {};
  for (const [key, slot] of Object.entries(slots)) {
    const stepNo = Number(key);
    looks[stepNo] = slot?.look ?? "NAME_AND_TIME";
    boxes[stepNo] = slot
      ? { page: slot.page, x: slot.x, y: slot.y, w: slot.w, h: slot.h }
      : null;
  }
  return { boxes, looks };
}

function mergeSlots(
  steps: SignStepView[],
  boxes: Boxes,
  looks: Looks,
): SlotMap {
  const slots: SlotMap = {};
  for (const step of steps) {
    const box = boxes[step.stepNo];
    slots[step.stepNo] = box
      ? { ...box, look: looks[step.stepNo] ?? "NAME_AND_TIME" }
      : null;
  }
  return slots;
}

export default function SignaturePositionsPage() {
  const { t } = useTranslation("signing");
  const contractId = useParams().contractId ?? "";
  const config = useQuery({
    queryKey: signingKeys.config(contractId),
    queryFn: () => getSigningConfig(contractId),
  });

  return (
    <AppPage
      guide="signing"
      active="upload"
      breadcrumb={[
        {
          label: t("positions.breadcrumb.parent"),
          to: `/contracts/new?draft=${encodeURIComponent(contractId)}`,
        },
        { label: t("positions.breadcrumb.current") },
      ]}
    >
      {config.data ? (
        <Editor
          key={`${config.data.documentId ?? "seed"}:${config.data.layoutVersion ?? 0}`}
          contractId={contractId}
          config={config.data}
        />
      ) : (
        <PageState kind={config.isError ? "error" : "loading"} />
      )}
    </AppPage>
  );
}

interface EditorProps {
  contractId: string;
  config: SigningConfig;
}

function Editor({ contractId, config }: EditorProps) {
  const { t } = useTranslation("signing");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { steps, previewPages } = config;
  const { t: td } = useTranslation("domain");
  const lastPage =
    previewPages[previewPages.length - 1]?.pageNo ?? config.pageCount;
  const firstPage = previewPages[0]?.pageNo ?? lastPage;

  const initial = splitSlots(config.slots);
  const [boxes, setBoxes] = useState<Boxes>(initial.boxes);
  const [looks, setLooks] = useState<Looks>(initial.looks);
  const [activeStep, setActiveStep] = useState(steps[0]?.stepNo ?? 1);
  const [page, setPage] = useState(
    initial.boxes[steps[0]?.stepNo ?? 1]?.page ?? lastPage,
  );
  const [zoom, setZoom] = useState(100);
  const [autoFit, setAutoFit] = useState(true);
  const [canvasHeight, setCanvasHeight] = useState(420);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 560, height: 580 });
  useEffect(() => {
    if (!canvasRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      setCanvasSize({ width: rect.width, height: rect.height });
    });
    observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, []);
  const [imageReady, setImageReady] = useState(false);
  const pageHeight = (number: number) =>
    previewPages.find((p) => p.pageNo === number)?.height ?? PAGE_HEIGHT;
  const drag = useRef<DragState | null>(null);

  const save = useMutation({
    mutationFn: () =>
      saveSignatureSlots(
        contractId,
        mergeSlots(steps, boxes, looks),
        config.documentId
          ? {
              documentSha256: config.documentSha256,
              version: config.layoutVersion,
            }
          : undefined,
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["signing"] });
      void navigate(`/contracts/${contractId}/digitize`);
    },
  });
  const reset = useMutation({
    mutationFn: () => getDefaultSignatureSlots(contractId),
    onSuccess: (slots) => {
      const next = splitSlots(slots);
      setBoxes(next.boxes);
      setLooks(next.looks);
      setPage(Object.values(next.boxes).find(Boolean)?.page ?? lastPage);
      setActiveStep(steps[0]?.stepNo ?? 1);
    },
  });

  useEffect(() => {
    // A pointer released outside the window must not leave a drag hanging.
    const stop = () => {
      drag.current = null;
    };
    window.addEventListener("blur", stop);
    return () => window.removeEventListener("blur", stop);
  }, []);

  const put = (stepNo: number, box: Box | null) => {
    setBoxes((current) => ({
      ...current,
      [stepNo]: box ? fit(box, pageHeight(box.page)) : null,
    }));
  };

  const pointOnPage = (event: PointerEvent, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    const scale = rect.width / PAGE_WIDTH;
    return {
      x: (event.clientX - rect.left) / scale,
      y: (event.clientY - rect.top) / scale,
    };
  };

  const onPageDown = (event: PointerEvent<HTMLDivElement>) => {
    if (config.documentId && !imageReady) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if ((event.target as HTMLElement).closest("[data-box]")) return;
    const el = event.currentTarget;
    try {
      el.setPointerCapture(event.pointerId);
    } catch {
      /* capture is best effort */
    }
    const point = pointOnPage(event, el);
    drag.current = {
      mode: "draw",
      el,
      sx: point.x,
      sy: point.y,
      moved: false,
      id: activeStep,
      page,
    };
  };

  const onBoxDown = (
    event: PointerEvent<HTMLElement>,
    stepNo: number,
    mode: "move" | "resize",
  ) => {
    if (config.documentId && !imageReady) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const box = boxes[stepNo];
    const el = event.currentTarget.closest<HTMLElement>("[data-pagearea]");
    if (!box || !el) return;
    try {
      el.setPointerCapture(event.pointerId);
    } catch {
      /* capture is best effort */
    }
    const point = pointOnPage(event, el);
    drag.current = {
      mode,
      el,
      id: stepNo,
      start: { ...box },
      offX: point.x - box.x,
      offY: point.y - box.y,
    };
    if (activeStep !== stepNo) setActiveStep(stepNo);
  };

  const onPageMove = (event: PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state) return;
    const point = pointOnPage(event, state.el);
    if (state.mode === "draw") {
      if (
        !state.moved &&
        Math.hypot(point.x - state.sx, point.y - state.sy) < 6
      )
        return;
      state.moved = true;
      put(state.id, {
        page: state.page,
        x: Math.min(state.sx, point.x),
        y: Math.min(state.sy, point.y),
        w: Math.abs(point.x - state.sx),
        h: Math.abs(point.y - state.sy),
      });
    } else if (state.mode === "move") {
      put(state.id, {
        ...state.start,
        x: point.x - state.offX,
        y: point.y - state.offY,
      });
    } else {
      const start = state.start;
      put(state.id, {
        page: start.page,
        x: start.x,
        y: start.y,
        w: Math.min(point.x - start.x, PAGE_WIDTH - start.x),
        h: Math.min(point.y - start.y, pageHeight(start.page) - start.y),
      });
    }
  };

  const onPageUp = (event: PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state) return;
    drag.current = null;
    try {
      state.el.releasePointerCapture(event.pointerId);
    } catch {
      /* capture may already be released */
    }
    if (state.mode === "draw" && !state.moved) {
      put(state.id, {
        page: state.page,
        x: state.sx - 100,
        y: state.sy - 45,
        w: 190,
        h: 72,
      });
    }
  };

  const onBoxKey = (event: KeyboardEvent, stepNo: number) => {
    const box = boxes[stepNo];
    if (!box) return;
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      put(stepNo, null);
      return;
    }
    const direction = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }[event.key];
    if (!direction) return;
    event.preventDefault();
    if (event.shiftKey) {
      put(stepNo, {
        ...box,
        w: box.w + direction[0] * KEY_STEP,
        h: box.h + direction[1] * KEY_STEP,
      });
    } else {
      put(stepNo, {
        ...box,
        x: box.x + direction[0] * KEY_STEP,
        y: box.y + direction[1] * KEY_STEP,
      });
    }
  };

  // Validation of the current layout.
  const flags: Record<
    number,
    { over: boolean; overlap: boolean; wrong: boolean }
  > = {};
  for (const step of steps) {
    const box = boxes[step.stepNo];
    if (!box) continue;
    const zones =
      previewPages.find((candidate) => candidate.pageNo === box.page)
        ?.blockedZones ?? [];
    flags[step.stepNo] = {
      wrong: wrongSignerArea(config, step, {
        ...box,
        look: looks[step.stepNo],
      }),
      over: zones.some((zone) => overlaps(box, zone)),
      overlap: steps.some((other) => {
        const otherBox = boxes[other.stepNo];
        return (
          other.stepNo !== step.stepNo &&
          otherBox &&
          otherBox.page === box.page &&
          overlaps(box, otherBox)
        );
      }),
    };
  }
  const assigned = steps.filter((step) => boxes[step.stepNo]);
  const anyOver = assigned.some((step) => flags[step.stepNo].over);
  const anyOverlap = assigned.some((step) => flags[step.stepNo].overlap);
  const allAssigned = assigned.length === steps.length;
  const hasNamedAreas = previewPages.some((p) =>
    p.anchors?.some((anchor) => anchor.signerName),
  );
  const incompatible = steps.filter((step) => wrongSignerArea(config, step));
  const unconfiguredPrinted = previewPages
    .flatMap((p) => p.anchors ?? [])
    .filter(
      (anchor) =>
        anchor.signerName &&
        !steps.some((step) =>
          printedAreas(config, step).some(
            (area) =>
              area.signerName === anchor.signerName &&
              area.party === anchor.party,
          ),
        ),
    );
  const anyWrong =
    unconfiguredPrinted.length > 0 ||
    incompatible.length > 0 ||
    assigned.some((step) => flags[step.stepNo].wrong);
  const checks = [
    { code: "CORRECT_SIGNER", ok: !anyWrong, pending: !hasNamedAreas },
    { code: "ONE_SLOT_PER_STEP", ok: allAssigned, pending: false },
    {
      code: "NO_OVERLAP",
      ok: !anyOverlap,
      pending: assigned.length < steps.length,
    },
    {
      code: "NO_CONTENT_COVERED",
      ok: !anyOver,
      pending: assigned.length === 0,
    },
  ];
  const canContinue =
    allAssigned &&
    !anyOver &&
    !anyOverlap &&
    !anyWrong &&
    (!config.documentId || imageReady);

  const pageData = previewPages.find((candidate) => candidate.pageNo === page);
  const fitZoom = clamp(
    Math.floor(
      Math.min(
        (canvasSize.width - 8) / PAGE_WIDTH,
        (canvasSize.height - 8) / pageHeight(page),
      ) * 100,
    ),
    ZOOM_MIN,
    ZOOM_MAX,
  );
  const viewZoom = autoFit ? fitZoom : zoom;
  const scale = viewZoom / 100;
  useEffect(() => {
    const update = () => {
      if (canvasRef.current)
        setCanvasHeight(
          Math.max(
            300,
            Math.min(
              760,
              window.innerHeight -
                canvasRef.current.getBoundingClientRect().top -
                78,
            ),
          ),
        );
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [incompatible.length, unconfiguredPrinted.length]);
  const selectStep = (stepNo: number) => {
    setActiveStep(stepNo);
    const area = printedAreas(
      config,
      steps.find((step) => step.stepNo === stepNo)!,
    )[0];
    const target = boxes[stepNo]?.page ?? area?.page;
    if (target) setPage(target);
  };
  const visibleSteps = steps.filter(
    (step) => boxes[step.stepNo]?.page === page,
  );

  return (
    <>
      <WizardStepper current="SIGN_POSITIONS" />
      {save.error || reset.error ? (
        <Alert
          type="error"
          showIcon
          title={td(
            `errors.${((save.error ?? reset.error) as { code?: string })?.code ?? "UNKNOWN"}`,
            { defaultValue: td("errors.UNKNOWN") },
          )}
          style={{ marginBottom: 12 }}
        />
      ) : null}
      <Alert
        type={config.documentId ? "info" : "warning"}
        showIcon
        title={t(
          config.documentId
            ? "positions.realDocumentNotice"
            : "positions.seedDocumentNotice",
        )}
        style={{ marginBottom: 12 }}
      />
      {pageData?.contentCheck === "MANUAL" ? (
        <Alert
          type="warning"
          showIcon
          title={t("positions.scanNotice")}
          style={{ marginBottom: 12 }}
        />
      ) : null}

      {config.documentId && !hasNamedAreas ? (
        <Alert
          type="warning"
          showIcon
          title={t("positions.identityManual")}
          style={{ marginBottom: 12 }}
        />
      ) : null}
      {incompatible.length || unconfiguredPrinted.length ? (
        <Alert
          type="error"
          showIcon
          data-testid="signer-document-mismatch"
          title={t("positions.mismatchSummary")}
          description={
            <>
              {incompatible.length ? (
                <div>
                  {t("positions.mismatch", {
                    names: incompatible
                      .map((step) => step.signerName)
                      .join(", "),
                  })}
                </div>
              ) : null}
              {unconfiguredPrinted.length ? (
                <div>
                  {t("positions.unconfiguredShort", {
                    names: unconfiguredPrinted
                      .map((area) => area.signerName)
                      .join(", "),
                  })}
                </div>
              ) : null}
              <Button
                size="small"
                onClick={() =>
                  navigate(
                    `/contracts/new?draft=${encodeURIComponent(contractId)}`,
                  )
                }
                style={{ marginTop: 8 }}
              >
                {t("positions.correctSigners")}
              </Button>
            </>
          }
          style={{ marginBottom: 12 }}
        />
      ) : null}
      <div className={styles.layout}>
        <section className={cx(shared.card, styles.canvasCard)}>
          <div className={styles.canvasHeader}>
            <h1>{t("positions.title")}</h1>
            <span className={styles.fileMeta}>
              {t("positions.fileMeta", {
                fileName: config.fileName,
                page,
                total: config.pageCount,
              })}
            </span>
          </div>
          <div className={styles.chips}>
            {steps.map((step) => {
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
            <span className={styles.hint}>{t("positions.hint")}</span>
          </div>
          <div
            className={styles.canvas}
            ref={canvasRef}
            style={{ height: canvasHeight }}
          >
            <div
              style={{
                width: Math.round(PAGE_WIDTH * scale),
                height: Math.round(pageHeight(page) * scale),
              }}
              className={styles.pageBox}
            >
              <div
                data-pagearea="1"
                className={styles.page}
                style={{
                  transform: `scale(${scale})`,
                  height: pageHeight(page),
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
                ) : pageData ? (
                  <>
                    <div className={styles.pageHeading}>
                      {t(`document.article.${pageData.heading}`)}
                    </div>
                    {Array.from(
                      { length: pageData.textLineCount },
                      (_, index) => (
                        <div
                          key={index}
                          className={styles.textLine}
                          style={{
                            top: 64 + index * 18,
                            width:
                              (448 * LINE_WIDTHS[index % LINE_WIDTHS.length]) /
                              100,
                          }}
                        />
                      ),
                    )}
                    {pageData.hasSignatureBlock
                      ? steps.map((step) => {
                          const block = pageData.blocks.find(
                            (candidate) => candidate.stepNo === step.stepNo,
                          );
                          return block ? (
                            <SignatureBlock
                              key={step.stepNo}
                              step={step}
                              left={block.x}
                              headingTop={block.headingY + 2}
                              nameTop={block.nameY + 2}
                            />
                          ) : null;
                        })
                      : null}
                  </>
                ) : null}

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
                        onPointerDown={(event) =>
                          onBoxDown(event, step.stepNo, "move")
                        }
                        onKeyDown={(event) => onBoxKey(event, step.stepNo)}
                        onFocus={() => setActiveStep(step.stepNo)}
                      >
                        <span className={styles.slotLine1}>
                          {t("slot.label", { stepNo: step.stepNo })}
                        </span>
                        <span className={styles.slotLine3}>
                          {step.signerName}
                        </span>
                        {look === "WITH_TITLE" ? (
                          <span className={styles.slotLine4}>
                            {step.signerTitle}
                          </span>
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
          </div>
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
              options={previewPages.map((p) => ({
                value: p.pageNo,
                label: t("positions.pageNo", { page: p.pageNo }),
              }))}
            />
            <Button size="small" onClick={() => setAutoFit(true)}>
              {t("positions.fitPage")}
            </Button>
            <span className={styles.zoom}>
              {t("positions.zoom.label")}
              <button
                type="button"
                className={styles.pagerButton}
                aria-label={t("positions.zoom.out")}
                onClick={() => {
                  setAutoFit(false);
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
                  setAutoFit(false);
                  setZoom(Math.min(ZOOM_MAX, viewZoom + ZOOM_STEP));
                }}
              >
                +
              </button>
            </span>
          </div>
        </section>

        <div className={styles.side}>
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
              const bad = Boolean(
                box && (flag.over || flag.overlap || flag.wrong),
              );
              const on = activeStep === step.stepNo;
              const look = looks[step.stepNo];
              const status = !box
                ? "UNASSIGNED"
                : bad
                  ? "NEEDS_FIX"
                  : "ASSIGNED";
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
                            previewPages.find((p) => p.pageNo === box.page)
                              ?.widthPt,
                          ),
                          left: toMm(
                            box.x,
                            previewPages.find((p) => p.pageNo === box.page)
                              ?.widthPt,
                          ),
                          width: toMm(
                            box.w,
                            previewPages.find((p) => p.pageNo === box.page)
                              ?.widthPt,
                          ),
                          height: toMm(
                            box.h,
                            previewPages.find((p) => p.pageNo === box.page)
                              ?.widthPt,
                          ),
                        })
                      : t("positions.list.empty")}
                  </div>
                  <div className={styles.cardActions}>
                    <span className={styles.cardLookLabel}>
                      {t("positions.list.look.label")}
                    </span>
                    {(["NAME_AND_TIME", "WITH_TITLE"] as const).map(
                      (option) => (
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
                      ),
                    )}
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

          <div className={cx(shared.notice, styles.tip)}>
            <b className={shared.noticeTitle}>{t("positions.tip.label")}</b>{" "}
            {t("positions.tip.body")}
          </div>

          <section
            className={cx(shared.card, styles.checksCard)}
            aria-live="polite"
          >
            <h2>{t("positions.checks.title")}</h2>
            {checks.map((check) => {
              const pending = check.pending && check.ok;
              const state = pending ? "Pending" : check.ok ? "Ok" : "Fail";
              return (
                <div key={check.code} className={styles.check}>
                  <span
                    className={styles[`checkIcon${state}`]}
                    aria-hidden="true"
                  >
                    {pending ? "•" : check.ok ? "✓" : "✕"}
                  </span>
                  <span className={styles[`checkText${state}`]}>
                    {t(`positions.checks.${check.code}`)}
                  </span>
                </div>
              );
            })}
          </section>

          <div className={styles.footer}>
            <Link
              to={`/contracts/new?draft=${encodeURIComponent(contractId)}`}
              className={shared.btnSecondary}
            >
              {t("positions.actions.back")}
            </Link>
            {canContinue ? (
              <Button
                type="primary"
                size="small"
                disabled={save.isPending}
                onClick={() => save.mutate()}
                data-testid="positions-save"
              >
                {t("positions.actions.continue")}
              </Button>
            ) : (
              <span className={styles.blocked} role="status">
                {t("positions.actions.blocked")}
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function SignatureBlock({
  step,
  left,
  headingTop,
  nameTop,
}: {
  step: SignStepView;
  left: number;
  headingTop: number;
  nameTop: number;
}) {
  const { t } = useTranslation("signing");
  return (
    <>
      <div className={styles.blockHeading} style={{ left, top: headingTop }}>
        {t(`document.representative.${step.party}`)}
      </div>
      <div className={styles.blockSigner} style={{ left, top: nameTop }}>
        <div className={styles.blockName}>{step.signerName}</div>
        <div className={styles.blockTitle}>{step.signerTitle}</div>
      </div>
    </>
  );
}
