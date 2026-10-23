import { App, ConfigProvider } from "antd";
import viVN from "antd/locale/vi_VN";
import enUS from "antd/locale/en_US";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import { AppConfigProvider, useAppConfig } from "./context/AppConfigContext";
import { themeConfigFor } from "./theme";
function Config({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  const { themeMode } = useAppConfig();
  return (
    <ConfigProvider
      locale={i18n.language?.startsWith("vi") ? viVN : enUS}
      theme={themeConfigFor(themeMode)}
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
