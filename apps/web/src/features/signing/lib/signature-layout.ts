import type {
  PdfPagePreview,
  Rect,
  SignatureSlot,
  SigningConfig,
  SignStepView,
  SlotLook,
  SlotMap,
} from "../types";
import { printedAreas, wrongSignerArea } from "./signer-placement";

export const PAGE_WIDTH = 520;
export const PAGE_HEIGHT = 620;
const PAGE_WIDTH_MM = 210;
export const ZOOM_MIN = 25;
export const ZOOM_MAX = 300;
export const ZOOM_STEP = 25;
export const KEY_STEP = 4;
export const LINE_WIDTHS = [94, 88, 91, 62, 90, 86, 93, 70, 88, 92, 84, 60];

export type Box = Omit<SignatureSlot, "look">;
export type Boxes = Record<number, Box | null>;
export type Looks = Record<number, SlotLook>;
export type SlotFlag = { over: boolean; overlap: boolean; wrong: boolean };
export type DragState =
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

export const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(high, value));
export const toMm = (value: number, widthPt?: number) =>
  Math.round(
    (value * (widthPt ? (widthPt * 25.4) / 72 : PAGE_WIDTH_MM)) / PAGE_WIDTH,
  );
const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export function fit(box: Box, height = PAGE_HEIGHT): Box {
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

export function splitSlots(slots: SlotMap): { boxes: Boxes; looks: Looks } {
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

export function mergeSlots(
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

export function pageHeightOf(previewPages: PdfPagePreview[], number: number) {
  return previewPages.find((p) => p.pageNo === number)?.height ?? PAGE_HEIGHT;
}

export interface LayoutCheck {
  code: string;
  ok: boolean;
  pending: boolean;
}

/** Validates the current slot layout against the printed signer areas. */
export function analyzeLayout(
  config: SigningConfig,
  boxes: Boxes,
  looks: Looks,
  imageReady: boolean,
) {
  const { steps, previewPages } = config;
  const flags: Record<number, SlotFlag> = {};
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
  const checks: LayoutCheck[] = [
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
  return {
    flags,
    hasNamedAreas,
    incompatible,
    unconfiguredPrinted,
    checks,
    canContinue,
  };
}
