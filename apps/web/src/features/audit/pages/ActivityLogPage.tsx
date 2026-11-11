import { Navigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppPage } from "@/shared/layout/AppPage";
import { ActivityLogView } from "../components/ActivityLogView";

export default function ActivityLogPage() {
  const { t } = useTranslation("audit");
  const [params] = useSearchParams();
  // Older links carry ?contract=; the list keeps its filters as f.<field> in the address.
  const legacy = params.get("contract");
  if (legacy)
    return (
      <Navigate
        replace
        to={`?${new URLSearchParams({ "f.contractCode": legacy })}`}
      />
    );
  return (
    <AppPage
      guide="activity"
      active="activity"
      breadcrumb={[{ label: t("breadcrumb.activityLog") }]}
    >
      <ActivityLogView />
    </AppPage>
  );
}
