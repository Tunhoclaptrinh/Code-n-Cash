import { Button, Result, Typography } from "antd";
import { useTranslation } from "react-i18next";
import { isRouteErrorResponse, useRouteError } from "react-router-dom";

/** Route-level error boundary: a failed lazy chunk or a render error shows this instead of a blank page. */
export default function RouteErrorPage() {
  const { t } = useTranslation("common");
  const error = useRouteError();
  const detail = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : undefined;
  return (
    <Result
      status="error"
      title={t("errors.route.title")}
      subTitle={t("errors.route.body")}
      extra={
        <Button type="primary" onClick={() => window.location.reload()}>
          {t("errors.route.reload")}
        </Button>
      }
    >
      {import.meta.env.DEV && detail ? (
        <Typography.Paragraph code style={{ textAlign: "center" }}>
          {detail}
        </Typography.Paragraph>
      ) : null}
    </Result>
  );
}
