import { theme, type ThemeConfig } from "antd";
import type { ThemeMode } from "./context/AppConfigContext";

/**
 * Ant Design theme in the UniFlow base layout (light/dark configs with the same token set),
 * branded for CodeCash. `styles/tokens.css` mirrors these values as CSS variables.
 */
export const brand = {
  primary: "#315bea",
  primaryHover: "#2849bd",
  fontFamily:
    "'Plus Jakarta Sans Variable', 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
} as const;

const shared: ThemeConfig["token"] = {
  colorPrimary: brand.primary,
  colorInfo: brand.primary,
  fontFamily: brand.fontFamily,
  borderRadius: 8,
  borderRadiusLG: 12,
};

export const lightThemeConfig: ThemeConfig = {
  algorithm: theme.defaultAlgorithm,
  token: {
    ...shared,
    // Status and preset seeds dark enough that tag text, links and white-on-solid buttons
    // reach WCAG AA (4.5:1) on white and on their own light tints.
    colorWarning: "#B45309",
    colorSuccess: "#047857",
    colorError: "#B91C1C",
    green: "#15803D",
    orange: "#C2410C",
    gold: "#AD6800",
    cyan: "#0891B2",
    // Ant Design derives the light tint of the dark success seed as a grey-green (#a5b8af): the
    // tag text then reads dim at 2.6:1. Use the light tint of tokens.css instead. Preset palettes
    // (green1…) are regenerated from their seed and cannot be overridden this way, so tags that
    // mean "done" use the success status colour, not the green preset.
    colorSuccessBg: "#E4F6EC",
    colorSuccessBgHover: "#D3EFDF",
    colorSuccessBorder: "#A3D9BC",
    colorSuccessBorderHover: "#6FC096",
    // The derived warning tint leaves tag text at 4.3:1; a lighter one reaches 4.6:1.
    colorWarningBg: "#FEF5E7",
    colorBgBase: "#FFFFFF",
    colorBgContainer: "#FFFFFF",
    colorBgElevated: "#FFFFFF",
    colorBgLayout: "#F8FAFC",
    colorText: "#111827",
    colorTextSecondary: "#4B5563",
    colorTextTertiary: "#6B7280",
    colorTextPlaceholder: "#6B7280",
    colorBorder: "#E5E7EB",
    colorBorderSecondary: "#F3F4F6",
  },
  components: {
    Button: {
      primaryColor: "#FFFFFF",
      controlHeight: 38,
      borderRadius: 8,
      fontWeight: 600,
    },
    Card: {
      colorBgContainer: "#FFFFFF",
      colorBorderSecondary: "#E5E7EB",
      paddingLG: 20,
    },
    Table: {
      colorBgContainer: "#FFFFFF",
      headerBg: "#F8FAFC",
      headerColor: "#111827",
      rowHoverBg: "rgba(49, 91, 234, 0.04)",
      borderColor: "#E5E7EB",
    },
    Menu: {
      itemBg: "transparent",
      itemSelectedBg: "rgba(49, 91, 234, 0.08)",
      itemSelectedColor: brand.primary,
    },
    Layout: { headerBg: "#FFFFFF", siderBg: "#FFFFFF", bodyBg: "#F8FAFC" },
    Modal: { contentBg: "#FFFFFF", headerBg: "#FFFFFF" },
    Drawer: { colorBgElevated: "#FFFFFF" },
  },
};

export const darkThemeConfig: ThemeConfig = {
  algorithm: theme.darkAlgorithm,
  token: {
    ...shared,
    // Bright seeds read on the dark surfaces; links get a lighter blue than the button fill.
    // Text-carrying colours (info, error, presets, secondary text) are chosen so the dark
    // algorithm's output keeps 4.5:1 on #111827; fills keep white or dark text at 4.5:1.
    colorWarning: "#F59E0B",
    colorSuccess: "#10B981",
    colorError: "#F87171",
    colorInfo: "#8AA4FF",
    colorLink: "#8AA4FF",
    geekblue: "#6F8FF5",
    green: "#269739",
    colorBgBase: "#0B0F19",
    colorBgContainer: "#111827",
    colorBgElevated: "#1F2937",
    colorBgLayout: "#0B0F19",
    colorText: "#F9FAFB",
    colorTextSecondary: "#D1D5DB",
    colorTextTertiary: "#9CA3AF",
    colorBorder: "rgba(255, 255, 255, 0.08)",
    colorBorderSecondary: "rgba(255, 255, 255, 0.04)",
  },
  components: {
    Button: {
      primaryColor: "#FFFFFF",
      // The light error red needs dark text on a solid danger button.
      dangerColor: "#0B0F19",
      controlHeight: 38,
      borderRadius: 8,
      fontWeight: 600,
    },
    // Count badges keep white text: a deeper red than the text-safe error colour.
    Badge: { colorError: "#DC2626" },
    Pagination: { itemActiveColor: "#8AA4FF", itemActiveColorHover: "#A6BDFF" },
    Tabs: {
      itemSelectedColor: "#8AA4FF",
      itemActiveColor: "#8AA4FF",
      itemHoverColor: "#A6BDFF",
      inkBarColor: "#8AA4FF",
    },
    Card: {
      colorBgContainer: "#111827",
      colorBorderSecondary: "rgba(255, 255, 255, 0.08)",
      paddingLG: 20,
    },
    Table: {
      colorBgContainer: "#111827",
      headerBg: "#1F2937",
      headerColor: "#F9FAFB",
      rowHoverBg: "rgba(49, 91, 234, 0.08)",
      borderColor: "rgba(255, 255, 255, 0.06)",
    },
    Menu: {
      itemBg: "transparent",
      darkItemBg: "#111827",
      darkItemSelectedBg: "rgba(49, 91, 234, 0.18)",
      darkItemSelectedColor: "#a6bdff",
    },
    Layout: { headerBg: "#111827", siderBg: "#111827", bodyBg: "#0B0F19" },
    Modal: { contentBg: "#111827", headerBg: "#111827" },
    Drawer: { colorBgElevated: "#111827" },
  },
};

export const themeConfigFor = (mode: ThemeMode): ThemeConfig =>
  mode === "dark" ? darkThemeConfig : lightThemeConfig;
