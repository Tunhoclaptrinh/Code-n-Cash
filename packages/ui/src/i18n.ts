import i18next from "i18next";
import vi from "./locales/vi.json";
import en from "./locales/en.json";
/** Register under the `base` namespace: `resources[lang].base = uiResources[lang]`. */
export const uiResources = { vi, en };
function lookup(bundle: unknown, key: string): string | undefined {
  const value = key
    .split(".")
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown> | undefined)?.[part],
      bundle,
    );
  return typeof value === "string" ? value : undefined;
}
/** Translate a shared-component string; falls back to the bundled copy if the app did not register `base`. */
export function uiText(
  key: string,
  values: Record<string, unknown> = {},
): string {
  return i18next.t(key, {
    ns: "base",
    ...values,
    defaultValue:
      lookup(i18next.language?.startsWith("vi") ? vi : en, key) ?? key,
  }) as string;
}
