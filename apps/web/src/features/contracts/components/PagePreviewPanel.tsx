import { useCallback, useEffect, useState } from "react";
import { DownloadOutlined, SyncOutlined } from "@ant-design/icons";
import { Alert, Button, Spin, Tabs, Tooltip } from "antd";
import { useTranslation } from "react-i18next";
import { downloadBlob } from "@codecash/ui";
import { Section } from "@/shared/ui/Section";
import { draftProblems } from "@codecash/contracts";
import { DocumentPreview } from "@/shared/ui/DocumentPreview";
import { platform } from "@/shared/api/platform";
import type { DraftInput } from "../lib/uploadDraft";
import styles from "./PagePreviewPanel.module.css";

/**
 * The document beside the upload form: the contract being drafted (regenerated as the form
 * changes) or the file chosen for signing. Unsaved form content never replaces the chosen file.
 * The tabs are the header; the PDF download sits at their right, next to the viewer's own tools.
 */
export function PagePreviewPanel({
  draft,
  file,
  documentId,
  name,
}: {
  draft?: DraftInput;
  file?: File;
  documentId?: string;
  name: string;
}) {
  const { t, i18n } = useTranslation("contracts");
  const { t: tl } = useTranslation("contracts", { keyPrefix: "lite" });
  const [active, setActive] = useState("draft");
  // Last successful PDF stays on screen while a newer one is generated.
  const [result, setResult] = useState<{ key: string; file: File }>();
  const [failedKey, setFailedKey] = useState<string>();
  const [converting, setConverting] = useState(false);
  // The PDF each tab shows, for the download button in the tab bar.
  const [pdfs, setPdfs] = useState<{ draft?: Blob; file?: Blob }>({});
  const onDraftPdf = useCallback(
    (pdf?: Blob) => setPdfs((p) => ({ ...p, draft: pdf })),
    [],
  );
  const onFilePdf = useCallback(
    (pdf?: Blob) => setPdfs((p) => ({ ...p, file: pdf })),
    [],
  );
  const language = i18n.language.startsWith("vi") ? "vi" : "en";
  const complete =
    !!draft?.type &&
    !!draft.approvalPolicy &&
    !!draft.supplierId &&
    draft.signers.length > 0 &&
    draft.signers.every((s) => s.userId) &&
    !Object.keys(
      draftProblems({ ...draft, graceDays: draft.graceDays ?? Number.NaN }),
    ).length;
  const key = JSON.stringify(
    draft
      ? {
          language,
          // The API fills unfinished fields with placeholders only when asked to.
          ...(complete ? {} : { partial: true }),
          draft: {
            ...draft,
            file: undefined,
            appendixNames: [],
            appendixDocuments: [],
            signers: complete
              ? draft.signers
              : draft.signers.filter((s) => s.userId),
          },
        }
      : null,
  );
  useEffect(() => {
    if (file || documentId) setActive("file");
  }, [file, documentId]);
  const hasDraft = !!draft;
  useEffect(() => {
    if (!hasDraft || active !== "draft") return;
    let current = true;
    const timer = setTimeout(() => {
      const input = JSON.parse(key);
      void platform
        .post<{ fileName: string; mimeType: string; base64: string }>(
          "/contract-samples",
          input,
        )
        .then((data) => {
          if (!current) return;
          const bytes = Uint8Array.from(atob(data.base64), (c) =>
            c.charCodeAt(0),
          );
          setFailedKey(undefined);
          setConverting(true);
          setResult({
            key,
            file: new File([bytes], data.fileName, { type: data.mimeType }),
          });
        })
        .catch(() => {
          if (current) setFailedKey(key);
        });
    }, 800);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [key, active, hasDraft]);
  const updating =
    !!draft && failedKey !== key && (result?.key !== key || converting);
  const working = !draft ? (
    <Spin>
      <div style={{ height: 220 }} />
    </Spin>
  ) : (
    <>
      {failedKey === key && (
        <Alert
          type="warning"
          showIcon
          title={tl("previewFailed")}
          style={{ marginBottom: 8 }}
        />
      )}
      {result ? (
        <DocumentPreview
          file={result.file}
          name={result.file.name}
          keepPrevious
          onLoadingChange={setConverting}
          showDownload={false}
          onDocumentChange={onDraftPdf}
        />
      ) : failedKey !== key ? (
        <Spin>
          <div style={{ height: 220 }} />
        </Spin>
      ) : null}
    </>
  );
  const pdf = active === "draft" ? pdfs.draft : pdfs.file;
  const pdfName =
    (active === "draft" ? result?.file.name : name)?.replace(/\.[^.]+$/, "") ||
    "contract";
  return (
    <Section
      framed
      style={{ background: "var(--bg-surface-alt)" }}
      bodyStyle={{ padding: "4px 16px 16px" }}
    >
      <Tabs
        className={styles.tabs}
        activeKey={active}
        onChange={setActive}
        tabBarExtraContent={
          pdf ? (
            <Tooltip title={t("contractUpload.preview.downloadPdf")}>
              <Button
                type="text"
                icon={<DownloadOutlined />}
                aria-label={t("contractUpload.preview.downloadPdf")}
                onClick={() => downloadBlob(pdf, `${pdfName}.pdf`)}
                data-testid="preview-download"
              />
            </Tooltip>
          ) : null
        }
        items={[
          {
            key: "draft",
            label: (
              <span className={styles.tabLabel}>
                {t("contractUpload.preview.working")}
                {updating ? (
                  <Tooltip title={t("contractUpload.preview.updating")}>
                    <SyncOutlined
                      spin
                      className={styles.updating}
                      aria-label={t("contractUpload.preview.updating")}
                      data-testid="draft-preview-updating"
                    />
                  </Tooltip>
                ) : null}
              </span>
            ),
            children: <div data-testid="draft-live-preview">{working}</div>,
          },
          {
            key: "file",
            label: t("contractUpload.preview.selected"),
            children: (
              <DocumentPreview
                file={file}
                documentId={documentId}
                name={name}
                showDownload={false}
                onDocumentChange={onFilePdf}
              />
            ),
          },
        ]}
      />
    </Section>
  );
}
