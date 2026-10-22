import {
  Alert,
  Button,
  Col,
  Form,
  Input,
  Row,
  Select,
  Space,
  Tag,
  Typography,
} from "antd";
import { BaseCard, FormFooter } from "@codecash/ui";
import { Fragment, useRef, useState, type ChangeEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { formatNumber } from "@/shared/lib/format";
import { saveContractDraft } from "../api/contractDraft.api";
import type {
  ContractDraft,
  ContractFile,
  ContractFileKind,
  UploadFormOptions,
} from "../types";

const TITLE_MAX_LENGTH = 250;
const FILE_MAX_BYTES = 20 * 1024 * 1024;
const BYTES_PER_MB = 1024 * 1024;

function fileKindOf(fileName: string): ContractFileKind | null {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (extension === "pdf") return "PDF";
  if (extension === "docx") return "DOCX";
  return null;
}

interface ContractUploadFormProps {
  draft: ContractDraft;
  options: UploadFormOptions;
}

export function ContractUploadForm({
  draft,
  options,
}: ContractUploadFormProps) {
  const { t } = useTranslation("contracts");
  const { t: tc } = useTranslation("common");
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState(draft.title);
  const [type, setType] = useState(draft.type);
  const [supplierId, setSupplierId] = useState(draft.supplierId);
  const [reviewerId, setReviewerId] = useState(draft.reviewerId);
  const [templateId, setTemplateId] = useState(draft.signingTemplateId);
  const [file, setFile] = useState<ContractFile>(draft.file);
  const [appendixNames, setAppendixNames] = useState(draft.appendixNames);
  const [titleError, setTitleError] = useState(false);
  const [fileError, setFileError] = useState<"type" | "size" | null>(null);

  const fileInput = useRef<HTMLInputElement>(null);
  const appendixInput = useRef<HTMLInputElement>(null);

  const template = options.signingTemplates.find(
    (candidate) => candidate.id === templateId,
  );

  const save = useMutation({
    mutationFn: saveContractDraft,
    onSuccess: async (saved) => {
      queryClient.setQueryData(["contract-draft"], saved);
      await queryClient.invalidateQueries({ queryKey: ["contract-summaries"] });
      void navigate(`/contracts/${saved.code}/sign-positions`);
    },
  });

  function onReplaceFile(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    event.target.value = "";
    if (!chosen) return;
    const kind = fileKindOf(chosen.name);
    if (!kind) return setFileError("type");
    if (chosen.size > FILE_MAX_BYTES) return setFileError("size");
    setFileError(null);
    setFile({ name: chosen.name, sizeBytes: chosen.size, kind });
  }

  function onAddAppendix(event: ChangeEvent<HTMLInputElement>) {
    const names = Array.from(event.target.files ?? [], (chosen) => chosen.name);
    event.target.value = "";
    setAppendixNames((current) => [
      ...current,
      ...names.filter((name) => !current.includes(name)),
    ]);
  }

  function onContinue() {
    if (!title.trim()) {
      setTitleError(true);
      return;
    }
    save.mutate({
      ...draft,
      title: title.trim(),
      type,
      supplierId,
      reviewerId,
      signingTemplateId: templateId,
      file,
      appendixNames,
    });
  }

  const fileSize = formatNumber(file.sizeBytes / BYTES_PER_MB, 1);

  return (
    <BaseCard>
      <Form layout="vertical" onFinish={onContinue}>
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item
              label={t("contractUpload.form.type.label")}
              required
              extra={t(`contractUpload.form.type.options.${type}.hint`)}
            >
              <Select
                value={type}
                onChange={setType}
                options={options.types.map((value) => ({
                  value,
                  label: t(`contractUpload.form.type.options.${value}.name`),
                }))}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item label={t("contractUpload.form.code.label")}>
              <Input
                value={t("contractUpload.form.code.value", {
                  code: draft.code,
                })}
                readOnly
              />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item
          label={t("contractUpload.form.title.label")}
          htmlFor="contract-title"
          required
          validateStatus={titleError ? "error" : undefined}
          help={
            titleError
              ? t("contractUpload.form.title.errors.required")
              : undefined
          }
        >
          <Input
            id="contract-title"
            value={title}
            maxLength={TITLE_MAX_LENGTH}
            showCount
            aria-invalid={titleError}
            onChange={(event) => {
              setTitle(event.target.value);
              setTitleError(false);
            }}
          />
        </Form.Item>
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item label={t("contractUpload.form.supplier.label")} required>
              <Select
                value={supplierId}
                onChange={setSupplierId}
                options={options.suppliers.map((supplier) => ({
                  value: supplier.id,
                  label: supplier.name,
                }))}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item label={t("contractUpload.form.reviewer.label")} required>
              <Select
                value={reviewerId}
                onChange={setReviewerId}
                options={options.reviewers.map((reviewer) => ({
                  value: reviewer.id,
                  label: t("contractUpload.form.reviewer.option", {
                    role: tc(`roles.${reviewer.role}.name`),
                    organization: reviewer.organizationLabel,
                  }),
                }))}
              />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item label={t("contractUpload.form.flow.label")} required>
          <Select
            value={templateId}
            onChange={setTemplateId}
            options={options.signingTemplates.map((candidate) => ({
              value: candidate.id,
              label: t(`contractUpload.form.flow.templates.${candidate.id}`),
            }))}
          />
          <Space wrap style={{ marginTop: 12 }}>
            {template?.steps.map((step, index) => (
              <Fragment key={step.no}>
                {index > 0 ? <span aria-hidden="true">→</span> : null}
                <Tag color="blue">
                  {t("contractUpload.form.flow.stepChip", {
                    no: step.no,
                    label: t(`contractUpload.form.flow.steps.${step.kind}`),
                  })}
                </Tag>
              </Fragment>
            ))}
          </Space>
        </Form.Item>
        <Alert
          showIcon
          type="info"
          title={t("contractUpload.form.positionsNotice.title")}
          description={
            <>
              {t("contractUpload.form.positionsNotice.body")}{" "}
              <Link to={`/contracts/${draft.code}/sign-positions`}>
                {t("contractUpload.form.positionsNotice.link")}
              </Link>
            </>
          }
          style={{ marginBottom: 24 }}
        />
        <Form.Item
          label={t("contractUpload.form.file.label")}
          required
          extra={t("contractUpload.form.file.constraint")}
          validateStatus={fileError ? "error" : undefined}
          help={
            fileError
              ? t(`contractUpload.form.file.errors.${fileError}`)
              : undefined
          }
        >
          <BaseCard bodyStyle={{ padding: 16 }}>
            <Space
              wrap
              style={{ width: "100%", justifyContent: "space-between" }}
            >
              <div style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                <Tag>{file.kind}</Tag>
                <Typography.Text strong>{file.name}</Typography.Text>
                <div>
                  <Typography.Text type="secondary">
                    {file.pages === undefined
                      ? t("contractUpload.form.file.metaNoPages", {
                          size: fileSize,
                        })
                      : t("contractUpload.form.file.meta", {
                          size: fileSize,
                          pages: file.pages,
                        })}
                  </Typography.Text>
                </div>
              </div>
              <Button onClick={() => fileInput.current?.click()}>
                {t("contractUpload.form.file.replace")}
              </Button>
            </Space>
            <input
              ref={fileInput}
              type="file"
              hidden
              style={{ display: "none" }}
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={onReplaceFile}
            />
          </BaseCard>
          <Typography.Text type="secondary">
            {t("contractUpload.form.file.replaceHint")}
          </Typography.Text>
        </Form.Item>
        <Form.Item
          label={
            <>
              {t("contractUpload.form.appendix.label")}{" "}
              <Typography.Text type="secondary">
                {t("contractUpload.form.appendix.optional")}
              </Typography.Text>
            </>
          }
        >
          <Button
            block
            type="dashed"
            onClick={() => appendixInput.current?.click()}
          >
            {t("contractUpload.form.appendix.drop")}
          </Button>
          <input
            ref={appendixInput}
            type="file"
            hidden
            style={{ display: "none" }}
            multiple
            onChange={onAddAppendix}
          />
          <Space wrap style={{ marginTop: 8 }}>
            {appendixNames.map((name) => (
              <Tag
                key={name}
                closable
                onClose={() =>
                  setAppendixNames((current) =>
                    current.filter((existing) => existing !== name),
                  )
                }
              >
                {name}
              </Tag>
            ))}
          </Space>
        </Form.Item>
        {save.isError ? (
          <Alert
            type="error"
            showIcon
            title={save.error.message}
            style={{ marginBottom: 16 }}
          />
        ) : null}
        <FormFooter
          loading={save.isPending}
          submitText={t("contractUpload.form.actions.continue")}
          cancelText={t("contractUpload.form.actions.cancel")}
          onCancel={() => navigate("/contracts")}
          onSubmit={onContinue}
        />
      </Form>
    </BaseCard>
  );
}
