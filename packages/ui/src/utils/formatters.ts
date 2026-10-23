export const formatNumber = (value: number | string) =>
  new Intl.NumberFormat().format(Number(value));
