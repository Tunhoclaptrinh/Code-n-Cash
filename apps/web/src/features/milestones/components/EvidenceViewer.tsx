import { useState } from "react";
import { Alert, Button, Descriptions, Drawer, Space, Tag } from "antd";
import { EyeOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import type { EventRow, InvoiceData } from "@codecash/contracts";
import { DocumentPreview } from "@/shared/ui/DocumentPreview";
import {
  formatDate,
  formatDateTime,
  formatDecimalString,
  sumDecimalStrings,
} from "@/shared/lib/format";
import { actorName } from "@/shared/lib/domain";
import { TechnicalDetails } from "@/shared/ui/TechnicalInfo";

/** An invoice's data next to what the contract expects of it. */
export function InvoiceCard({
  invoice,
  plannedMillion,
}: {
  invoice: InvoiceData;
  plannedMillion: string;
}) {
  const { t } = useTranslation("milestones");
  const matches =
    sumDecimalStrings([invoice.amountMillion]) ===
    sumDecimalStrings([plannedMillion]);
  return (
    <Descriptions
      size="small"
      column={1}
      bordered
      data-testid="invoice-card"
      items={[
        {
          key: "ref",
          label: t("invoice.fields.reference"),
          children: `${invoice.symbol} · ${invoice.number}`,
        },
        {
          key: "date",
          label: t("invoice.fields.issueDate"),
          children: formatDate(invoice.issueDate),
        },
        {
          key: "seller",
          label: t("invoice.fields.sellerTaxCode"),
          children: invoice.sellerTaxCode,
        },
        {
          key: "amount",
          label: t("invoice.fields.amountMillion"),
          children: (
            <Space size={8} wrap>
              <b>{formatDecimalString(invoice.amountMillion)}</b>
              <Tag color={matches ? "success" : "error"} style={{ margin: 0 }}>
                {t(matches ? "invoice.matches" : "invoice.mismatch", {
                  planned: formatDecimalString(plannedMillion),
                })}
              </Tag>
            </Space>
          ),
        },
      ]}
    />
  );
}

/**
 * Opens the document behind an event: the stored file itself (PDF or image, re-hashed by the API),
 * the invoice's data when it is an invoice, and who signed the submission. Imported Data Pack events
 * carry only a document reference, which is said plainly.
 */
export function EvidenceViewerButton({
  event,
  plannedMillion,
}: {
  event: EventRow;
  plannedMillion: string;
}) {
  const { t } = useTranslation("milestones");
  const { t: td } = useTranslation("domain");
  const [open, setOpen] = useState(false);
  const document = event.document;
  return (
    <>
      <Button
        size="small"
        icon={<EyeOutlined />}
        onClick={() => setOpen(true)}
        data-testid="evidence-view"
      >
        {t("evidenceViewer.open")}
      </Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        size="large"
        title={td(`eventType.${event.type}`)}
        destroyOnHidden
      >
        <Space orientation="vertical" size={16} style={{ width: "100%" }}>
          <span>
            {t("approve.documents.recorded", {
              by: event.recordedBy ?? actorName(td, event.actor),
              at: formatDateTime(event.at),
            })}
          </span>
          {event.invoice ? (
            <InvoiceCard
              invoice={event.invoice}
              plannedMillion={plannedMillion}
            />
          ) : null}
          {document ? (
            <>
              <Alert
                type={
                  document.signatureValid && document.stored
                    ? "success"
                    : "error"
                }
                showIcon
                title={t(
                  document.signatureValid && document.stored
                    ? "evidenceViewer.intact"
                    : "evidenceViewer.broken",
                  {
                    name: document.signedBy,
                    at: formatDateTime(document.signedAt),
                  },
                )}
              />
              {document.stored ? (
                <DocumentPreview
                  name={document.fileName}
                  previewPath={`/evidence-documents/${encodeURIComponent(event.id)}/download`}
                />
              ) : null}
            </>
          ) : (
            <Alert
              type="info"
              showIcon
              title={t(`evidenceViewer.noFile.${event.origin}`, {
                defaultValue: t("evidenceViewer.noFile.APP"),
              })}
              description={t("evidenceViewer.noFileHint", {
                fileName: event.fileName ?? event.documentId,
              })}
            />
          )}
          <TechnicalDetails
            items={[
              {
                key: "event",
                label: t("evidenceViewer.event"),
                value: event.id,
              },
              {
                key: "document",
                label: t("evidenceViewer.documentId"),
                value: event.documentId,
              },
              { key: "sha", label: "SHA-256", value: document?.sha256 },
            ]}
          />
        </Space>
      </Drawer>
    </>
  );
}
