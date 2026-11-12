import type { ReactNode } from "react";
import { Tooltip } from "antd";
import { formatNumber } from "@/shared/lib/format";
import styles from "./viz.module.css";

export interface ChartPart {
  key: string;
  label: string;
  /** Size of the part; only drawn, never shown (the display text carries the exact amount). */
  value: number;
  /** Exact amount as shown to people, e.g. "1.234,50 triệu". */
  display: string;
  /** A CSS colour, normally one of the --viz-* variables. */
  color: string;
  /** Text colour inside the fill: white, or near-black on light fills. */
  ink?: "light" | "dark";
}

const share = (value: number, total: number) =>
  total > 0 ? Math.round((value / total) * 1000) / 10 : 0;

/** Swatch plus text: identity never rests on colour alone. */
export function Legend({
  parts,
  total,
  inline = false,
}: {
  parts: ChartPart[];
  total?: number;
  /** Sits in a header row: no top margin, smaller text. */
  inline?: boolean;
}) {
  return (
    <div
      className={`${styles.viz} ${styles.legend} ${inline ? styles.legendInline : ""}`}
    >
      {parts.map((part) => (
        <span key={part.key} className={styles.legendItem}>
          <span className={styles.swatch} style={{ background: part.color }} />
          {part.label}
          {part.display ? <b>{part.display}</b> : null}
          {total ? (
            <span>{formatNumber(share(part.value, total), 1)}%</span>
          ) : null}
        </span>
      ))}
    </div>
  );
}

/**
 * One whole split into parts (a tall segmented bar): widths proportional to the values, a part
 * at zero draws nothing, a share is printed inside only when it fits. Hover or focus gives the
 * part's name, amount and share; the legend below repeats them as text.
 */
export function SegmentedBar({
  parts,
  label,
  legend = true,
  testId,
}: {
  parts: ChartPart[];
  /** Accessible name of the whole bar. */
  label: string;
  /** False when the caller places the legend itself (e.g. in a header). */
  legend?: boolean;
  testId?: string;
}) {
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  const shown = parts.filter((part) => part.value > 0);
  return (
    <div className={styles.viz} data-testid={testId}>
      <div className={styles.segmented} role="list" aria-label={label}>
        {shown.map((part) => {
          const pct = share(part.value, total);
          return (
            <Tooltip
              key={part.key}
              title={`${part.label}: ${part.display} · ${formatNumber(pct, 1)}%`}
            >
              <span
                role="listitem"
                tabIndex={0}
                aria-label={`${part.label}: ${part.display}, ${formatNumber(pct, 1)}%`}
                className={styles.segment}
                style={{
                  flexGrow: part.value,
                  flexBasis: 0,
                  background: part.color,
                  color: part.ink === "dark" ? "#0b0b0b" : "#fff",
                }}
              >
                {pct >= 12 ? `${formatNumber(pct, 0)}%` : null}
              </span>
            </Tooltip>
          );
        })}
      </div>
      {legend ? <Legend parts={parts} total={total} /> : null}
    </div>
  );
}

/** A clean axis maximum: 1, 2, 2.5 or 5 times a power of ten, at or above the largest value. */
function niceMax(value: number) {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * power >= value) ?? 10;
  return step * power;
}

export interface ColumnDatum {
  key: string;
  /** Short axis label, e.g. "07/26". */
  label: string;
  /** Tooltip title, e.g. "Tháng 07/2026". */
  title: string;
  parts: ChartPart[];
  /** Extra tooltip lines below the parts. */
  extra?: ReactNode;
  current?: boolean;
}

/**
 * Stacked columns on one axis: segments in a fixed series order with 2px gaps, rounded at the
 * top, a recessive grid with four clean ticks, a hover and focus tooltip per column (the whole
 * band is the target). `onSelect` makes a column a link to the rows behind it.
 */
