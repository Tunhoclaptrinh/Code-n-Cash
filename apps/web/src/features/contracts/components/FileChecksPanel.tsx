import { useTranslation } from "react-i18next";
import { Typography, Descriptions } from "antd";
import { BaseCard } from "@codecash/ui";
import type { ContractFile } from "../types";

/** Selection metadata is not proof that text extraction or signature verification succeeded. */
export function FileChecksPanel({
  file,
  signingSteps,
}: {
  file: ContractFile;
  signingSteps: number;
}) {
  const { t } = useTranslation("contracts");
  return (
    <BaseCard title={t("contractUpload.checks.title")}>
      <Descriptions
        size="small"
        column={1}
        items={[
          {
            key: "file",
            label: t("contractUpload.form.file.label"),
            children: file.name || t("contractUpload.checks.noFile"),
          },
          {
            key: "status",
            label: t("contractUpload.checks.storage"),
            children: t(
              file.documentId
                ? "contractUpload.checks.uploaded"
                : "contractUpload.checks.local",
            ),
          },
          {
            key: "signers",
            label: t("contractUpload.form.signers.label"),
            children: t("contractUpload.checks.ready.detail", {
              steps: signingSteps,
            }),
          },
        ]}
      />
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {t("contractUpload.checks.pendingVerification")}
      </Typography.Text>
    </BaseCard>
  );
}
