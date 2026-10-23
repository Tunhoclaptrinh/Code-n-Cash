import {
  Alert,
  Button,
  Col,
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
} from "@ant-design/icons";
import { BaseCard, FormFooter } from "@codecash/ui";
import { Fragment, useRef, useState, type ChangeEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import type { ApprovalPolicy, ContractType, Side } from "@codecash/contracts";
import { ApiError } from "@/shared/api/client";
import { saveContractDraft } from "@/shared/api/domain";
import { formatNumber } from "@/shared/lib/format";
import { OriginTag } from "@/shared/ui/DomainTags";
import type {
  ContractDraft,
  ContractFile,
  ContractFileKind,
  DraftSigner,
  UploadFormOptions,
} from "../types";

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
  if (signers.length < 2 || signers.length > MAX_SIGNERS) return "count";
  if (signers.some((s) => !s.userId)) return "missing";
  if (new Set(signers.map((s) => s.userId)).size !== signers.length)
    return "duplicate";
  if (
    !signers.some((s) => s.party === "BUYER") ||
    !signers.some((s) => s.party === "SUPPLIER")
  )
    return "bothSides";
  return null;
}

interface ContractUploadFormProps {
  draft: ContractDraft;
  options: UploadFormOptions;
  onSignersChange?: (count: number) => void;
}

/**
 * Step 1 of the upload wizard: terms the Data Pack also records (type, value, dates, approval
 * policy, penalty) and the signing order — how many people sign, from which side, in which order.
 */
