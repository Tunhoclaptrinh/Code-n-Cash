import { useEffect, useRef, useState, type RefObject } from "react";
import {
  PAGE_WIDTH,
  ZOOM_MAX,
  ZOOM_MIN,
  clamp,
  type DragState,
} from "../lib/signature-layout";

interface CanvasViewInput {
  activeStep: number;
  page: number;
  /** Height of the page being shown, in page units. */
  currentPageHeight: number;
  imageReady: boolean;
  focusRevision: number;
  drag: RefObject<DragState | null>;
  /** Mismatch rows shown above the editor; they change the available height. */
  incompatibleCount: number;
  unconfiguredCount: number;
}

/** Zoom, fit mode, workspace expansion and scroll/size tracking of the page canvas. */
export function useCanvasView({
  activeStep,
  page,
  currentPageHeight,
  imageReady,
  focusRevision,
  drag,
  incompatibleCount,
  unconfiguredCount,
}: CanvasViewInput) {
  const [zoom, setZoom] = useState(100);
  const [fitMode, setFitMode] = useState<"width" | "page" | null>("width");
  const [expanded, setExpanded] = useState(false);
  const [canvasHeight, setCanvasHeight] = useState(420);
  const [sideHeight, setSideHeight] = useState(620);
  const layoutRef = useRef<HTMLDivElement>(null);
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

  const widthZoom = ((canvasSize.width - 8) / PAGE_WIDTH) * 100;
  const fitZoom = clamp(
    Math.floor(
      Math.min(widthZoom / 100, (canvasSize.height - 8) / currentPageHeight) *
        100,
    ),
    ZOOM_MIN,
    ZOOM_MAX,
  );
  const viewZoom =
    fitMode === "page"
      ? fitZoom
      : fitMode === "width"
        ? clamp(Math.floor(widthZoom), ZOOM_MIN, ZOOM_MAX)
        : zoom;
  const scale = viewZoom / 100;
  useEffect(() => {
    if (!expanded) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", close);
    };
  }, [expanded]);
  useEffect(() => {
    if (fitMode === "page" || drag.current) return;
    const frame = requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      const area =
        canvas?.querySelector<HTMLElement>(
          `[data-slot-step="${activeStep}"]`,
        ) ??
        canvas?.querySelector<HTMLElement>(
          `[data-anchor-step="${activeStep}"]`,
        );
      if (!canvas || !area) return;
      const target = area.getBoundingClientRect(),
        viewport = canvas.getBoundingClientRect();
      canvas.scrollTo({
        top:
          canvas.scrollTop +
          target.top +
          target.height / 2 -
          viewport.top -
          canvas.clientHeight / 2,
        left:
          canvas.scrollLeft +
          target.left +
          target.width / 2 -
          viewport.left -
          canvas.clientWidth / 2,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [
    activeStep,
    page,
    viewZoom,
    imageReady,
    fitMode,
    expanded,
    focusRevision,
    drag,
  ]);
  useEffect(() => {
    const update = () => {
      if (canvasRef.current)
        setCanvasHeight(
          Math.max(
            expanded
              ? 220
              : Math.min(520, Math.max(380, window.innerHeight * 0.55)),
            Math.min(
              760,
              window.innerHeight -
                canvasRef.current.getBoundingClientRect().top -
                78,
            ),
          ),
        );
      if (layoutRef.current)
        setSideHeight(
          Math.max(
            300,
            window.innerHeight -
              layoutRef.current.getBoundingClientRect().top -
              16,
          ),
        );
    };
    update();
    const observer = new ResizeObserver(update);
    if (layoutRef.current) observer.observe(layoutRef.current);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [incompatibleCount, unconfiguredCount, expanded]);

  return {
    fitMode,
    setFitMode,
    setZoom,
    expanded,
    setExpanded,
    canvasHeight,
    sideHeight,
    layoutRef,
    canvasRef,
    viewZoom,
    scale,
  };
}

export type CanvasView = ReturnType<typeof useCanvasView>;
