/** Largest number of statistic tiles in one row on a wide screen. */
const MAX_PER_ROW = 6;

/**
 * Grid span of statistic tile `index` among `count` tiles, so rows come out even: up to six sit
 * in one row on a wide screen, more split into rows of equal size (nine is five and four, not six
 * and three). Phones show two per row, tablets three; a lone last tile on a phone takes the row.
 */
export function statSpan(index: number, count: number) {
  const rows = Math.ceil(count / MAX_PER_ROW);
  const perRow = Math.ceil(count / rows);
  return {
    xs: count % 2 === 1 && index === count - 1 ? 24 : 12,
    md: 8,
    xl: { flex: `0 0 ${100 / perRow}%` },
  };
}
