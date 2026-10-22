import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useCurrentUser } from "@/shared/auth/session";
import { AppShell } from "@/shared/layout/AppShell";
import {
  getContractDraft,
  getUploadFormOptions,
} from "../api/contractDraft.api";
import { ContractUploadForm } from "../components/ContractUploadForm";
import { FileChecksPanel } from "../components/FileChecksPanel";
import { PagePreviewPanel } from "../components/PagePreviewPanel";
import { WizardStepper } from "../components/WizardStepper";
import styles from "./ContractUploadPage.module.css";

export default function ContractUploadPage() {
  const { t } = useTranslation("contracts");
  const { t: tc } = useTranslation("common");
  const user = useCurrentUser();

  const draft = useQuery({
    queryKey: ["contract-draft"],
    queryFn: getContractDraft,
  });
  const options = useQuery({
    queryKey: ["upload-form-options", user.organizationId],
    queryFn: () => getUploadFormOptions(user.organizationId),
  });

  const template = draft.data
    ? options.data?.signingTemplates.find(
        (candidate) => candidate.id === draft.data.signingTemplateId,
      )
    : undefined;

  return (
    <AppShell
      active="upload"
      breadcrumb={[
        { label: t("breadcrumb.contracts"), to: "/contracts" },
        { label: t("breadcrumb.upload") },
      ]}
    >
      {draft.isError || options.isError ? (
        <p role="alert">{tc("common.loadError")}</p>
      ) : null}
      {draft.isPending || options.isPending ? (
        <p>{tc("common.loading")}</p>
      ) : null}
      {draft.data && options.data ? (
        <>
          <WizardStepper current={1} />
          <div className={styles.columns}>
            <ContractUploadForm draft={draft.data} options={options.data} />
            <div className={styles.side}>
              <FileChecksPanel
                pages={draft.data.file.pages ?? 0}
                signingSteps={template?.steps.length ?? 0}
              />
              <PagePreviewPanel
                page={draft.data.file.pages ?? 0}
                total={draft.data.file.pages ?? 0}
              />
            </div>
          </div>
        </>
      ) : null}
    </AppShell>
  );
}
