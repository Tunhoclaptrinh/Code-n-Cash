import { Button, Result } from "antd";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { AppPage } from "../layout/AppPage";

export default function NotFoundPage() {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  return (
    <AppPage breadcrumb={[{ label: t("errors.notFound.title") }]}>
      <Result
        status="404"
        title={t("errors.notFound.title")}
        subTitle={t("errors.notFound.body")}
        extra={
          <Button
            type="primary"
            onClick={() => navigate("/", { replace: true })}
          >
            {t("errors.notFound.back")}
          </Button>
        }
      />
    </AppPage>
  );
}
