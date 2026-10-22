import { Alert, Button, Empty, Skeleton } from "antd";
import { useTranslation } from "react-i18next";

/** Placeholder for a screen whose data is loading, failed, or does not exist. */
export function PageState({
  kind,
  onRetry,
}: {
  kind: "loading" | "error" | "notFound";
  onRetry?: () => void;
}) {
  const { t } = useTranslation("common");
  if (kind === "loading")
    return (
      <div role="status" aria-label={t("common.loading")}>
        <Skeleton active title paragraph={{ rows: 6 }} />
      </div>
    );
  if (kind === "notFound") return <Empty description={t("common.notFound")} />;
  return (
    <Alert
      type="error"
      showIcon
      title={t("common.loadError")}
      action={
        onRetry ? (
          <Button size="small" onClick={onRetry}>
            {t("common.retry")}
          </Button>
        ) : undefined
      }
    />
  );
}
