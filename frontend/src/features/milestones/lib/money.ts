/** Money is held in millions of VND with two decimals; arithmetic runs on integer hundredths to avoid float drift. */
export const toCents = (million: number): number => Math.round(million * 100);
export const fromCents = (cents: number): number => cents / 100;

export function sumMillion(values: number[]): number {
  return fromCents(values.reduce((total, value) => total + toCents(value), 0));
}

export function subtractMillion(a: number, b: number): number {
  return fromCents(toCents(a) - toCents(b));
}

/** `million` x `basisPoints` / 10 000, rounded to the nearest hundredth. */
export function basisPointsOf(million: number, basisPoints: number): number {
  return fromCents(Math.round((toCents(million) * basisPoints) / 10000));
}
