import { useMutation } from "@tanstack/react-query";
import { DownloadOutlined } from "@ant-design/icons";
import { Button, Space, Tag, Tooltip } from "antd";
import { useTranslation } from "react-i18next";
import { downloadBlob } from "@codecash/ui";
import type { EventRow } from "@codecash/contracts";
import { platform } from "@/shared/api/platform";
import { formatDateTime } from "@/shared/lib/format";
import { useApiErrorMessage } from "../hooks/useApiErrorMessage";

/**
 * The document an event rests on: a download of the stored file (checked against its hash by the API)
 * and whether the submitter's signature still covers it. Imported events only have a file name.
 */
export function EvidenceDocumentLink({ event }: { event: EventRow }) {
  const { t } = useTranslation("milestones");
  const failed = useApiErrorMessage();
  const document = event.document;
  const download = useMutation({
    mutationFn: async () =>
      downloadBlob(
        await platform.download(
          `/evidence-documents/${encodeURIComponent(event.id)}/download`,
        ),
        document!.fileName,
      ),
    onError: failed,
  });
  if (!document) return <>{event.fileName ?? "—"}</>;
  const intact = document.signatureValid && document.stored;
  return (
    <Space size={4} wrap>
      <Button
        type="link"
        size="small"
        icon={<DownloadOutlined />}
        loading={download.isPending}
        onClick={() => download.mutate()}
        style={{ paddingInline: 0 }}
        data-testid="evidence-download"
      >
        {document.fileName}
      </Button>
      <Tooltip
        title={t("evidenceDocument.signedBy", {
          name: document.signedBy,
          at: formatDateTime(document.signedAt),
        })}
      >
        <Tag color={intact ? "success" : "error"} style={{ margin: 0 }}>
          {t(intact ? "evidenceDocument.signed" : "evidenceDocument.broken")}
        </Tag>
      </Tooltip>
    </Space>
  );
}