export function ContractUploadForm({
  draft,
  options,
  onSignersChange,
}: ContractUploadFormProps) {
  const { t } = useTranslation("contracts");
  const { t: tc } = useTranslation("common");
  const { t: td } = useTranslation("domain");
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [value, setValue] = useState<ContractDraft>(draft);
  const [titleError, setTitleError] = useState(false);
  const [fileError, setFileError] = useState<"type" | "size" | null>(null);
  const [touched, setTouched] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const appendixInput = useRef<HTMLInputElement>(null);
  const set = <K extends keyof ContractDraft>(key: K, next: ContractDraft[K]) =>
    setValue((current) => ({ ...current, [key]: next }));
  const setSigners = (signers: DraftSigner[]) => {
    set("signers", signers);
    onSignersChange?.(signers.length);
  };

  const supplierPeople = options.supplierSigners[value.supplierId] ?? [];
  const peopleFor = (party: Side) =>
    party === "BUYER" ? options.buyerSigners : supplierPeople;
  const personName = (signer: DraftSigner) =>
    peopleFor(signer.party).find((p) => p.userId === signer.userId);
  const problem = signerProblem(value.signers);

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
    set("file", {
      name: chosen.name,
      sizeBytes: chosen.size,
      kind,
    } satisfies ContractFile);
  }

  function onAddAppendix(event: ChangeEvent<HTMLInputElement>) {
    const names = Array.from(event.target.files ?? [], (chosen) => chosen.name);
    event.target.value = "";
    set("appendixNames", [
      ...value.appendixNames,
      ...names.filter((name) => !value.appendixNames.includes(name)),
    ]);
  }

  function applyPreset(id: string) {
    const preset = options.presets.find((p) => p.id === id);
    if (!preset) return;
    const supplierUser = supplierPeople[0]?.userId ?? "";
    setSigners(
      preset.signers.map((s) =>
        s.party === "SUPPLIER"
          ? { party: "SUPPLIER", userId: supplierUser }
          : s,
      ),
    );
  }

  function move(index: number, by: -1 | 1) {
    const next = [...value.signers];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item);
    setSigners(next);
  }

  function changeSupplier(supplierId: string) {
    const first = options.supplierSigners[supplierId]?.[0]?.userId ?? "";
    setValue((current) => ({
      ...current,
      supplierId,
      signers: current.signers.map((s) =>
        s.party === "SUPPLIER" ? { ...s, userId: first } : s,
      ),
    }));
  }

  function onContinue() {
    setTouched(true);
    if (!value.title.trim()) {
      setTitleError(true);
      return;
    }
    if (problem || !value.file.name) return;
    save.mutate({ ...value, title: value.title.trim() });
  }

  const fileSize = formatNumber(value.file.sizeBytes / BYTES_PER_MB, 1);
  const stages = options.workflows[value.type]?.stages ?? [];
  const errorCode = save.error instanceof ApiError ? save.error.code : null;

  return (
    <BaseCard>
      <Form layout="vertical" onFinish={onContinue}>
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item label={t("contractUpload.form.type.label")} required>
              <Select<ContractType>
                value={value.type}
                onChange={(type) => set("type", type)}
                options={options.types.map((type) => ({
                  value: type,
                  label: td(`contractType.${type}`),
                }))}
              />
              <Space size={[4, 4]} wrap style={{ marginTop: 8 }}>
                <Typography.Text type="secondary">
                  {t("contractUpload.form.type.stages")}
                </Typography.Text>
                {stages.map((stage, index) => (
                  <Tag key={stage} style={{ margin: 0 }}>
                    {index + 1}. {td(`milestoneType.${stage}`)}
                  </Tag>
                ))}
              </Space>
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
          validateStatus={titleError ? "error" : undefined}
          help={
            titleError
              ? t("contractUpload.form.title.errors.required")
              : undefined
          }
        >
          <Input
            id="contract-title"
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
            <Form.Item label={t("contractUpload.form.supplier.label")} required>
              <Select
                showSearch
                optionFilterProp="label"
                value={value.supplierId}
                onChange={changeSupplier}
                options={options.suppliers.map((supplier) => ({
                  value: supplier.id,
                  label: `${supplier.id} · ${supplier.name}`,
                }))}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item label={t("contractUpload.form.reviewer.label")} required>
              <Select
                value={value.reviewerId}
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
            <Form.Item label={t("contractUpload.form.value.label")} required>
              <Input
                id="contract-value"
                value={value.valueMillion}
                inputMode="decimal"
                suffix={t("contractUpload.form.value.unit")}
                onChange={(event) => set("valueMillion", event.target.value)}
              />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item label={t("contractUpload.form.start.label")} required>
              <Input
                type="date"
                value={value.startDate}
                onChange={(event) => set("startDate", event.target.value)}
              />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item label={t("contractUpload.form.end.label")} required>
              <Input
                type="date"
                value={value.endDate}
                onChange={(event) => set("endDate", event.target.value)}
              />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item
              label={t("contractUpload.form.policy.label")}
              required
              extra={td(`policyHint.${value.approvalPolicy}`)}
            >
              <Select<ApprovalPolicy>
                value={value.approvalPolicy}
                onChange={(policy) => set("approvalPolicy", policy)}
                options={options.policies.map((policy) => ({
                  value: policy,
                  label: td(`policy.${policy}`),
                }))}
              />
            </Form.Item>
          </Col>
          <Col xs={8} md={4}>
            <Form.Item label={t("contractUpload.form.penalty.grace")}>
              <InputNumber
                min={0}
                max={60}
                value={value.graceDays}
                style={{ width: "100%" }}
                onChange={(grace) => set("graceDays", Number(grace ?? 0))}
              />
            </Form.Item>
          </Col>
          <Col xs={8} md={4}>
            <Form.Item label={t("contractUpload.form.penalty.rate")}>
              <Input
                value={value.penaltyRatePct}
                inputMode="decimal"
                suffix="%"
                onChange={(event) => set("penaltyRatePct", event.target.value)}
              />
            </Form.Item>
          </Col>
          <Col xs={8} md={4}>
            <Form.Item label={t("contractUpload.form.penalty.cap")}>
              <Input
                value={value.maxPenaltyPct}
                inputMode="decimal"
                suffix="%"
                onChange={(event) => set("maxPenaltyPct", event.target.value)}
              />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item
          label={t("contractUpload.form.signers.label")}
          required
          extra={t("contractUpload.form.signers.hint")}
          validateStatus={touched && problem ? "error" : undefined}
          help={
            touched && problem
              ? t(`contractUpload.form.signers.errors.${problem}`)
              : undefined
          }
        >
          <Space wrap style={{ marginBottom: 12 }}>
            <Typography.Text type="secondary">
              {t("contractUpload.form.signers.presetLabel")}
            </Typography.Text>
            {options.presets
              .filter((preset) => preset.signers.length)
              .map((preset) => (
                <Button
                  key={preset.id}
                  size="small"
                  onClick={() => applyPreset(preset.id)}
                  data-testid={`signer-preset-${preset.id}`}
                >
                  {t(`contractUpload.form.signers.presets.${preset.id}`)}
                </Button>
              ))}
          </Space>
          <div data-testid="signer-list">
            {value.signers.map((signer, index) => (
              <Row
                key={`${index}-${signer.party}`}
                gutter={8}
                align="middle"
                style={{ marginBottom: 8 }}
              >
                <Col flex="36px">
                  <Tag
                    color={index === value.signers.length - 1 ? "gold" : "blue"}
                    style={{ margin: 0 }}
                  >
                    {index + 1}
                  </Tag>
                </Col>
                <Col xs={10} md={6}>
                  <Select<Side>
                    value={signer.party}
                    style={{ width: "100%" }}
                    onChange={(party) =>
                      setSigners(
                        value.signers.map((s, i) =>
                          i === index
                            ? {
                                party,
                                userId: peopleFor(party)[0]?.userId ?? "",
                              }
                            : s,
                        ),
                      )
                    }
                    options={(["BUYER", "SUPPLIER"] as const).map((party) => ({
                      value: party,
                      label: td(`side.${party}`),
                    }))}
                  />
                </Col>
                <Col flex="auto">
                  <Select
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
                </Col>
                <Col>
                  <Space size={2}>
                    <Tooltip title={t("contractUpload.form.signers.up")}>
                      <Button
                        size="small"
                        icon={<ArrowUpOutlined />}
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                      />
                    </Tooltip>
                    <Tooltip title={t("contractUpload.form.signers.down")}>
                      <Button
                        size="small"
                        icon={<ArrowDownOutlined />}
                        disabled={index === value.signers.length - 1}
                        onClick={() => move(index, 1)}
                      />
                    </Tooltip>
                    <Tooltip title={t("contractUpload.form.signers.remove")}>
                      <Button
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        disabled={value.signers.length <= 2}
                        onClick={() =>
                          setSigners(
                            value.signers.filter((_, i) => i !== index),
                          )
                        }
                      />
                    </Tooltip>
                  </Space>
                </Col>
              </Row>
            ))}
          </div>
          <Space wrap>
            <Button
              icon={<PlusOutlined />}
              disabled={value.signers.length >= MAX_SIGNERS}
              onClick={() =>
                setSigners([
                  ...value.signers,
                  {
                    party: "BUYER",
                    userId: options.buyerSigners[0]?.userId ?? "",
                  },
                ])
              }
            >
              {t("contractUpload.form.signers.add")}
            </Button>
            <Typography.Text type="secondary">
              {value.signers.map((signer, index) => (
                <Fragment key={index}>
                  {index > 0 ? " → " : ""}
                  {personName(signer)?.name ?? "?"}
                </Fragment>
              ))}
            </Typography.Text>
          </Space>
        </Form.Item>

        <Alert
          showIcon
          type="info"
          title={t("contractUpload.form.positionsNotice.title")}
          description={t("contractUpload.form.positionsNotice.body")}
          style={{ marginBottom: 24 }}
        />
        <Form.Item
          label={t("contractUpload.form.file.label")}
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
          <BaseCard bodyStyle={{ padding: 16 }}>
            <Space
              wrap
              style={{ width: "100%", justifyContent: "space-between" }}
            >
              <div style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                {value.file.name ? (
                  <>
                    <Tag>{value.file.kind}</Tag>
                    <Typography.Text strong>{value.file.name}</Typography.Text>
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
                onClick={() => fileInput.current?.click()}
                data-testid="contract-file-choose"
              >
                {value.file.name
                  ? t("contractUpload.form.file.replace")
                  : t("contractUpload.form.file.choose")}
              </Button>
            </Space>
            <input
              ref={fileInput}
              type="file"
              hidden
              style={{ display: "none" }}
              data-testid="contract-file-input"
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
            {value.appendixNames.map((name) => (
              <Tag
                key={name}
                closable
                onClose={() =>
                  set(
                    "appendixNames",
                    value.appendixNames.filter((existing) => existing !== name),
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
