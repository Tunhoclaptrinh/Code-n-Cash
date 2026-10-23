import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppPage } from "@/shared/layout/AppPage";
import { ActivityLogView } from "../components/ActivityLogView";

export default function ActivityLogPage() {
  const { t } = useTranslation("audit");
  const [params] = useSearchParams();
  return (
    <AppPage
      guide="activity"
      active="activity"
      breadcrumb={[{ label: t("breadcrumb.activityLog") }]}
    >
      <ActivityLogView initialContract={params.get("contract") ?? ""} />
    </AppPage>
  );
}
