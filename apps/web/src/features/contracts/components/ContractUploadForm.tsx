import { DemoFillButton } from "@/shared/ui/DemoFillButton";
import { Alert, Form, Typography } from "antd";
import { BaseCard, FormFooter } from "@codecash/ui";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useContractUploadForm } from "../hooks/useContractUploadForm";
import type { DraftInput } from "../lib/uploadDraft";
import type { ContractDraft, UploadFormOptions } from "../types";
import { UploadDetailsSection } from "./UploadDetailsSection";
import { UploadDocumentSection } from "./UploadDocumentSection";
import { UploadSigningSection } from "./UploadSigningSection";
import { UploadTermsSection } from "./UploadTermsSection";
import styles from "./ContractUploadForm.module.css";

interface ContractUploadFormProps {
  draft: ContractDraft;
  startBlank?: boolean;
  options: UploadFormOptions;
  onPreviewFileChange?: (file: File) => void;
  onDraftChange?: (draft: DraftInput) => void;
}

/**
 * Step 1 of the upload wizard: terms the Data Pack also records (type, value, dates, approval
 * policy, penalty) and the signing order — how many people sign, from which side, in which order.
 */
export function ContractUploadForm({
  draft,
  startBlank = false,
  options,
  onDraftChange,
  onPreviewFileChange,
}: ContractUploadFormProps) {
  const { t } = useTranslation("contracts");
  const { t: tc } = useTranslation("common");
  const navigate = useNavigate();
  const form = useContractUploadForm({
    draft,
    startBlank,
    options,
    onDraftChange,
    onPreviewFileChange,
  });
  const { save, sample, fillAll, onContinue, errorCode } = form;

  return (
    <BaseCard bodyStyle={{ padding: 20 }}>
      <Form
        className={styles.form}
        disabled={save.isPending || sample.isPending}
        layout="vertical"
        onFinish={onContinue}
      >
        <div className={styles.toolbar}>
          <Typography.Text strong>
            {t("contractUpload.sections.details")}
          </Typography.Text>
          <DemoFillButton
            disabled={save.isPending || sample.isPending}
            onClick={fillAll}
            testId="contract-fill-demo"
          >
            {tc("demoFill.all")}
          </DemoFillButton>
        </div>
        <UploadDetailsSection form={form} options={options} />
        <UploadTermsSection form={form} options={options} />
        <UploadSigningSection form={form} options={options} />
        <UploadDocumentSection form={form} />
        {save.isError ? (
          <Alert
            type="error"
            showIcon
            title={t(`contractUpload.form.errors.${errorCode ?? "UNKNOWN"}`, {
              defaultValue:
                errorCode ?? t("contractUpload.form.errors.UNKNOWN"),
            })}
            style={{ marginBottom: 16 }}
          />
        ) : null}
        <FormFooter
          loading={save.isPending}
          submitText={t("contractUpload.form.actions.continue")}
          cancelText={t("contractUpload.form.actions.cancel")}
          onCancel={() => navigate("/contracts")}
          onSubmit={onContinue}
        />
      </Form>
    </BaseCard>
  );
}
