export const isEmptyInput = (value: unknown) =>
  value === undefined ||
  value === null ||
  (typeof value === "string" && !value.trim()) ||
  (Array.isArray(value) && value.length === 0);

/** Only propose input values. Never submit, choose a decision or replace entered data. */
export function emptyInputPatch<T extends object>(
  current: T,
  sample: Partial<T>,
): Partial<T> {
  return Object.fromEntries(
    Object.entries(sample).filter(
      ([key, value]) =>
        !isEmptyInput(value) && isEmptyInput(current[key as keyof T]),
    ),
  ) as Partial<T>;
}

export function fillEmptyInputs<T extends object>(
  current: T,
  sample: Partial<T>,
): T {
  return { ...current, ...emptyInputPatch(current, sample) };
}
