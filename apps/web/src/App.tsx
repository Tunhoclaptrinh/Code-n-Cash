import { UiProvider, ErrorBoundary } from "@codecash/ui";
import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { RouterProvider } from "react-router-dom";
import { router } from "./router";
import { SessionProvider } from "./shared/auth/session";

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
        <ErrorBoundary>
          <SessionProvider>
            <RouterProvider router={router} />
          </SessionProvider>
        </ErrorBoundary>
      </UiProvider>
    </QueryClientProvider>
  );
}
