import type { ReactNode } from "react";
import { Alert, Button, Empty, Skeleton } from "antd";
import { useTranslation } from "react-i18next";

/** Placeholder for a screen whose data is loading, failed, does not exist, or has nothing to do. */
export function PageState({
  kind,
  onRetry,
  title,
  action,
}: {
  kind: "loading" | "error" | "notFound" | "empty";
  onRetry?: () => void;
  /** Message of the `empty` state. */
  title?: string;
  /** Way out of the `empty` state, so the user is never left on a dead end. */
  action?: ReactNode;
}) {
  const { t } = useTranslation("common");
  if (kind === "loading")
    return (
      <div role="status" aria-label={t("common.loading")}>
        <Skeleton active title paragraph={{ rows: 6 }} />
      </div>
    );
  if (kind === "notFound") return <Empty description={t("common.notFound")} />;
  if (kind === "empty")
    return <Empty description={title}>{action ?? null}</Empty>;
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
