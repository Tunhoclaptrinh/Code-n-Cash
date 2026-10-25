import { useEffect, useState } from "react";
import { Alert, Button, Space, Spin } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { downloadBlob } from "@codecash/ui";
import { platform } from "../api/platform";
/** Authenticated bytes only; revoke object URLs when a document changes or closes. */
export function DocumentPreview({
  previewPath,
  file,
  documentId,
  name,
  onReady,
}: {
  previewPath?: string;
  file?: File;
  documentId?: string;
  name: string;
  onReady?: (ready: boolean) => void;
}) {
  const { t } = useTranslation("contracts");
  const [result, setResult] = useState<{
    url: string;
    blob: Blob;
    source: File | string;
  }>();
  const [failed, setFailed] = useState(false);
  const source = file ?? previewPath ?? documentId;
  useEffect(() => {
    let active = true;
    let url: string | undefined;
    setFailed(false);
    onReady?.(false);
    if (!source) return;
    const load = async () => {
      try {
        let blob: Blob;
        if (
          file?.type === "application/pdf" ||
          file?.name.toLowerCase().endsWith(".pdf")
        )
          blob = new Blob([file], { type: "application/pdf" });
        else if (file) {
          const body = new FormData();
          body.append("file", file);
          blob = await platform.download("/documents/preview", {
            method: "POST",
            body,
          });
        } else
          blob = await platform.download(
            previewPath ??
              `/documents/${encodeURIComponent(documentId!)}/preview`,
          );
        if (!active) return;
        url = URL.createObjectURL(blob);
        setResult({ url, blob, source });
      } catch {
        if (active) setFailed(true);
      }
    };
    void load();
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [source, file, documentId, previewPath, onReady]);
  if (!source)
    return <Alert type="info" title={t("contractUpload.preview.selectFile")} />;
  if (failed)
    return (
      <Alert
        type="warning"
        showIcon
        title={t("contractUpload.preview.unavailable")}
      />
    );
  if (!result || result.source !== source)
    return (
      <Spin tip={t("contractUpload.preview.loading")}>
        <div style={{ height: 160 }} />
      </Spin>
    );
  return (
    <Space orientation="vertical" style={{ width: "100%" }}>
      <Button
        icon={<DownloadOutlined />}
        onClick={() =>
          downloadBlob(result.blob, name.replace(/\.[^.]+$/, "") + ".pdf")
        }
      >
        {t("contractUpload.preview.downloadPdf")}
      </Button>
      <iframe
        title={name}
        src={result.url}
        style={{
          width: "100%",
          height: "min(75dvh, 900px)",
          minHeight: 400,
          border: "1px solid var(--border-subtle)",
          borderRadius: 8,
        }}
        data-testid="real-document-preview"
        onLoad={() => onReady?.(true)}
        onError={() => onReady?.(false)}
      />
    </Space>
  );
}
