import { DemoFillButton, emptyInputPatch } from "@/shared/ui/DemoFillButton";
import {
  Alert,
  Button,
  Col,
  Divider,
  Dropdown,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  PlusOutlined,
  DownloadOutlined,
  FileAddOutlined,
  InfoCircleOutlined,
  MoreOutlined,
  PaperClipOutlined,
} from "@ant-design/icons";
import { BaseCard, FormFooter, downloadBlob } from "@codecash/ui";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import type { ApprovalPolicy, ContractType, Side } from "@codecash/contracts";
import { draftProblems } from "@codecash/contracts";
import { ApiError } from "@/shared/api/client";
import { platform } from "@/shared/api/platform";
import { getContractDraft, saveContractDraft } from "@/shared/api/domain";
import { formatNumber } from "@/shared/lib/format";
import { OriginTag } from "@/shared/ui/DomainTags";
import type {
  ContractDraft,
  ContractFile,
  ContractFileKind,
  DraftSigner,
  UploadFormOptions,
} from "../types";
import styles from "./ContractUploadForm.module.css";

const contentKey = (draft: DraftInput) =>
  JSON.stringify([
    draft.title,
    draft.type,
    draft.supplierId,
    draft.valueMillion,
    draft.startDate,
    draft.endDate,
    draft.approvalPolicy,
    draft.graceDays,
    draft.penaltyRatePct,
    draft.maxPenaltyPct,
    draft.signers,
    draft.documentBody,
  ]);
const TITLE_MAX_LENGTH = 250;
const FILE_MAX_BYTES = 20 * 1024 * 1024;
const BYTES_PER_MB = 1024 * 1024;
const MAX_SIGNERS = 4;

function fileKindOf(fileName: string): ContractFileKind | null {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (extension === "pdf") return "PDF";
  if (extension === "docx") return "DOCX";
  return null;
}

/** Client-side check of the signing order; the API validates the same rules again. */
function signerProblem(signers: DraftSigner[]): string | null {
  if (signers.length < 1 || signers.length > MAX_SIGNERS) return "count";
  if (signers.some((s) => !s.userId)) return "missing";
  if (new Set(signers.map((s) => s.userId)).size !== signers.length)
    return "duplicate";
  if (
    signers.length > 1 &&
    (!signers.some((s) => s.party === "BUYER") ||
      !signers.some((s) => s.party === "SUPPLIER"))
  )
    return "bothSides";
  return null;
}

type DraftInput = Omit<
  ContractDraft,
  "type" | "approvalPolicy" | "graceDays"
> & {
  type?: ContractType;
  approvalPolicy?: ApprovalPolicy;
  graceDays?: number;
};
const emptyDraft = (draft: ContractDraft): DraftInput => ({
  ...draft,
  title: "",
  type: undefined,
  supplierId: "",
  reviewerId: "",
  valueMillion: "",
  startDate: "",
  endDate: "",
  approvalPolicy: undefined,
  graceDays: undefined,
  penaltyRatePct: "",
  maxPenaltyPct: "",
  signers: [],
  documentBody: "",
  templateId: undefined,
  templateVersion: undefined,
  templateSnapshot: undefined,
  file: { name: "", sizeBytes: 0, kind: "PDF" },
  appendixNames: [],
  appendixDocuments: [],
});

interface ContractUploadFormProps {
  draft: ContractDraft;
  startBlank?: boolean;
  options: UploadFormOptions;
  onPreviewFileChange?: (file: File) => void;
  onDraftChange?: (
    draft: Pick<ContractDraft, "code" | "file" | "signers">,
  ) => void;
}

/**
 * Step 1 of the upload wizard: terms the Data Pack also records (type, value, dates, approval
 * policy, penalty) and the signing order — how many people sign, from which side, in which order.
 */
