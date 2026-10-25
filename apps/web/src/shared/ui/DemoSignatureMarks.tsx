import { useId, type CSSProperties } from "react";

const INK = "#1d3a8a";
const SEAL_RED = "#d32f2f";
const SCRIPT_FONT =
  '"Segoe Script", "Brush Script MT", "Snell Roundhand", cursive';

const fillBox: CSSProperties = { position: "absolute", inset: 0 };

/** Handwritten-looking demo signature with an ink flourish and a one-line caption. */
export function DemoSignatureMark({
  name,
  caption,
}: {
  name: string;
  caption?: string;
}) {
  // Stretch the glyphs to a width that suits the name length, capped to the box.
  const textLength = Math.min(208, Math.max(70, name.length * 15));
  return (
    <div
      data-testid="demo-signature"
      style={{ ...fillBox, containerType: "inline-size", overflow: "hidden" }}
    >
      <svg
        viewBox="0 0 240 70"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={name}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: "100%",
          height: caption ? "78%" : "100%",
        }}
      >
        <g transform="rotate(-4 120 38)">
          <text
            x="120"
            y="42"
            textAnchor="middle"
            fill={INK}
            fontFamily={SCRIPT_FONT}
            fontSize="34"
            textLength={textLength}
            lengthAdjust="spacingAndGlyphs"
          >
            {name}
          </text>
          <path
            d="M 22 55 C 60 46, 96 63, 134 53 S 196 48, 220 54"
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

/** Round red company stamp with the organisation name along the top arc. */
export function DemoSeal({
  organization,
  label,
  size = 96,
}: {
  organization: string;
  label?: string;
  size?: number;
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
      style={{ opacity: 0.82, transform: "rotate(-12deg)", flexShrink: 0 }}
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
