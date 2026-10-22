import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AppPage } from "@/shared/layout/AppPage";
import { PageState } from "@/shared/ui/PageState";
import { listActivityEntries } from "../api/activity.api";
import { ActivityLogView } from "../components/ActivityLogView";

export default function ActivityLogPage() {
  const { t } = useTranslation("audit");
  const entries = useQuery({
    queryKey: ["activity-log"],
    queryFn: listActivityEntries,
  });

  return (
    <AppPage
      active="activity"
      breadcrumb={[{ label: t("breadcrumb.activityLog") }]}
    >
      {entries.isError ? (
        <PageState kind="error" onRetry={() => void entries.refetch()} />
      ) : (
        <ActivityLogView
          entries={entries.data ?? []}
          loading={entries.isPending || entries.isFetching}
          onRefresh={() => void entries.refetch()}
        />
      )}
    </AppPage>
  );
}
