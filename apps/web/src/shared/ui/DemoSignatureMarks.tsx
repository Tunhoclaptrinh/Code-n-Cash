import { useId, type CSSProperties } from "react";

const INK = "#1d3a8a";
const SEAL_RED = "#d32f2f";
const SCRIPT_FONT =
  '"Segoe Script", "Brush Script MT", "Snell Roundhand", cursive';

const fillBox: CSSProperties = { position: "absolute", inset: 0 };
/** The demo signature is drawn in a 240 x 70 view box, the name centred at (120, 38). */
const VIEW_WIDTH = 240;
const VIEW_HEIGHT = 70;
/** Share of the box height the drawing takes when a caption runs below it. */
const DRAWING_SHARE = 0.78;
/** Width of the name in view box units: about 60% of the box at most, so it reads as handwriting. */
const glyphWidth = (name: string) =>
  Math.min(150, Math.max(56, name.length * 11));
/** Seal diameter as a share of the box height. */
const SEAL_SHARE = 0.66;

/** A rectangle in page units: signing slots and the contract view use a 520-unit-wide page. */
export interface MarkBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Where the seal of a signed box goes, in the box's page units. Nghị định 30/2020/NĐ-CP, Điều 33:
 * the seal is upright and covers about one third of the signature on its left side. The seal is
 * centred on the drawn name vertically, and its right edge sits one third into the drawn name.
 */
export function sealBox(
  box: MarkBox,
  name: string,
  captioned: boolean,
): MarkBox {
  // The view box is fitted into the drawing area and centred in it (preserveAspectRatio meet).
  const area = captioned ? box.h * DRAWING_SHARE : box.h;
  const scale = Math.min(box.w / VIEW_WIDTH, area / VIEW_HEIGHT);
  const drawn = glyphWidth(name) * scale;
  const nameLeft = box.x + (box.w - drawn) / 2;
  const nameMiddle = box.y + (area - VIEW_HEIGHT * scale) / 2 + 38 * scale;
  const size = box.h * SEAL_SHARE;
  return {
    x: nameLeft + drawn / 3 - size,
    y: nameMiddle - size / 2,
    w: size,
    h: size,
  };
}

/** Ink stroke under the name, as wide as the name plus a little on each side. */
function flourish(width: number) {
  const left = 120 - width / 2 - 8;
  const right = 120 + width / 2 + 8;
  const third = (right - left) / 3;
  return `M ${left} 52 C ${left + third} 46, ${left + third} 58, ${120} 51 S ${right - third / 2} 47, ${right} 51`;
}

/** Handwritten-looking demo signature with an ink flourish and a one-line caption. */
export function DemoSignatureMark({
  name,
  caption,
}: {
  name: string;
  caption?: string;
}) {
  // Stretch the glyphs to a width that suits the name length, capped to the box.
  const textLength = glyphWidth(name);
  return (
    <div
      data-testid="demo-signature"
      style={{ ...fillBox, containerType: "inline-size", overflow: "hidden" }}
    >
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={name}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: "100%",
          height: caption ? `${DRAWING_SHARE * 100}%` : "100%",
        }}
      >
        <g transform="rotate(-4 120 38)">
          <text
            x="120"
            y="44"
            textAnchor="middle"
            fill={INK}
            fontFamily={SCRIPT_FONT}
            fontSize="26"
            textLength={textLength}
            lengthAdjust="spacingAndGlyphs"
          >
            {name}
          </text>
          <path
            d={flourish(textLength)}
            fill="none"
            stroke={INK}
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </g>
      </svg>
      {caption ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            padding: "0 4px",
            color: "#4b5563",
            fontSize: "clamp(7px, 3.6cqw, 11px)",
            lineHeight: 1.3,
            textAlign: "center",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {caption}
        </div>
      ) : null}
    </div>
  );
}

/** Corner points of a five-point star centred on (cx, cy), tip pointing up. */
function starPoints(
  cx: number,
  cy: number,
  outer: number,
  inner: number,
): string {
  return Array.from({ length: 10 }, (_, i) => {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    return `${(cx + radius * Math.cos(angle)).toFixed(2)},${(cy + radius * Math.sin(angle)).toFixed(2)}`;
  }).join(" ");
}

