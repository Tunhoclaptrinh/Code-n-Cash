import { useRef } from "react";
import {
  Alert,
  Button,
  Divider,
  Form,
  Input,
  Space,
  Tag,
  Typography,
} from "antd";
import {
  DownloadOutlined,
  FileAddOutlined,
  PaperClipOutlined,
} from "@ant-design/icons";
import { downloadBlob } from "@codecash/ui";
import { useTranslation } from "react-i18next";
import { formatNumber } from "@/shared/lib/format";
import type { ContractUploadFormState } from "../hooks/useContractUploadForm";
import { BYTES_PER_MB } from "../lib/uploadDraft";
import { HelpLabel } from "./HelpLabel";
import styles from "./ContractUploadForm.module.css";

/** Contract text, sample generation, main file and appendices. */
export function UploadDocumentSection({
  form,
}: {
  form: ContractUploadFormState;
}) {
  const { t } = useTranslation("contracts");
  const { t: tl } = useTranslation("contracts", { keyPrefix: "lite" });
  const { t: td } = useTranslation("domain");
  const {
    value,
    set,
    problem,
    problems,
    touched,
    fileError,
    appendixError,
    documentStale,
    pendingFile,
    save,
    sample,
    onReplaceFile,
    onAddAppendix,
    removeAppendix,
  } = form;
  const fileInput = useRef<HTMLInputElement>(null);
  const appendixInput = useRef<HTMLInputElement>(null);
  const fileSize = t(
    value.file.sizeBytes < BYTES_PER_MB
      ? "contractUpload.form.file.sizeKb"
      : "contractUpload.form.file.sizeMb",
    {
      size: formatNumber(
        value.file.sizeBytes /
          (value.file.sizeBytes < BYTES_PER_MB ? 1024 : BYTES_PER_MB),
        1,
      ),
    },
  );
  return (
    <div data-testid="contract-document-section">
      <Divider className={styles.divider} titlePlacement="start">
        {t("contractUpload.sections.document")}
      </Divider>
      {documentStale ? (
        <Alert
          type="warning"
          showIcon
          data-testid="contract-document-stale"
          title={tl("stale")}
          style={{ marginBottom: 16 }}
        />
      ) : null}
      <Form.Item
        label={
          <HelpLabel
            label={t("contractUpload.templates.body")}
            hint={t("contractUpload.templates.bodyHint")}
          />
        }
      >
        <Input.TextArea
          data-testid="contract-document-body"
          autoSize={{ minRows: 3, maxRows: 8 }}
          maxLength={20000}
          value={value.documentBody ?? ""}
          onChange={(event) => set("documentBody", event.target.value)}
        />
        <div className={styles.bodyFooter}>
          <Typography.Text type="secondary">
            {(value.documentBody ?? "").length}/20000
          </Typography.Text>
        </div>
      </Form.Item>
      <Space wrap className={styles.documentActions}>
        <Button
          icon={<FileAddOutlined />}
          loading={sample.isPending}
          disabled={
            !!problem || Object.keys(problems).length > 0 || save.isPending
          }
          onClick={() => sample.mutate()}
          data-testid="generate-contract-sample"
        >
          {t("contractUpload.sample.generate")}
        </Button>
        <Button
          icon={<DownloadOutlined />}
          disabled={!pendingFile.current}
          onClick={() => {
            if (pendingFile.current)
              downloadBlob(pendingFile.current, pendingFile.current.name);
          }}
        >
          {t("contractUpload.sample.download")}
        </Button>
      </Space>
      {sample.isError ? (
        <Alert
          type="error"
          showIcon
          title={td(
            `errors.${(sample.error as { code?: string }).code ?? "UNKNOWN"}`,
            { defaultValue: td("errors.UNKNOWN") },
          )}
          style={{ marginBottom: 16 }}
        />
      ) : null}
      <Form.Item
        label={
          <HelpLabel
            label={t("contractUpload.form.file.label")}
            hint={t("contractUpload.form.file.replaceHint")}
          />
        }
        required
        validateStatus={
          fileError || (touched && !value.file.name) ? "error" : undefined
        }
        help={
          fileError
            ? t(`contractUpload.form.file.errors.${fileError}`)
            : touched && !value.file.name
              ? t("contractUpload.form.file.errors.required")
              : undefined
        }
      >
        <div className={styles.fileCard}>
          <div className={styles.fileInfo}>
            {value.file.name ? (
              <>
                <Tag>{value.file.kind}</Tag>
                <Typography.Text
                  strong
                  ellipsis={{ tooltip: value.file.name }}
                  className={styles.fileName}
                >
                  {value.file.name}
                </Typography.Text>
                <div>
                  <Typography.Text type="secondary">
                    {value.file.pages === undefined
                      ? t("contractUpload.form.file.metaNoPages", {
                          size: fileSize,
                        })
                      : t("contractUpload.form.file.meta", {
                          size: fileSize,
                          pages: value.file.pages,
                        })}
                  </Typography.Text>
                </div>
              </>
            ) : (
              <Typography.Text type="secondary">
                {tl("fileEmpty")}
              </Typography.Text>
            )}
          </div>
          <Button
            icon={<PaperClipOutlined />}
            onClick={() => fileInput.current?.click()}
            data-testid="contract-file-choose"
          >
            {value.file.name
              ? t("contractUpload.form.file.replace")
              : t("contractUpload.form.file.choose")}
          </Button>
          <input
            ref={fileInput}
            type="file"
            hidden
            style={{ display: "none" }}
            data-testid="contract-file-input"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={onReplaceFile}
          />
        </div>
      </Form.Item>
      <Form.Item
        label={
          <Space size={6}>
            {t("contractUpload.form.appendix.label")}
            <Typography.Text type="secondary">
              ({t("contractUpload.form.appendix.optional")})
            </Typography.Text>
          </Space>
        }
      >
        <Button
          size="small"
          icon={<PaperClipOutlined />}
          onClick={() => appendixInput.current?.click()}
        >
          {t("contractUpload.form.appendix.add")}
        </Button>
        <input
          ref={appendixInput}
          type="file"
          hidden
          style={{ display: "none" }}
          multiple
          accept=".pdf,.docx"
          onChange={onAddAppendix}
        />
        {appendixError ? (
          <Alert
            type="error"
            title={t("contractUpload.form.appendix.invalid")}
          />
        ) : null}
        {value.appendixNames.length ? (
          <Space wrap style={{ marginTop: 8 }}>
            {value.appendixNames.map((name) => (
              <Tag key={name} closable onClose={() => removeAppendix(name)}>
                {name}
              </Tag>
            ))}
          </Space>
        ) : null}
      </Form.Item>
    </div>
  );
}
