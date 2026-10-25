import { App as AntApp } from "antd";
import { useTranslation } from "react-i18next";
import { ApiError } from "@/shared/api/client";

/** Returns a handler that shows a translated toast for a failed workflow call. */
export function useApiErrorMessage() {
  const { t: td } = useTranslation("domain");
  const { message } = AntApp.useApp();
  return (error: unknown) =>
    message.error(
      td(`errors.${error instanceof ApiError ? error.code : "UNKNOWN"}`, {
        defaultValue: td("errors.UNKNOWN"),
      }),
    );
}
