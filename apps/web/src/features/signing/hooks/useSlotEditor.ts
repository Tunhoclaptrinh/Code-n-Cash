import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  getDefaultSignatureSlots,
  saveSignatureSlots,
} from "../api/signingConfig.api";
import {
  KEY_STEP,
  PAGE_WIDTH,
  fit,
  mergeSlots,
  pageHeightOf,
  splitSlots,
  type Box,
  type Boxes,
  type DragState,
  type Looks,
} from "../lib/signature-layout";
import { printedAreas } from "../lib/signer-placement";
import type { SigningConfig } from "../types";

/** Slot boxes, looks, selection and pointer/keyboard editing of the signature layout. */
export function useSlotEditor(contractId: string, config: SigningConfig) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { steps, previewPages } = config;
  const lastPage =
    previewPages[previewPages.length - 1]?.pageNo ?? config.pageCount;

  const initial = splitSlots(config.slots);
  const [boxes, setBoxes] = useState<Boxes>(initial.boxes);
  const [looks, setLooks] = useState<Looks>(initial.looks);
  const [activeStep, setActiveStep] = useState(steps[0]?.stepNo ?? 1);
  const [page, setPage] = useState(
    initial.boxes[steps[0]?.stepNo ?? 1]?.page ?? lastPage,
  );
  const [focusRevision, setFocusRevision] = useState(0);
  const [imageReady, setImageReady] = useState(false);
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
      [stepNo]: box ? fit(box, pageHeightOf(previewPages, box.page)) : null,
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
        h: Math.min(
          point.y - start.y,
          pageHeightOf(previewPages, start.page) - start.y,
        ),
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

  const selectStep = (stepNo: number) => {
    setActiveStep(stepNo);
    setFocusRevision((value) => value + 1);
    const area = printedAreas(
      config,
      steps.find((step) => step.stepNo === stepNo)!,
    )[0];
    const target = boxes[stepNo]?.page ?? area?.page;
    if (target) setPage(target);
  };

  return {
    boxes,
    looks,
    setLooks,
    activeStep,
    setActiveStep,
    page,
    setPage,
    focusRevision,
    imageReady,
    setImageReady,
    drag,
    save,
    reset,
    put,
    onPageDown,
    onBoxDown,
    onPageMove,
    onPageUp,
    onBoxKey,
    selectStep,
    firstPage: previewPages[0]?.pageNo ?? lastPage,
    lastPage,
  };
}

export type SlotEditor = ReturnType<typeof useSlotEditor>;
