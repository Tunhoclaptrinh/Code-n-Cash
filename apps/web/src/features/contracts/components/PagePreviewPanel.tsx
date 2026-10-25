import { useEffect, useState } from "react";
import { SyncOutlined } from "@ant-design/icons";
import { Alert, Spin, Tabs, Tag } from "antd";
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
  const { t: tl } = useTranslation("contracts", { keyPrefix: "lite" });
  const [active, setActive] = useState("draft");
  // Last successful PDF stays on screen while a newer one is generated.
  const [result, setResult] = useState<{ key: string; file: File }>();
  const [failedKey, setFailedKey] = useState<string>();
  const [converting, setConverting] = useState(false);
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
      <div style={{ minHeight: 26, textAlign: "right" }}>
        {updating && (
          <Tag
            color="processing"
            icon={<SyncOutlined spin />}
            data-testid="draft-preview-updating"
          >
            {t("contractUpload.preview.updating")}
          </Tag>
        )}
      </div>
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
        />
      ) : failedKey !== key ? (
        <Spin>
          <div style={{ height: 220 }} />
        </Spin>
      ) : null}
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
              <DocumentPreview
                file={file}
                documentId={documentId}
                name={name}
              />
            ),
          },
        ]}
      />
    </BaseCard>
  );
}
