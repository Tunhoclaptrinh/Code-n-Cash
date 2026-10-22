import { Alert, Spin } from "antd";
import { useTranslation } from "react-i18next";
export function PageStatus({ isError }: { isError: boolean }) {
  const { t } = useTranslation("common");
  return isError ? (
    <Alert type="error" title={t("common.loadError")} />
  ) : (
    <Spin />
  );
}
