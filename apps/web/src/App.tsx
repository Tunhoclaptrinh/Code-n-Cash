import { UiProvider, ErrorBoundary } from "@codecash/ui";
import { ConfigProvider } from "antd";
import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { RouterProvider } from "react-router-dom";
import { router } from "./router";
import { SessionProvider } from "./shared/auth/session";
import { OnboardingProvider } from "./shared/onboarding/OnboardingContext";
import { actionTheme } from "./shared/ui/action-theme";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: false },
  },
});

export function App() {
  const { i18n } = useTranslation();

  useEffect(() => {
    document.documentElement.lang = i18n.language?.startsWith("vi")
      ? "vi"
      : "en";
  }, [i18n.language]);

  return (
    <QueryClientProvider client={queryClient}>
      <UiProvider>
        <ConfigProvider theme={actionTheme}>
          <ErrorBoundary>
            <SessionProvider>
              <OnboardingProvider>
                <RouterProvider router={router} />
              </OnboardingProvider>
            </SessionProvider>
          </ErrorBoundary>
        </ConfigProvider>
      </UiProvider>
    </QueryClientProvider>
  );
}
