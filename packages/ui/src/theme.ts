import { theme as antTheme, type ThemeConfig } from "antd";
import type { ThemeMode } from "./context/AppConfigContext";

/**
 * Brand palette shared by the Ant Design theme and `styles/tokens.css`.
 * Change a colour here and in tokens.css together; feature CSS reads the CSS variables.
 */
export const brand = {
  primary: "#315bea",
  fontFamily:
    '"Plus Jakarta Sans Variable", "Plus Jakarta Sans", system-ui, sans-serif',
} as const;

export function buildTheme(mode: ThemeMode): ThemeConfig {
  const dark = mode === "dark";
  return {
    algorithm: dark ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
    token: {
      colorPrimary: brand.primary,
      colorInfo: brand.primary,
      colorBgLayout: dark ? "#101318" : "#f5f7fb",
      borderRadius: 8,
      borderRadiusLG: 12,
      fontFamily: brand.fontFamily,
    },
    components: {
      Layout: {
        headerBg: dark ? "#171b22" : "#ffffff",
        siderBg: dark ? "#171b22" : "#ffffff",
        headerHeight: 64,
        headerPadding: "0 24px",
      },
      Menu: {
        itemBg: "transparent",
        itemBorderRadius: 8,
        itemMarginInline: 8,
        activeBarBorderWidth: 0,
      },
      Table: {
        headerBg: dark ? "#1f2433" : "#f5f7fc",
        headerColor: dark ? "#c0cada" : "#4a5570",
      },
      Button: { controlHeight: 36, fontWeight: 600 },
      Card: { headerFontSize: 16 },
    },
  };
}
