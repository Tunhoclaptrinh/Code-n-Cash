import { useSearchParams } from "react-router-dom";
import { PageContainer, BaseCard, LoadingState } from "@codecash/ui";
import type { DraftInput } from "../components/ContractUploadForm";
import { Alert } from "antd";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ApiError } from "@/shared/api/client";
import { getContractDraft, getUploadFormOptions } from "@/shared/api/domain";
import { useCurrentUser } from "@/shared/auth/session";
import { AppPage } from "@/shared/layout/AppPage";
import { ContractUploadForm } from "../components/ContractUploadForm";
import { FileChecksPanel } from "../components/FileChecksPanel";
import { PagePreviewPanel } from "../components/PagePreviewPanel";
import { WizardStepper } from "../components/WizardStepper";
import styles from "./ContractUploadPage.module.css";

export default function ContractUploadPage() {
  const { t } = useTranslation("contracts");
  const { t: tc } = useTranslation("common");
  const { t: td } = useTranslation("domain");
  const user = useCurrentUser();
  const [params] = useSearchParams();
  const draftCode = params.get("draft") ?? undefined;
  const draft = useQuery({
    queryKey: [
      "contract-draft",
      user.organizationId,
      user.id,
      draftCode ?? "new",
    ],
    queryFn: () => getContractDraft(draftCode, !draftCode),
  });
  const options = useQuery({
    queryKey: ["contract-draft", "options", user.organizationId, user.id],
    queryFn: getUploadFormOptions,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const [previewFile, setPreviewFile] = useState<File>();
  useEffect(() => setPreviewFile(undefined), [draftCode]);
  const [workingDraft, setWorkingDraft] = useState<DraftInput>();
  const current =
    workingDraft?.code === draft.data?.code ? workingDraft : draft.data;
  const failure = draft.error ?? options.error;

  return (
    <AppPage
      guide="signing"
      active="upload"
      breadcrumb={[
        { label: t("breadcrumb.contracts"), to: "/contracts" },
        { label: t("breadcrumb.upload") },
      ]}
    >
      <PageContainer>
        {failure ? (
          <Alert
            type="error"
            showIcon
            title={
              failure instanceof ApiError
                ? td(`errors.${failure.code}`, {
                    defaultValue: tc("common.loadError"),
                  })
                : tc("common.loadError")
            }
          />
        ) : null}
        {draft.isPending || options.isPending ? (
          <LoadingState tip={tc("common.loading")} />
        ) : null}
        {draft.data && options.data ? (
          <>
            <BaseCard>
              <WizardStepper current={1} />
            </BaseCard>
            <div className={styles.columns}>
              <ContractUploadForm
                key={`${draft.data.code}-${draftCode ?? "new"}`}
                startBlank={!draftCode}
                draft={draft.data}
                options={options.data}
                onDraftChange={setWorkingDraft}
                onPreviewFileChange={setPreviewFile}
              />
              <div className={styles.side}>
                <PagePreviewPanel
                  draft={current}
                  file={previewFile}
                  documentId={current?.file.documentId}
                  name={current?.file.name ?? ""}
                />
                <FileChecksPanel
                  file={current?.file ?? draft.data.file}
                  signingSteps={
                    current?.signers.length ?? draft.data.signers.length
                  }
                />
              </div>
            </div>
          </>
        ) : null}
      </PageContainer>
    </AppPage>
  );
}