/** Round red company stamp with the organisation name along the top arc, upright (Nghị định 30/2020). */
export function DemoSeal({
  organization,
  label,
  size = 96,
}: {
  organization: string;
  label?: string;
  /** Pixels, or "100%" to fill a sized parent. */
  size?: number | string;
}) {
  const pathId = useId();
  const name = organization.toUpperCase();
  // Shrink-to-fit: the top arc is about 98 units long, so cap the text well below that.
  const textLength = Math.min(92, Math.max(40, name.length * 5.6));
  return (
    <svg
      data-testid="demo-seal"
      aria-hidden="true"
      viewBox="0 0 100 100"
      width={size}
      height={size}
      style={{ opacity: 0.82, flexShrink: 0 }}
    >
      <defs>
        <path id={pathId} d="M 19,50 A 31,31 0 0 1 81,50" />
      </defs>
      <circle
        cx="50"
        cy="50"
        r="47"
        fill="none"
        stroke={SEAL_RED}
        strokeWidth="2.6"
      />
      <circle
        cx="50"
        cy="50"
        r="41.5"
        fill="none"
        stroke={SEAL_RED}
        strokeWidth="1"
      />
      <text
        fill={SEAL_RED}
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="8.5"
        fontWeight="700"
      >
        <textPath
          href={`#${pathId}`}
          startOffset="50%"
          textAnchor="middle"
          textLength={textLength}
          lengthAdjust="spacingAndGlyphs"
        >
          {name}
        </textPath>
      </text>
      <polygon points={starPoints(50, 51, 14, 5.6)} fill={SEAL_RED} />
      {label ? (
        <text
          x="50"
          y="79"
          textAnchor="middle"
          fill={SEAL_RED}
          fontFamily="Arial, Helvetica, sans-serif"
          fontSize="10"
          fontWeight="700"
        >
          {label}
        </text>
      ) : null}
    </svg>
  );
}

/** Dashed placeholder for a signature still to come; highlighted when it is the next one. */
export function PendingSignatureSlot({
  label,
  active,
}: {
  label: string;
  active?: boolean;
}) {
  const color = active ? "#315bea" : "#94a3b8";
  return (
    <div
      data-testid="pending-signature"
      style={{
        ...fillBox,
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 4,
        border: `2px dashed ${color}`,
        borderRadius: 8,
        background: active ? "rgba(49,91,234,.08)" : "transparent",
        color,
        fontSize: 12,
        lineHeight: 1.3,
        textAlign: "center",
        overflow: "hidden",
      }}
    >
      <span
        style={{
          display: "-webkit-box",
          WebkitBoxOrient: "vertical",
          WebkitLineClamp: 2,
          overflow: "hidden",
        }}
      >
        {label}
      </span>
    </div>
  );
}

/**
 * A signed box drawn over a page: the demo signature, then the seal stamped over the left third of
 * it. Positions are percentages of a page `pageWidth` x `pageHeight` units in size.
 */
export function SignedMark({
  box,
  pageWidth,
  pageHeight,
  name,
  caption,
  organization,
  sealLabel,
}: {
  box: MarkBox;
  pageWidth: number;
  pageHeight: number;
  name: string;
  caption?: string;
  organization: string;
  sealLabel?: string;
}) {
  const at = (area: MarkBox): CSSProperties => ({
    position: "absolute",
    left: `${(area.x / pageWidth) * 100}%`,
    top: `${(area.y / pageHeight) * 100}%`,
    width: `${(area.w / pageWidth) * 100}%`,
    height: `${(area.h / pageHeight) * 100}%`,
  });
  return (
    <>
      <div style={{ ...at(box), zIndex: 4 }}>
        <DemoSignatureMark name={name} caption={caption} />
      </div>
      {/* The seal is stamped after signing, so it lies over the signature. */}
      <div style={{ ...at(sealBox(box, name, Boolean(caption))), zIndex: 5 }}>
        <DemoSeal organization={organization} label={sealLabel} size="100%" />
      </div>
    </>
  );
}
