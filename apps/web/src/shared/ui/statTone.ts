/**
 * Statistic pill palette (UniFlow pastel: rgba wash + solid value colour), shared by every list page.
 * The value colours are CSS tokens (styles/global.css) so each theme gets a shade that keeps the
 * 22px bold figure at WCAG AA contrast (3:1 for large text) on its wash.
 */
export type StatTone =
  "blue" | "indigo" | "green" | "amber" | "red" | "orange" | "sky" | "violet";

export interface StatColor {
  bg: string;
  value: string;
}

const tone = (rgb: string, name: StatTone): StatColor => ({
  bg: `rgba(${rgb}, 0.08)`,
  value: `var(--stat-${name})`,
});

export const STAT_TONE: Record<StatTone, StatColor> = {
  blue: tone("49, 91, 234", "blue"),
  indigo: tone("99, 102, 241", "indigo"),
  green: tone("16, 185, 129", "green"),
  amber: tone("245, 158, 11", "amber"),
  red: tone("239, 68, 68", "red"),
  orange: tone("249, 115, 22", "orange"),
  sky: tone("14, 165, 233", "sky"),
  violet: tone("139, 92, 246", "violet"),
};
