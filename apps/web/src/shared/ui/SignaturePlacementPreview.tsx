import { useState } from "react";
import { Alert, Button, Modal } from "antd";
import { EyeOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import type { SigningConfig } from "@codecash/contracts";
import { PdfPageImage } from "./PdfPageImage";

/** The signer can inspect the precise page and rectangle they are about to consent to. */
export function SignaturePlacementPreview({
  config,
  stepNo,
}: {
  config: SigningConfig;
  stepNo: number;
}) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation("signing");
  const slot = config.slots[stepNo];
  const page = config.previewPages.find((p) => p.pageNo === slot?.page);
  const person = config.steps.find((s) => s.stepNo === stepNo);
  if (!config.documentId || !slot || !page) return null;
  const height = page.height ?? 620;
  return (
    <>
      <Button
        icon={<EyeOutlined />}
        onClick={() => setOpen(true)}
        data-testid="review-signature-placement"
      >
        {t("positions.reviewPlacement", { page: slot.page })}
      </Button>
      <Modal
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        width={720}
        style={{ top: 24 }}
        styles={{
          body: { maxHeight: "calc(100dvh - 140px)", overflowY: "auto" },
        }}
        title={t("positions.reviewTitle")}
        destroyOnHidden
      >
        <Alert
          type="info"
          showIcon
          title={t("positions.reviewNotice")}
          style={{ marginBottom: 12 }}
        />
        <div
          style={{
            position: "relative",
            width: "100%",
            maxWidth: `calc(66dvh * 520 / ${height})`,
            margin: "0 auto",
            aspectRatio: `520 / ${height}`,
            background: "white",
          }}
        >
          <PdfPageImage
            contractId={config.contractCode}
            documentId={config.documentId}
            page={slot.page}
          />
          <div
            data-testid="consent-signature-slot"
            style={{
              position: "absolute",
              left: `${(slot.x / 520) * 100}%`,
              top: `${(slot.y / height) * 100}%`,
              width: `${(slot.w / 520) * 100}%`,
              height: `${(slot.h / height) * 100}%`,
              border: "2px solid #315bea",
              borderRadius: 4,
              background: "rgba(49,91,234,.1)",
              display: "grid",
              placeItems: "center",
              color: "#13266d",
              fontSize: 12,
            }}
          >
            {person?.signerName}
          </div>
        </div>
      </Modal>
    </>
  );
}