export function StackedColumns({
  data,
  series,
  height = 200,
  onSelect,
  label,
  legend = true,
  testId,
}: {
  data: ColumnDatum[];
  /** Series in stacking order (bottom first), for the legend. */
  series: Omit<ChartPart, "value" | "display">[];
  height?: number;
  onSelect?: (key: string) => void;
  label: string;
  /** False when the caller places the series legend itself (e.g. in a header). */
  legend?: boolean;
  testId?: string;
}) {
  const totals = data.map((d) => d.parts.reduce((s, p) => s + p.value, 0));
  const max = niceMax(Math.max(0, ...totals));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  // At most about eight axis labels, so they never collide on a narrow screen.
  const step = Math.max(1, Math.ceil(data.length / 8));
  return (
    <div className={styles.viz} data-testid={testId}>
      <div
        className={styles.chart}
        style={{ ["--plot-height" as string]: `${height}px` }}
        role="group"
        aria-label={label}
      >
        <div className={styles.yAxis} aria-hidden>
          {ticks.map((tick) => (
            <span key={tick} style={{ bottom: `${(tick / max) * 100}%` }}>
              {formatNumber(tick)}
            </span>
          ))}
        </div>
        <div className={styles.plot}>
          {ticks.slice(1).map((tick) => (
            <span
              key={tick}
              className={styles.gridline}
              style={{ bottom: `${(tick / max) * 100}%` }}
              aria-hidden
            />
          ))}
          {data.map((datum, index) => {
            const total = totals[index];
            const tip = (
              <div>
                <div className={styles.tooltipTitle}>{datum.title}</div>
                {[...datum.parts].reverse().map((part) => (
                  <div key={part.key} className={styles.tooltipRow}>
                    <span
                      className={styles.swatch}
                      style={{ background: part.color }}
                    />
                    {part.label}
                    <b>{part.display}</b>
                  </div>
                ))}
                {datum.extra}
              </div>
            );
            return (
              <Tooltip key={datum.key} title={tip} placement="top">
                <div
                  className={styles.band}
                  role={onSelect ? "button" : "img"}
                  tabIndex={0}
                  aria-label={`${datum.title}: ${datum.parts
                    .map((p) => `${p.label} ${p.display}`)
                    .join(", ")}`}
                  onClick={onSelect ? () => onSelect(datum.key) : undefined}
                  onKeyDown={(event) => {
                    if (
                      onSelect &&
                      (event.key === "Enter" || event.key === " ")
                    ) {
                      event.preventDefault();
                      onSelect(datum.key);
                    }
                  }}
                  data-testid={testId ? `${testId}-${datum.key}` : undefined}
                >
                  <div
                    className={styles.column}
                    style={{ height: `${(total / max) * 100}%` }}
                  >
                    {datum.parts
                      .filter((part) => part.value > 0)
                      .map((part) => (
                        <span
                          key={part.key}
                          style={{
                            flexGrow: part.value,
                            flexBasis: 0,
                            background: part.color,
                          }}
                        />
                      ))}
                  </div>
                </div>
              </Tooltip>
            );
          })}
        </div>
        <div className={styles.xAxis} aria-hidden>
          {data.map((datum, index) => (
            <span
              key={datum.key}
              className={datum.current ? styles.current : undefined}
            >
              {index % step && !datum.current ? "" : datum.label}
            </span>
          ))}
        </div>
      </div>
      {legend ? (
        <Legend parts={series.map((s) => ({ ...s, value: 0, display: "" }))} />
      ) : null}
    </div>
  );
}

export interface BarDatum {
  key: string;
  label: ReactNode;
  value: number;
  display: ReactNode;
  color: string;
}