export function ContractUploadForm({
  draft,
  startBlank = false,
  options,
  onDraftChange,
  onPreviewFileChange,
}: ContractUploadFormProps) {
  const { t, i18n } = useTranslation("contracts");
  const { t: tc } = useTranslation("common");
  const { t: td } = useTranslation("domain");
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [value, setValue] = useState<DraftInput>(() =>
    startBlank ? emptyDraft(draft) : draft,
  );
  useEffect(() => {
    onDraftChange?.(value);
  }, [value, onDraftChange]);
  const [titleError, setTitleError] = useState(false);
  const [fileError, setFileError] = useState<"type" | "size" | null>(null);
  const [touched, setTouched] = useState(false);
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const fileInput = useRef<HTMLInputElement>(null);
  const appendixInput = useRef<HTMLInputElement>(null);
  const pendingFile = useRef<File | null>(null);
  const pendingAppendices = useRef<File[]>([]);
  const [appendixError, setAppendixError] = useState(false);
  const generatedContent = useRef<string | null>(null);
  const documentStale =
    generatedContent.current !== null &&
    generatedContent.current !== contentKey(value);
  const set = <K extends keyof DraftInput>(key: K, next: DraftInput[K]) => {
    setDirty((current) => ({ ...current, [key]: true }));
    setValue((current) => ({ ...current, [key]: next }));
  };
  const problems = draftProblems({
    ...value,
    graceDays: value.graceDays ?? Number.NaN,
  });
  if (!value.type) problems.type = "INVALID_TYPE";
  if (!value.approvalPolicy) problems.approvalPolicy = "INVALID_POLICY";
  if (!value.supplierId) problems.supplierId = "INVALID_SUPPLIER";
  if (!value.reviewerId) problems.reviewerId = "INVALID_REVIEWER";
  const feedback = (key: string) => ({
    validateStatus:
      (touched || dirty[key]) && problems[key] ? ("error" as const) : undefined,
    help:
      (touched || dirty[key]) && problems[key]
        ? td(`errors.${problems[key]}`)
        : undefined,
  });
  const placeholder = (key: string) =>
    t(`contractUpload.form.placeholders.${key}`);
  const setSigners = (signers: DraftSigner[]) => {
    set("signers", signers);
  };

  const supplierPeople = options.supplierSigners[value.supplierId] ?? [];
  const peopleFor = (party: Side) =>
    party === "BUYER" ? options.buyerSigners : supplierPeople;
  const problem = signerProblem(value.signers);

  const save = useMutation({
    mutationFn: async (input: ContractDraft) => {
      const saved = await saveContractDraft(input);
      if (pendingFile.current) {
        const upload = new FormData();
        upload.append("file", pendingFile.current);
        await platform.request(`/documents/${encodeURIComponent(saved.code)}`, {
          method: "POST",
          body: upload,
        });
        pendingFile.current = null;
        window.dispatchEvent(new Event("codecash:workflow-changed"));
      }
      for (const file of pendingAppendices.current) {
        const upload = new FormData();
        upload.append("file", file);
        await platform.request(
          `/documents/${encodeURIComponent(saved.code)}/appendices`,
          { method: "POST", body: upload },
        );
      }
      pendingAppendices.current = [];
      return getContractDraft(saved.code);
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ["contract-draft"] });
      await queryClient.invalidateQueries({ queryKey: ["contract-summaries"] });
      void navigate(`/contracts/${saved.code}/sign-positions`);
    },
  });

  const sample = useMutation({
    mutationFn: async () => {
      const input = validatedDraft();
      if (!input) throw new Error(tc("demoFill.completeFirst"));
      const result = await platform.post<{
        fileName: string;
        mimeType: string;
        pages?: number;
        base64: string;
      }>("/contract-samples", {
        draft: input,
        language: i18n.language.startsWith("vi") ? "vi" : "en",
      });
      const bytes = Uint8Array.from(atob(result.base64), (char) =>
        char.charCodeAt(0),
      );
      const file = new File([bytes], result.fileName, {
        type: result.mimeType,
      });
      return { input, file, pages: result.pages };
    },
    onSuccess: ({ input, file, pages }) => {
      generatedContent.current = contentKey(input);
      pendingFile.current = file;
      onPreviewFileChange?.(file);
      setFileError(null);
      setTitleError(false);
      setValue(() => ({
        ...input,
        title: input.title,
        file: { name: file.name, sizeBytes: file.size, kind: "DOCX", pages },
      }));
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
    generatedContent.current = null;
    pendingFile.current = chosen;
    onPreviewFileChange?.(chosen);
    set("file", {
      name: chosen.name,
      sizeBytes: chosen.size,
      kind,
    } satisfies ContractFile);
  }

  function onAddAppendix(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (
      files.some(
        (file) =>
          !fileKindOf(file.name) ||
          file.size === 0 ||
          file.size > FILE_MAX_BYTES,
      ) ||
      value.appendixNames.length + files.length > 20
    ) {
      setAppendixError(true);
      return;
    }
    setAppendixError(false);
    const additions = files.filter(
      (file, index) =>
        !value.appendixNames.includes(file.name) &&
        files.findIndex((other) => other.name === file.name) === index,
    );
    pendingAppendices.current.push(...additions);
    set("appendixNames", [
      ...value.appendixNames,
      ...additions.map((file) => file.name),
    ]);
  }

  function applyPreset(id: string) {
    const preset = options.presets.find((p) => p.id === id);
    if (!preset) return;
    const used = new Set<string>();
    const signers = preset.signers.map((signer) => {
      const person =
        signer.party === "SUPPLIER"
          ? supplierPeople.find((person) => !used.has(person.userId))
          : options.buyerSigners.find(
              (person) =>
                person.userId === signer.userId && !used.has(person.userId),
            );
      if (person) used.add(person.userId);
      return { ...signer, userId: person?.userId ?? "" };
    });
    setValue((current) => ({
      ...current,
      ...preset.defaults,
      templateId: preset.id,
      templateVersion: preset.version,
      templateSnapshot: undefined,
      signers,
    }));
  }

  function move(index: number, by: -1 | 1) {
    const next = [...value.signers];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item);
    setSigners(next);
  }

  function changeSupplier(supplierId: string) {
    const allowed = options.supplierSigners[supplierId] ?? [];
    setValue((current) => ({
      ...current,
      supplierId,
      signers: current.signers.map((s) =>
        s.party === "SUPPLIER" &&
        !allowed.some((person) => person.userId === s.userId)
          ? { ...s, userId: "" }
          : s,
      ),
    }));
  }

  function validatedDraft(): ContractDraft | undefined {
    if (
      Object.keys(problems).length ||
      signerProblem(value.signers) ||
      !value.type ||
      !value.approvalPolicy ||
      value.graceDays === undefined
    )
      return;
    return {
      ...value,
      type: value.type,
      approvalPolicy: value.approvalPolicy,
      graceDays: value.graceDays,
      title: value.title.trim(),
    };
  }
  function sampleValues(): Partial<DraftInput> {
    const supplier =
      options.suppliers.find((supplier) => supplier.id === value.supplierId) ??
      options.suppliers.find(
        (supplier) =>
          supplier.id === "S015" &&
          options.supplierSigners[supplier.id]?.length,
      ) ??
      options.suppliers.find(
        (supplier) => options.supplierSigners[supplier.id]?.length,
      );
    const owner =
      options.buyerSigners.find((person) => person.role === "CONTRACT_OWNER") ??
      options.buyerSigners[0];
    const representative =
      supplier && options.supplierSigners[supplier.id]?.[0];
    return {
      title: t("contractUpload.demo.title"),
      type: "GOODS_SUPPLY",
      supplierId: supplier?.id,
      reviewerId: options.reviewers[0]?.userId,
      valueMillion: "1000.00",
      startDate: draft.startDate,
      endDate: draft.endDate,
      approvalPolicy: "SINGLE_BUYER_APPROVAL",
      graceDays: 5,
      penaltyRatePct: "0.10",
      maxPenaltyPct: "8.00",
      documentBody: t("contractUpload.demo.body"),
      signers: [
        ...(owner ? [{ party: "BUYER" as const, userId: owner.userId }] : []),
        ...(representative
          ? [{ party: "SUPPLIER" as const, userId: representative.userId }]
          : []),
      ],
    };
  }
  function fillAll() {
    const proposed = sampleValues();
    setValue((current) => {
      const next = { ...current, ...emptyInputPatch(current, proposed) };
      const used = new Set(
        next.signers.map((signer) => signer.userId).filter(Boolean),
      );
      return {
        ...next,
        signers: next.signers.map((signer) => {
          if (signer.userId) return signer;
          const people =
            signer.party === "BUYER"
              ? options.buyerSigners
              : (options.supplierSigners[next.supplierId] ?? []);
          const person = people.find((person) => !used.has(person.userId));
          if (person) used.add(person.userId);
          return { ...signer, userId: person?.userId ?? "" };
        }),
      };
    });
  }
  function helpLabel(label: string, hint: string) {
    return (
      <Space size={6}>
        {label}
        <Tooltip title={hint} trigger={["hover", "focus"]}>
          <InfoCircleOutlined
            tabIndex={0}
            aria-label={hint}
            className={styles.helpIcon}
          />
        </Tooltip>
      </Space>
    );
  }
  function onContinue() {
    setTouched(true);
    if (!value.title.trim()) {
      setTitleError(true);
      return;
    }
    if (
      Object.keys(problems).length ||
      problem ||
      !value.file.name ||
      documentStale
    )
      return;
    const input = validatedDraft();
    if (input) save.mutate(input);
  }

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
  const stages = value.type
    ? (options.workflows[value.type]?.stages ?? [])
    : [];
  const errorCode = save.error instanceof ApiError ? save.error.code : null;

  return (
    <BaseCard bodyStyle={{ padding: 20 }}>
      {value.ruleVersion ? (
        <Alert
          type="info"
          showIcon
          title={t("contractUpload.form.ruleVersion", {
            id: value.ruleVersion.id.slice(0, 8),
          })}
          style={{ marginBottom: 16 }}
        />
      ) : null}
      <Form
        className={styles.form}
        disabled={save.isPending || sample.isPending}
        layout="vertical"
        onFinish={onContinue}
      >
        <div className={styles.toolbar}>
          <Typography.Text strong>
            {t("contractUpload.sections.details")}
          </Typography.Text>
          <DemoFillButton
            disabled={save.isPending || sample.isPending}
            onClick={fillAll}
            testId="contract-fill-demo"
          >
            {tc("demoFill.all")}
          </DemoFillButton>
        </div>
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item
              label={t("contractUpload.form.type.label")}
              {...feedback("type")}
              required
            >
              <Select<ContractType>
                placeholder={placeholder("type")}
                value={value.type}
                onChange={(type) => set("type", type)}
                options={options.types.map((type) => ({
                  value: type,
                  label: td(`contractType.${type}`),
                }))}
              />
              {stages.length ? (
                <Space size={[4, 4]} wrap className={styles.hint}>
                  <Typography.Text type="secondary">
                    {t("contractUpload.form.type.stages")}
                  </Typography.Text>
                  {stages.map((stage, index) => (
                    <Tag key={stage} style={{ margin: 0 }}>
                      {index + 1}. {td(`milestoneType.${stage}`)}
                    </Tag>
                  ))}
                </Space>
              ) : null}
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item label={t("contractUpload.form.code.label")}>
              <Space.Compact style={{ width: "100%" }}>
                <Input
                  value={t("contractUpload.form.code.value", {
                    code: value.code,
                  })}
                  readOnly
                />
              </Space.Compact>
              <div style={{ marginTop: 8 }}>
                <OriginTag origin={value.origin} />
              </div>
            </Form.Item>
          </Col>
        </Row>
        <Form.Item
          label={t("contractUpload.form.title.label")}
          htmlFor="contract-title"
          required
          {...feedback("title")}
        >
          <Input
            id="contract-title"
            placeholder={placeholder("title")}
            value={value.title}
            maxLength={TITLE_MAX_LENGTH}
            showCount
            aria-invalid={titleError}
            onChange={(event) => {
              set("title", event.target.value);
              setTitleError(false);
            }}
          />
        </Form.Item>
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item
              label={t("contractUpload.form.supplier.label")}
              required
              {...feedback("supplierId")}
            >
              <Select
                showSearch
                placeholder={placeholder("supplier")}
                optionFilterProp="label"
                value={value.supplierId || undefined}
                onChange={changeSupplier}
                options={options.suppliers.map((supplier) => ({
                  value: supplier.id,
                  label: `${supplier.id} · ${supplier.name}`,
                }))}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              label={t("contractUpload.form.reviewer.label")}
              required
              {...feedback("reviewerId")}
            >
              <Select
                value={value.reviewerId || undefined}
                placeholder={placeholder("reviewer")}
                onChange={(reviewerId) => set("reviewerId", reviewerId)}
                options={options.reviewers.map((reviewer) => ({
                  value: reviewer.userId,
                  label: t("contractUpload.form.reviewer.option", {
                    role: tc(`roles.${reviewer.role}.name`),
                    organization: reviewer.name,
                  }),
                }))}
              />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col xs={24} md={8}>
            <Form.Item
              label={t("contractUpload.form.value.label")}
              required
              {...feedback("valueMillion")}
            >
              <Input
                id="contract-value"
                placeholder={placeholder("value")}
                value={value.valueMillion}
                inputMode="decimal"
                suffix={t("contractUpload.form.value.unit")}
                onChange={(event) => set("valueMillion", event.target.value)}
              />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item
              label={t("contractUpload.form.start.label")}
              required
              {...feedback("startDate")}
            >
              <Input
                type="date"
                placeholder={placeholder("date")}
                aria-label={t("contractUpload.form.start.label")}
                value={value.startDate}
                onChange={(event) => set("startDate", event.target.value)}
              />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item
              label={t("contractUpload.form.end.label")}
              required
              {...feedback("endDate")}
            >
              <Input
                type="date"
                value={value.endDate}
                min={value.startDate || undefined}
                placeholder={placeholder("date")}
                aria-label={t("contractUpload.form.end.label")}
                onChange={(event) => set("endDate", event.target.value)}
              />
            </Form.Item>
          </Col>
        </Row>
        <Divider className={styles.divider} titlePlacement="start">
          {t("contractUpload.sections.terms")}
        </Divider>
        <Row gutter={16}>
          <Col xs={24}>
            <Form.Item
              label={t("contractUpload.form.policy.label")}
              required
              extra={
                value.approvalPolicy
                  ? td(`policyHint.${value.approvalPolicy}`)
                  : undefined
              }
            >
              <Select<ApprovalPolicy>
                placeholder={placeholder("policy")}
                value={value.approvalPolicy}
                onChange={(policy) => set("approvalPolicy", policy)}
                options={options.policies.map((policy) => ({
                  value: policy,
                  label: td(`policy.${policy}`),
                }))}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item
              label={t("contractUpload.form.penalty.grace")}
              {...feedback("graceDays")}
            >
              <InputNumber
                min={0}
                precision={0}
                placeholder={placeholder("grace")}
                max={60}
                value={value.graceDays}
                style={{ width: "100%" }}
                onChange={(grace) => set("graceDays", grace ?? undefined)}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item
              label={t("contractUpload.form.penalty.rate")}
              {...feedback("penaltyRatePct")}
            >
              <Input
                value={value.penaltyRatePct}
                placeholder={placeholder("rate")}
                inputMode="decimal"
                suffix="%"
                onChange={(event) => set("penaltyRatePct", event.target.value)}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item
              label={t("contractUpload.form.penalty.cap")}
              {...feedback("maxPenaltyPct")}
            >
              <Input
                value={value.maxPenaltyPct}
                placeholder={placeholder("cap")}
                inputMode="decimal"
                suffix="%"
                onChange={(event) => set("maxPenaltyPct", event.target.value)}
              />
            </Form.Item>
          </Col>
        </Row>

        <Divider className={styles.divider} titlePlacement="start">
          {t("contractUpload.sections.signing")}
        </Divider>
        {value.signers.length === 1 ? (
          <Alert
            type="warning"
            showIcon
            title={t("contractUpload.form.signers.singleNotice")}
            style={{ marginBottom: 16 }}
          />
        ) : null}
        <div data-testid="template-and-signers">
          <Form.Item
            label={helpLabel(
              t("contractUpload.templates.choose"),
              t("contractUpload.templates.notice"),
            )}
          >
            <Select
              data-testid="contract-template-picker"
              style={{ width: "100%" }}
              allowClear
              placeholder={t("contractUpload.templates.choose")}
              value={value.templateId}
              labelRender={({ label }) =>
                value.templateSnapshot
                  ? `${value.templateSnapshot.name} · v${value.templateSnapshot.version}`
                  : label
              }
              onSelect={(id?: string) => {
                if (id) applyPreset(id);
              }}
              onChange={(id?: string) => {
                if (!id)
                  setValue((current) => ({
                    ...current,
                    templateId: undefined,
                    templateVersion: undefined,
                    templateSnapshot: undefined,
                  }));
              }}
              options={[
                ...(value.templateSnapshot &&
                !options.presets.some(
                  (preset) => preset.id === value.templateId,
                )
                  ? [
                      {
                        value: value.templateId!,
                        label: value.templateSnapshot.name,
                      },
                    ]
                  : []),
                ...options.presets.map((preset) => ({
                  value: preset.id,
                  label: (
                    <span data-testid={`template-option-${preset.id}`}>
                      {preset.name} · v{preset.version}
                    </span>
                  ),
                })),
              ]}
            />
          </Form.Item>
          <Form.Item
            label={helpLabel(
              t("contractUpload.form.signers.label"),
              t("contractUpload.form.signers.hint"),
            )}
            required
            validateStatus={touched && problem ? "error" : undefined}
            help={
              touched && problem
                ? t(`contractUpload.form.signers.errors.${problem}`)
                : undefined
            }
          >
            <div data-testid="signer-list">
              {value.signers.map((signer, index) => (
                <div
                  className={styles.signerRow}
                  data-testid="signer-row"
                  key={`${index}-${signer.party}`}
                >
                  <Tag
                    className={styles.signerIndex}
                    color={index === value.signers.length - 1 ? "gold" : "blue"}
                  >
                    {index + 1}
                  </Tag>
                  <div className={styles.signerSide}>
                    <Select<Side>
                      aria-label={t("contractUpload.form.signers.sideAt", {
                        index: index + 1,
                      })}
                      value={signer.party}
                      style={{ width: "100%" }}
                      onChange={(party) =>
                        setSigners(
                          value.signers.map((s, i) =>
                            i === index
                              ? {
                                  party,
                                  userId: "",
                                }
                              : s,
                          ),
                        )
                      }
                      options={(["BUYER", "SUPPLIER"] as const).map(
                        (party) => ({
                          value: party,
                          label: td(`side.${party}`),
                        }),
                      )}
                    />
                  </div>
                  <div className={styles.signerPerson}>
                    <Select
                      aria-label={t("contractUpload.form.signers.personAt", {
                        index: index + 1,
                      })}
                      value={signer.userId || undefined}
                      style={{ width: "100%" }}
                      placeholder={t("contractUpload.form.signers.person")}
                      onChange={(userId: string) =>
                        setSigners(
                          value.signers.map((s, i) =>
                            i === index ? { ...s, userId } : s,
                          ),
                        )
                      }
                      options={peopleFor(signer.party).map((person) => ({
                        value: person.userId,
                        label: `${person.name} · ${tc(`roles.${person.role}.name`)}`,
                      }))}
                    />
                  </div>
                  <Dropdown
                    trigger={["click"]}
                    menu={{
                      items: [
                        {
                          key: "up",
                          label: t("contractUpload.form.signers.up"),
                          icon: <ArrowUpOutlined />,
                          disabled: index === 0,
                        },
                        {
                          key: "down",
                          label: t("contractUpload.form.signers.down"),
                          icon: <ArrowDownOutlined />,
                          disabled: index === value.signers.length - 1,
                        },
                        { type: "divider" },
                        {
                          key: "remove",
                          label: t("contractUpload.form.signers.remove"),
                          icon: <DeleteOutlined />,
                          danger: true,
                        },
                      ],
                      onClick: ({ key }) => {
                        if (key === "up" && index > 0) move(index, -1);
                        if (key === "down" && index < value.signers.length - 1)
                          move(index, 1);
                        if (key === "remove")
                          setSigners(
                            value.signers.filter((_, i) => i !== index),
                          );
                      },
                    }}
                  >
                    <Button
                      className={styles.signerActions}
                      size="small"
                      icon={<MoreOutlined />}
                      aria-label={t("contractUpload.form.signers.actionsAt", {
                        index: index + 1,
                      })}
                    >
                      {t("contractUpload.form.signers.actions")}
                    </Button>
                  </Dropdown>
                </div>
              ))}
            </div>
            <div className={styles.signerFooter}>
              <Button
                data-testid="signer-add"
                size="small"
                icon={<PlusOutlined />}
                disabled={value.signers.length >= MAX_SIGNERS}
                onClick={() =>
                  setSigners([
                    ...value.signers,
                    {
                      party: "BUYER",
                      userId: "",
                    },
                  ])
                }
              >
                {t("contractUpload.form.signers.add")}
              </Button>
              <Typography.Text type="secondary">
                {t("contractUpload.form.signers.count", {
                  count: value.signers.length,
                  max: MAX_SIGNERS,
                })}
              </Typography.Text>
            </div>
            <Typography.Text type="secondary" className={styles.hint}>
              {t("contractUpload.form.signers.compactHint")}
            </Typography.Text>
          </Form.Item>
        </div>
        <Typography.Paragraph type="secondary" className={styles.positionHint}>
          {helpLabel(
            t("contractUpload.form.positionsNotice.compact"),
            t("contractUpload.form.positionsNotice.body"),
          )}
        </Typography.Paragraph>
        <div data-testid="contract-document-section">
          <Divider className={styles.divider} titlePlacement="start">
            {t("contractUpload.sections.document")}
          </Divider>
          {documentStale ? (
            <Alert
              type="warning"
              showIcon
              data-testid="contract-document-stale"
              title={t("contractUpload.templates.stale")}
              style={{ marginBottom: 16 }}
            />
          ) : null}
          <Form.Item
            label={helpLabel(
              t("contractUpload.templates.body"),
              t("contractUpload.templates.bodyHint"),
            )}
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
                {t("contractUpload.templates.bodyEmptyHint")}
              </Typography.Text>
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
          <Typography.Paragraph type="secondary" className={styles.hint}>
            {helpLabel(
              t("contractUpload.sample.compactNotice"),
              t("contractUpload.sample.notice"),
            )}
          </Typography.Paragraph>
          <Form.Item
            label={helpLabel(
              t("contractUpload.form.file.label"),
              t("contractUpload.form.file.replaceHint"),
            )}
            required
            extra={t("contractUpload.form.file.constraint")}
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
                    {t("contractUpload.form.file.empty")}
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
                  <Tag
                    key={name}
                    closable
                    onClose={() => {
                      pendingAppendices.current =
                        pendingAppendices.current.filter(
                          (file) => file.name !== name,
                        );
                      set(
                        "appendixNames",
                        value.appendixNames.filter(
                          (existing) => existing !== name,
                        ),
                      );
                    }}
                  >
                    {name}
                  </Tag>
                ))}
              </Space>
            ) : null}
          </Form.Item>
        </div>
        {save.isError ? (
          <Alert
            type="error"
            showIcon
            title={t(`contractUpload.form.errors.${errorCode ?? "UNKNOWN"}`, {
              defaultValue:
                errorCode ?? t("contractUpload.form.errors.UNKNOWN"),
            })}
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
