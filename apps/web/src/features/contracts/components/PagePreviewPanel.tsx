import { useTranslation } from "react-i18next";
import { BaseCard } from "@codecash/ui";
import { DocumentPreview } from "@/shared/ui/DocumentPreview";
export function PagePreviewPanel({
  file,
  documentId,
  name,
}: {
  file?: File;
  documentId?: string;
  name: string;
}) {
  const { t } = useTranslation("contracts");
  return (
    <BaseCard title={t("contractUpload.preview.title")}>
      <DocumentPreview file={file} documentId={documentId} name={name} />
    </BaseCard>
  );
}
