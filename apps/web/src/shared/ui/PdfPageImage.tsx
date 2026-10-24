import { useEffect, useState } from "react";
import { Alert, Spin } from "antd";
import { useTranslation } from "react-i18next";
import { platform } from "../api/platform";

/** Authenticated raster of the actual PDF page, rendered at exactly its stored aspect ratio. */
export function PdfPageImage({
  contractId,
  documentId,
  page,
  onReady,
}: {
  contractId: string;
  documentId: string;
  page: number;
  onReady?: (ready: boolean) => void;
}) {
  const { t } = useTranslation("signing");
  const [url, setUrl] = useState<string>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true,
      objectUrl: string | undefined;
    setUrl(undefined);
    setFailed(false);
    onReady?.(false);
    void platform
      .download(
        `/contract-files/${encodeURIComponent(contractId)}/${encodeURIComponent(documentId)}/pages/${page}/image`,
      )
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [contractId, documentId, page, onReady]);
  if (failed)
    return (
      <Alert
        type="error"
        showIcon
        title={t("positions.pdfError")}
        style={{ position: "absolute", inset: 16, zIndex: 3 }}
      />
    );
  if (!url)
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          background: "white",
          zIndex: 3,
        }}
      >
        <Spin />
      </div>
    );
  return (
    <img
      data-testid="real-pdf-page"
      src={url}
      alt={t("positions.pdfPage", { page })}
      draggable={false}
      onLoad={() => onReady?.(true)}
      onError={() => {
        setFailed(true);
        onReady?.(false);
      }}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        userSelect: "none",
      }}
    />
  );
}
