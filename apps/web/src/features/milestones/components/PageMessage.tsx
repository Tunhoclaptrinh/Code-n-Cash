import { Alert, Empty, Spin } from "antd";
import { useTranslation } from "react-i18next";
export function PageMessage({
  kind,
}: {
  kind: "loading" | "error" | "notFound";
}) {
  const { t } = useTranslation("common");
  if (kind === "loading")
    return (
      <Spin tip={t("common.loading")}>
        <div style={{ height: 100 }} />
      </Spin>
    );
  return kind === "error" ? (
    <Alert type="error" title={t("common.loadError")} />
  ) : (
    <Empty />
  );
}
