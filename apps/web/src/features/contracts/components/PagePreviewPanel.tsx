import { useEffect, useState } from "react";
import { Alert, Spin, Tabs } from "antd";
import { useTranslation } from "react-i18next";
import { BaseCard } from "@codecash/ui";
import { draftProblems } from "@codecash/contracts";
import { DocumentPreview } from "@/shared/ui/DocumentPreview";
import { platform } from "@/shared/api/platform";
import type { DraftInput } from "../lib/uploadDraft";

/** Unsaved form preview never replaces the document selected for upload/signing. */
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
  const [active, setActive] = useState("draft");
  const [result, setResult] = useState<{
    key: string;
    file?: File;
    failed?: boolean;
  }>();
  const language = i18n.language.startsWith("vi") ? "vi" : "en";
  const key = JSON.stringify(
    draft
      ? {
          language,
          draft: {
            ...draft,
            file: undefined,
            appendixNames: [],
            appendixDocuments: [],
          },
        }
      : null,
  );
  const valid =
    !!draft?.type &&
    !!draft.approvalPolicy &&
    !!draft.supplierId &&
    draft.signers.length > 0 &&
    draft.signers.every((s) => s.userId) &&
    !Object.keys(
      draftProblems({ ...draft, graceDays: draft.graceDays ?? Number.NaN }),
    ).length;
  useEffect(() => {
    if (file || documentId) setActive("file");
  }, [file, documentId]);
  useEffect(() => {
    if (!valid || active !== "draft") return;
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
          setResult({
            key,
            file: new File([bytes], data.fileName, { type: data.mimeType }),
          });
        })
        .catch(() => {
          if (current) setResult({ key, failed: true });
        });
    }, 1200);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [key, valid, active]);
  const working = !valid ? (
    <Alert
      type="info"
      showIcon
      title={t("contractUpload.preview.completeForm")}
    />
  ) : (
    <>
      <Alert
        type="info"
        showIcon
        title={t("contractUpload.preview.unsaved")}
        style={{ marginBottom: 12 }}
      />
      {result?.key !== key ? (
        <Spin>
          <div style={{ height: 220 }} />
        </Spin>
      ) : result.failed ? (
        <Alert
          type="warning"
          showIcon
          title={t("contractUpload.preview.unavailable")}
        />
      ) : (
        <DocumentPreview file={result.file} name={result.file?.name ?? ""} />
      )}
    </>
  );
  return (
    <BaseCard title={t("contractUpload.preview.title")}>
      <Tabs
        activeKey={active}
        onChange={setActive}
        items={[
          {
            key: "draft",
            label: t("contractUpload.preview.working"),
            children: <div data-testid="draft-live-preview">{working}</div>,
          },
          {
            key: "file",
            label: t("contractUpload.preview.selected"),
            children: (
              <>
                <Alert
                  type="info"
                  title={t("contractUpload.preview.fileBasis")}
                  style={{ marginBottom: 12 }}
                />
                <DocumentPreview
                  file={file}
                  documentId={documentId}
                  name={name}
                />
              </>
            ),
          },
        ]}
      />
    </BaseCard>
  );
}
