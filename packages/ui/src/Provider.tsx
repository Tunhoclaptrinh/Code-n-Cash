import { App, ConfigProvider, theme } from "antd";
import viVN from "antd/locale/vi_VN";
import enUS from "antd/locale/en_US";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import { AppConfigProvider, useAppConfig } from "./context/AppConfigContext";
function Config({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  const { themeMode } = useAppConfig();
  return (
    <ConfigProvider
      locale={i18n.language.startsWith("vi") ? viVN : enUS}
      theme={{
        algorithm:
          themeMode === "dark" ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: "#315bea",
          borderRadius: 8,
          fontFamily: '"Plus Jakarta Sans Variable", sans-serif',
        },
        components: {
          Table: { headerBg: themeMode === "dark" ? "#1f2433" : "#f5f7fc" },
          Button: { controlHeight: 36 },
        },
      }}
    >
      <App>{children}</App>
    </ConfigProvider>
  );
}
export function UiProvider({ children }: { children: ReactNode }) {
  return (
    <AppConfigProvider>
      <Config>{children}</Config>
    </AppConfigProvider>
  );
}
