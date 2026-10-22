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
  colorWarning: "#F59E0B",
  colorSuccess: "#10B981",
  colorError: "#EF4444",
  colorInfo: brand.primary,
  fontFamily: brand.fontFamily,
  borderRadius: 8,
  borderRadiusLG: 12,
};

export const lightThemeConfig: ThemeConfig = {
  algorithm: theme.defaultAlgorithm,
  token: {
    ...shared,
    colorBgBase: "#FFFFFF",
    colorBgContainer: "#FFFFFF",
    colorBgElevated: "#FFFFFF",
    colorBgLayout: "#F8FAFC",
    colorText: "#111827",
    colorTextSecondary: "#4B5563",
    colorTextTertiary: "#9CA3AF",
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
    colorBgBase: "#0B0F19",
    colorBgContainer: "#111827",
    colorBgElevated: "#1F2937",
    colorBgLayout: "#0B0F19",
    colorText: "#F9FAFB",
    colorTextSecondary: "#9CA3AF",
    colorTextTertiary: "#6B7280",
    colorBorder: "rgba(255, 255, 255, 0.08)",
    colorBorderSecondary: "rgba(255, 255, 255, 0.04)",
  },
  components: {
    Button: {
      primaryColor: "#FFFFFF",
      controlHeight: 38,
      borderRadius: 8,
      fontWeight: 600,
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
