import type { PdfPagePreview, SlotMap } from "./types";
import { BadRequestException } from "@nestjs/common";

export const rectanglesOverlap = (
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** The server validates the exact same page geometry as the image shown to the signer. */
type SignerIdentity = { stepNo: number; signerName: string; party: string };
const normalizedName = (name: string) =>
  name.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
export function signerAnchors(pages: PdfPagePreview[], signer: SignerIdentity) {
  return pages.flatMap((page) =>
    (page.anchors ?? [])
      .filter(
        (anchor) =>
          anchor.signerName &&
          normalizedName(anchor.signerName) ===
            normalizedName(signer.signerName) &&
          anchor.party === signer.party,
      )
      .map((anchor) => ({ ...anchor, page: page.pageNo })),
  );
}

export function assertSlots(
  slots: SlotMap,
  pages: PdfPagePreview[],
  count: number,
  required = false,
  signers?: SignerIdentity[],
) {
  const printed = pages
    .flatMap((page) => page.anchors ?? [])
    .filter((anchor) => anchor.signerName);
  if (
    signers &&
    printed.length &&
    (required || Object.values(slots).some(Boolean)) &&
    (printed.length !== signers.length ||
      printed.some(
        (anchor) =>
          !signers.some(
            (signer) =>
              normalizedName(signer.signerName) ===
                normalizedName(anchor.signerName!) &&
              signer.party === anchor.party,
          ),
      ))
  )
    throw new BadRequestException("SIGNER_DOCUMENT_MISMATCH");
  const assigned: NonNullable<SlotMap[number]>[] = [];
  for (let step = 1; step <= count; step++) {
    const slot = slots[step];
    const identity = signers?.find((signer) => signer.stepNo === step);
    const hasNamedAreas = pages.some((page) =>
      page.anchors?.some((anchor) => anchor.signerName),
    );
    const areas =
      identity && hasNamedAreas ? signerAnchors(pages, identity) : undefined;
    if (areas && !areas.length && (slot || required))
      throw new BadRequestException("SIGNER_DOCUMENT_MISMATCH");
    if (
      slot &&
      areas &&
      !areas.some(
        (area) =>
          area.page === slot.page &&
          slot.x >= area.x - 1 &&
          slot.y >= area.y - 1 &&
          slot.x + slot.w <= area.x + (area.w ?? 240) + 1 &&
          slot.y + slot.h <= area.y + (area.h ?? 92) + 1,
      )
    )
      throw new BadRequestException("SLOT_WRONG_SIGNER_AREA");
    if (!slot) {
      if (required) throw new BadRequestException("SLOT_REQUIRED");
      continue;
    }
    const page = pages.find((p) => p.pageNo === slot.page);
    if (
      !page ||
      !Number.isInteger(slot.page) ||
      [slot.x, slot.y, slot.w, slot.h].some((v) => !Number.isFinite(v)) ||
      slot.x < 0 ||
      slot.y < 0 ||
      slot.w < 80 ||
      slot.h < 40 ||
      slot.x + slot.w > (page.width ?? 520) + 0.01 ||
      slot.y + slot.h > (page.height ?? 620) + 0.01
    )
      throw new BadRequestException("SLOT_OUT_OF_BOUNDS");
    if (page.blockedZones.some((zone) => rectanglesOverlap(slot, zone)))
      throw new BadRequestException("SLOT_OVER_TEXT");
    if (
      assigned.some(
        (other) => other.page === slot.page && rectanglesOverlap(slot, other),
      )
    )
      throw new BadRequestException("SLOT_OVERLAP");
    assigned.push(slot);
  }
}

/** Printed anchors first; otherwise find free rectangles. Suggestions always need review. */
export function documentSlots(
  pages: PdfPagePreview[],
  count: number,
  signers?: SignerIdentity[],
): SlotMap {
  const result: SlotMap = {};
  for (let step = 1; step <= count; step++) {
    result[step] = null;
    const identity = signers?.find((signer) => signer.stepNo === step);
    const hasNamedAreas = pages.some((page) =>
      page.anchors?.some((anchor) => anchor.signerName),
    );
    const matches =
      identity && hasNamedAreas ? signerAnchors(pages, identity) : undefined;
    if (matches && !matches.length) continue;
    const anchored = pages.filter((page) =>
      matches
        ? matches.some((area) => area.page === page.pageNo)
        : page.anchors?.some((anchor) => anchor.stepNo === step),
    );
    const candidates = (
      anchored.length ? anchored : [...pages].reverse()
    ).flatMap((page) => {
      const anchor = matches
        ? matches.find((area) => area.page === page.pageNo)
        : page.anchors?.find((a) => a.stepNo === step);
      const points = anchor
        ? [{ x: anchor.x, y: anchor.y }]
        : Array.from({ length: 10 }, (_, i) => ({
            x: i % 2 ? 270 : 36,
            y: (page.height ?? 620) - 140 - Math.floor(i / 2) * 115,
          }));
      return points.map((point) => ({
        page: page.pageNo,
        ...point,
        w: 190,
        h: 72,
        look: "NAME_AND_TIME" as const,
      }));
    });
    for (const candidate of candidates) {
      try {
        assertSlots(
          { ...result, [step]: candidate },
          pages,
          count,
          false,
          signers,
        );
        result[step] = candidate;
        break;
      } catch {
        /* Try another blank area. */
      }
    }
  }
  return result;
}

/** One to four configured signers, laid out two per row on the last page. */
export const MAX_SIGNERS = 4;
const COLUMN_X = [36, 270];
const ROW_HEIGHT = 194;

const topOf = (count: number) => (count <= 2 ? 390 : 200);

/** Default slot of each signer: inside its printed block, under the heading. */
export function defaultSlots(count: number): SlotMap {
  const top = topOf(count);
  const slots: SlotMap = {};
  for (let i = 0; i < count; i++)
    slots[i + 1] = {
      page: 14,
      x: COLUMN_X[i % 2],
      y: top + Math.floor(i / 2) * ROW_HEIGHT + 26,
      w: 214,
      h: 120,
      look: "NAME_AND_TIME",
    };
  return slots;
}

/** The two last pages of the contract with the zones a signature must not cover. */
export function previewPagesFor(count: number): PdfPagePreview[] {
  const top = topOf(count);
  const blocks = Array.from({ length: count }, (_, i) => ({
    stepNo: i + 1,
    x: COLUMN_X[i % 2],
    headingY: top + Math.floor(i / 2) * ROW_HEIGHT,
    nameY: top + Math.floor(i / 2) * ROW_HEIGHT + 150,
  }));
  return [
    {
      pageNo: 13,
      heading: "ARTICLE_13",
      textLineCount: 26,
      hasSignatureBlock: false,
      blocks: [],
      blockedZones: [{ x: 0, y: 28, w: 520, h: 540 }],
    },
    {
      pageNo: 14,
      heading: "ARTICLE_14",
      textLineCount: count <= 2 ? 9 : 6,
      hasSignatureBlock: true,
      blocks,
      blockedZones: [
        { x: 0, y: 28, w: 520, h: count <= 2 ? 200 : 160 },
        ...blocks.flatMap((block) => [
          { x: block.x, y: block.headingY, w: 214, h: 24 },
          { x: block.x, y: block.nameY, w: 214, h: 44 },
        ]),
      ],
    },
  ];
}
