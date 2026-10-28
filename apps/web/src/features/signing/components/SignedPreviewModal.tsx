import { useEffect, useRef, useState, type ReactNode } from "react";
import { Alert, Modal } from "antd";
import { useTranslation } from "react-i18next";
import { SignedMark } from "@/shared/ui/DemoSignatureMarks";
import { PdfPageImage } from "@/shared/ui/PdfPageImage";
import { PAGE_WIDTH, pageHeightOf, type Boxes } from "../lib/signature-layout";
import type { SigningConfig } from "../types";
import { DraftPageContent } from "./DraftPageContent";

interface SignedPreviewModalProps {
  contractId: string;
  config: SigningConfig;
  boxes: Boxes;
  open: boolean;
  saving: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The document as it will look once signed: every page that holds a signing box, with a demo
 * signature and the signer's organisation seal in each configured box. Nothing is saved until the
 * user confirms.
 */
export function SignedPreviewModal({
  contractId,
  config,
  boxes,
  open,
  saving,
  onConfirm,
  onCancel,
}: SignedPreviewModalProps) {
  const { t } = useTranslation("signing");
  const { t: tc } = useTranslation("common");
  const pages = [
    ...new Set(config.steps.flatMap((step) => boxes[step.stepNo]?.page ?? [])),
  ].sort((a, b) => a - b);

  return (
    <Modal
      open={open}
      title={t("positions.preview.title")}
      width={760}
      okText={t("positions.preview.confirm")}
      cancelText={t("positions.preview.back")}
      okButtonProps={{
        loading: saving,
        "data-testid": "positions-preview-confirm",
      }}
      onOk={onConfirm}
      onCancel={onCancel}
      destroyOnHidden
    >
      <Alert
        type="info"
        showIcon
        title={t("positions.preview.hint")}
        style={{ marginBottom: 12 }}
      />
      <div
        data-testid="signed-preview"
        style={{
          display: "grid",
          gap: 12,
          maxHeight: "65vh",
          overflowY: "auto",
          padding: 4,
        }}
      >
        {pages.map((page) => (
          <ScaledPage
            key={page}
            height={pageHeightOf(config.previewPages, page)}
          >
            {config.documentId ? (
              <PdfPageImage
                contractId={contractId}
                documentId={config.documentId}
                page={page}
              />
            ) : (
              <DraftPageContent config={config} page={page} />
            )}
            {config.steps.map((step) => {
              const box = boxes[step.stepNo];
              return box?.page === page ? (
                <SignedMark
                  key={step.stepNo}
                  box={box}
                  pageWidth={PAGE_WIDTH}
                  pageHeight={pageHeightOf(config.previewPages, page)}
                  name={step.signerName}
                  caption={step.signerTitle}
                  organization={step.organizationName}
                  sealLabel={tc("contractPane.seal")}
                />
              ) : null;
            })}
          </ScaledPage>
        ))}
      </div>
    </Modal>
  );
}

/** A page laid out in 520 page units, scaled to the width the modal gives it. */
function ScaledPage({
  height,
  children,
}: {
  height: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) =>
      setScale(entry.contentRect.width / PAGE_WIDTH),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      style={{
        position: "relative",
        height: height * scale,
        background: "white",
        border: "1px solid var(--border-subtle)",
        borderRadius: 4,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: PAGE_WIDTH,
          height,
          transform: `scale(${scale})`,
          transformOrigin: "0 0",
        }}
      >
        {children}
      </div>
    </div>
  );
}