/** One series as horizontal bars from a shared baseline; the value sits at the row's end. */
export function BarList({
  data,
  onSelect,
  testId,
}: {
  data: BarDatum[];
  onSelect?: (key: string) => void;
  testId?: string;
}) {
  const max = Math.max(0, ...data.map((d) => d.value));
  return (
    <div className={`${styles.viz} ${styles.barList}`} data-testid={testId}>
      {data.map((datum) => {
        const body = (
          <>
            <span className={styles.barHead}>
              <span
                className={styles.barLabel}
                title={
                  typeof datum.label === "string" ? datum.label : undefined
                }
              >
                {datum.label}
              </span>
              <b>{datum.display}</b>
            </span>
            <span className={styles.barTrack}>
              <span
                className={styles.barFill}
                style={{
                  display: "block",
                  width: `${max > 0 ? (datum.value / max) * 100 : 0}%`,
                  // A zero draws nothing; the value text still says 0.
                  minWidth: datum.value > 0 ? 2 : 0,
                  background: datum.color,
                }}
              />
            </span>
          </>
        );
        return onSelect ? (
          <button
            key={datum.key}
            type="button"
            className={styles.barRow}
            onClick={() => onSelect(datum.key)}
          >
            {body}
          </button>
        ) : (
          <div key={datum.key} className={styles.barRow}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

export interface DonutDatum {
  key: string;
  label: string;
  value: number;
  /** Shown beside the label, e.g. a count or an exact amount. */
  display: ReactNode;
  color: string;
}

const RING_RADIUS = 46;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;
/** Surface gap between segments, in ring units (about 2px at the drawn size). */
const RING_GAP = 2.2;

/**
 * A donut for one whole split into at most six parts, always beside a list that names each
 * part with its figure and share, so close values are read from the numbers, not the angles.
 * Segments keep the caller's fixed order and colour (colour follows the entity). Hover or focus
 * a segment or a row for its tooltip; `onSelect` makes both a link.
 */
export function Donut({
  data,
  total,
  caption,
  label,
  onSelect,
  testId,
}: {
  data: DonutDatum[];
  /** Big figure in the middle of the ring. */
  total: ReactNode;
  /** Small word under it, e.g. "hợp đồng". */
  caption: string;
  /** Accessible name of the chart. */
  label: string;
  onSelect?: (key: string) => void;
  testId?: string;
}) {
  const sum = data.reduce((s, d) => s + d.value, 0);
  const shown = data.filter((d) => d.value > 0);
  const gap = shown.length > 1 ? RING_GAP : 0;
  let start = 0;
  const arcs = shown.map((d) => {
    const length = (d.value / sum) * RING_LENGTH;
    const arc = { ...d, start, length: Math.max(length - gap, 0.6) };
    start += length;
    return arc;
  });
  const tip = (d: DonutDatum) =>
    `${d.label}: ${typeof d.display === "string" || typeof d.display === "number" ? d.display : d.value} · ${formatNumber(share(d.value, sum), 1)}%`;
  const select = (key: string) => (onSelect ? () => onSelect(key) : undefined);
  return (
    <div className={`${styles.viz} ${styles.donut}`} data-testid={testId}>
      <div className={styles.donutRing}>
        <svg viewBox="0 0 120 120" role="img" aria-label={label}>
          <circle
            cx="60"
            cy="60"
            r={RING_RADIUS}
            className={styles.donutTrack}
          />
          {arcs.map((arc) => (
            <Tooltip key={arc.key} title={tip(arc)}>
              <circle
                cx="60"
                cy="60"
                r={RING_RADIUS}
                className={styles.donutArc}
                stroke={arc.color}
                strokeDasharray={`${arc.length} ${RING_LENGTH - arc.length}`}
                strokeDashoffset={-arc.start}
                onClick={select(arc.key)}
                data-clickable={onSelect ? true : undefined}
                data-testid={testId ? `${testId}-${arc.key}` : undefined}
              />
            </Tooltip>
          ))}
        </svg>
        <div className={styles.donutCenter} aria-hidden>
          <b>{total}</b>
          <span>{caption}</span>
        </div>
      </div>
      <ul className={styles.donutList}>
        {data.map((d) => {
          const body = (
            <>
              <span className={styles.swatch} style={{ background: d.color }} />
              <span className={styles.donutLabel} title={d.label}>
                {d.label}
              </span>
              <b>{d.display}</b>
              <span className={styles.donutShare}>
                {formatNumber(share(d.value, sum), 0)}%
              </span>
            </>
          );
          return (
            <li key={d.key} data-zero={d.value === 0 || undefined}>
              {onSelect && d.value > 0 ? (
                <button
                  type="button"
                  className={styles.donutRow}
                  onClick={() => onSelect(d.key)}
                >
                  {body}
                </button>
              ) : (
                <span className={styles.donutRow}>{body}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
