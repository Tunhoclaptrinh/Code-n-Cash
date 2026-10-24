import type { PdfPagePreview, SlotMap } from "./types";

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
