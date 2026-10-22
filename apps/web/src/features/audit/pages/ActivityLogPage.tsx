import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AppPage } from "@/shared/layout/AppPage";
import {
  getDefaultActivityRange,
  listActivityEntries,
} from "../api/activity.api";
import { ActivityLogView } from "../components/ActivityLogView";
import styles from "./ActivityLogPage.module.css";

export default function ActivityLogPage() {
  const { t } = useTranslation("audit");
  const { t: tc } = useTranslation("common");

  const entries = useQuery({
    queryKey: ["activity-log"],
    queryFn: listActivityEntries,
  });
  const range = useQuery({
    queryKey: ["activity-log", "default-range"],
    queryFn: getDefaultActivityRange,
  });

  return (
    <AppPage
      active="activity"
      breadcrumb={[{ label: t("breadcrumb.activityLog") }]}
    >
      {entries.isError || range.isError ? (
        <p role="alert">{tc("common.loadError")}</p>
      ) : null}
      {entries.isPending || range.isPending ? (
        <p className={styles.status}>{tc("common.loading")}</p>
      ) : null}
      {entries.data && range.data ? (
        <ActivityLogView entries={entries.data} defaultRange={range.data} />
      ) : null}
    </AppPage>
  );
}
