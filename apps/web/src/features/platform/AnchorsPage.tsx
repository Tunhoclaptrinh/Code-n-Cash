import { useTranslation } from "react-i18next";
import { AppPage } from "@/shared/layout/AppPage";
import { AnchorPanel } from "@/features/audit/components/AnchorPanel";
export default function AnchorsPage() {
  const { t } = useTranslation("trust");
  return (
    <AppPage
      active="platform"
      guide="integrity"
      breadcrumb={[{ label: t("anchors.title") }]}
    >
      <AnchorPanel />
    </AppPage>
  );
}
