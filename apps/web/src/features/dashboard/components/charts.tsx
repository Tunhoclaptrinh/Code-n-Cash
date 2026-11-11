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
}: {
  parts: ChartPart[];
  total?: number;
}) {
  return (
    <div className={styles.legend}>
      {parts.map((part) => (
        <span key={part.key} className={styles.legendItem}>
          <span className={styles.swatch} style={{ background: part.color }} />
          {part.label}
          <b>{part.display}</b>
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
  testId,
}: {
  parts: ChartPart[];
  /** Accessible name of the whole bar. */
  label: string;
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
      <Legend parts={parts} total={total} />
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
  testId,
}: {
  data: ColumnDatum[];
  /** Series in stacking order (bottom first), for the legend. */
  series: Omit<ChartPart, "value" | "display">[];
  height?: number;
  onSelect?: (key: string) => void;
  label: string;
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
      <Legend parts={series.map((s) => ({ ...s, value: 0, display: "" }))} />
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
              <span>{datum.label}</span>
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
