import i18next from "i18next";
import vi from "./locales/vi.json";
import en from "./locales/en.json";
export const uiResources = { vi, en };
export function uiText(
  key: string,
  values: Record<string, unknown> = {},
): string {
  return i18next.t(key, {
    ns: "base",
    ...values,
    defaultValue:
      (i18next.language?.startsWith("vi") ? vi : en)[key as keyof typeof vi] ??
      key,
  }) as string;
}
