import { UiButton, UiInput, UiSelect } from "@/shared/ui/controls";
import { Fragment, useId, useRef, useState, type ChangeEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { formatNumber } from "@/shared/lib/format";
import { Icon } from "@/shared/ui/Icon";
import { saveContractDraft } from "../api/contractDraft.api";
import type {
  ContractDraft,
  ContractFile,
  ContractFileKind,
  UploadFormOptions,
} from "../types";
import styles from "./ContractUploadForm.module.css";

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
  const ids = useId();

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
    <section className={styles.form}>
      <h1 className={styles.title}>{t("contractUpload.title")}</h1>

      <div className={styles.pair}>
        <div>
          <label htmlFor={`${ids}-type`} className={styles.label}>
            {t("contractUpload.form.type.label")}{" "}
            <span className={styles.required}>*</span>
          </label>
          <UiSelect
            id={`${ids}-type`}
            className={styles.control}
            value={type}
            onChange={(event) => setType(event.target.value as typeof type)}
          >
            {options.types.map((value) => (
              <option key={value} value={value}>
                {t(`contractUpload.form.type.options.${value}.name`)}
              </option>
            ))}
          </UiSelect>
          <div className={styles.hint}>
            {t(`contractUpload.form.type.options.${type}.hint`)}
          </div>
        </div>
        <div>
          <label htmlFor={`${ids}-code`} className={styles.label}>
            {t("contractUpload.form.code.label")}
          </label>
          <UiInput
            id={`${ids}-code`}
            className={`${styles.control} ${styles.readOnly}`}
            value={t("contractUpload.form.code.value", { code: draft.code })}
            readOnly
          />
        </div>
      </div>

      <div>
        <label htmlFor={`${ids}-title`} className={styles.label}>
          {t("contractUpload.form.title.label")}{" "}
          <span className={styles.required}>*</span>
        </label>
        <UiInput
          id={`${ids}-title`}
          className={styles.control}
          value={title}
          maxLength={TITLE_MAX_LENGTH}
          aria-invalid={titleError}
          aria-describedby={`${ids}-title-counter`}
          onChange={(event) => {
            setTitle(event.target.value);
            setTitleError(false);
          }}
        />
        {titleError ? (
          <div className={styles.error} role="alert">
            {t("contractUpload.form.title.errors.required")}
          </div>
        ) : null}
        <div
          id={`${ids}-title-counter`}
          className={`${styles.hint} ${styles.counter}`}
        >
          {t("contractUpload.form.title.counter", {
            count: title.length,
            max: TITLE_MAX_LENGTH,
          })}
        </div>
      </div>

      <div className={styles.pair}>
        <div>
          <label htmlFor={`${ids}-supplier`} className={styles.label}>
            {t("contractUpload.form.supplier.label")}{" "}
            <span className={styles.required}>*</span>
          </label>
          <UiSelect
            id={`${ids}-supplier`}
            className={styles.control}
            value={supplierId}
            onChange={(event) => setSupplierId(event.target.value)}
          >
            {options.suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </UiSelect>
        </div>
        <div>
          <label htmlFor={`${ids}-reviewer`} className={styles.label}>
            {t("contractUpload.form.reviewer.label")}{" "}
            <span className={styles.required}>*</span>
          </label>
          <UiSelect
            id={`${ids}-reviewer`}
            className={styles.control}
            value={reviewerId}
            onChange={(event) => setReviewerId(event.target.value)}
          >
            {options.reviewers.map((reviewer) => (
              <option key={reviewer.id} value={reviewer.id}>
                {t("contractUpload.form.reviewer.option", {
                  role: tc(`roles.${reviewer.role}.name`),
                  organization: reviewer.organizationLabel,
                })}
              </option>
            ))}
          </UiSelect>
        </div>
      </div>

      <div>
        <label htmlFor={`${ids}-flow`} className={styles.label}>
          {t("contractUpload.form.flow.label")}{" "}
          <span className={styles.required}>*</span>
        </label>
        <UiSelect
          id={`${ids}-flow`}
          className={styles.control}
          value={templateId}
          onChange={(event) =>
            setTemplateId(event.target.value as typeof templateId)
          }
        >
          {options.signingTemplates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {t(`contractUpload.form.flow.templates.${candidate.id}`)}
            </option>
          ))}
        </UiSelect>
        <div className={styles.chips}>
          {template?.steps.map((step, index) => (
            <Fragment key={step.no}>
              {index > 0 ? (
                <span aria-hidden="true" className={styles.arrow}>
                  →
                </span>
              ) : null}
              <span className={styles.chip}>
                {t("contractUpload.form.flow.stepChip", {
                  no: step.no,
                  label: t(`contractUpload.form.flow.steps.${step.kind}`),
                })}
              </span>
            </Fragment>
          ))}
        </div>
      </div>

      <div className={styles.notice}>
        <span className={styles.noticeMark} aria-hidden="true">
          i
        </span>
        <div>
          <b>{t("contractUpload.form.positionsNotice.title")}</b>
          <div className={styles.noticeBody}>
            {t("contractUpload.form.positionsNotice.body")}{" "}
            <Link
              to={`/contracts/${draft.code}/sign-positions`}
              className={styles.noticeLink}
            >
              {t("contractUpload.form.positionsNotice.link")}
            </Link>
          </div>
        </div>
      </div>

      <div>
        <div className={styles.label}>
          {t("contractUpload.form.file.label")}{" "}
          <span className={styles.required}>*</span>{" "}
          <span className={styles.labelNote}>
            {t("contractUpload.form.file.constraint")}
          </span>
        </div>
        <div className={styles.file}>
          <div className={styles.fileBadge}>{file.kind}</div>
          <div className={styles.fileInfo}>
            <b>{file.name}</b>
            <div className={styles.fileMeta}>
              {file.pages === undefined
                ? t("contractUpload.form.file.metaNoPages", { size: fileSize })
                : t("contractUpload.form.file.meta", {
                    size: fileSize,
                    pages: file.pages,
                  })}
            </div>
          </div>
          <UiButton
            type="button"
            className={styles.linkButton}
            onClick={() => fileInput.current?.click()}
          >
            {t("contractUpload.form.file.replace")}
          </UiButton>
          <UiInput
            ref={fileInput}
            type="file"
            hidden
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={onReplaceFile}
          />
        </div>
        {fileError ? (
          <div className={styles.error} role="alert">
            {t(`contractUpload.form.file.errors.${fileError}`)}
          </div>
        ) : null}
        <div className={styles.replaceHint}>
          {t("contractUpload.form.file.replaceHint")}
        </div>
      </div>

      <div>
        <div className={styles.label}>
          {t("contractUpload.form.appendix.label")}{" "}
          <span className={styles.labelNote}>
            {t("contractUpload.form.appendix.optional")}
          </span>
        </div>
        <UiButton
          type="button"
          className={styles.appendixDrop}
          onClick={() => appendixInput.current?.click()}
        >
          <Icon name="upload" />
          {t("contractUpload.form.appendix.drop")}
        </UiButton>
        <UiInput
          ref={appendixInput}
          type="file"
          hidden
          multiple
          onChange={onAddAppendix}
        />
        {appendixNames.length > 0 ? (
          <ul className={styles.appendixList}>
            {appendixNames.map((name) => (
              <li key={name}>
                <span>{name}</span>
                <UiButton
                  type="button"
                  className={styles.linkButton}
                  aria-label={t("contractUpload.form.appendix.remove", {
                    name,
                  })}
                  onClick={() =>
                    setAppendixNames((current) =>
                      current.filter((existing) => existing !== name),
                    )
                  }
                >
                  ×
                </UiButton>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className={styles.actions}>
        <Link to="/contracts" className={styles.cancel}>
          {t("contractUpload.form.actions.cancel")}
        </Link>
        <UiButton
          type="button"
          className={styles.continue}
          onClick={onContinue}
          disabled={save.isPending}
        >
          {t("contractUpload.form.actions.continue")}
        </UiButton>
      </div>
    </section>
  );
}
