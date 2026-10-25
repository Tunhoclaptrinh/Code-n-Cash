import { Col, Form, Input, Row, Select, Space, Tag, Typography } from "antd";
import { useTranslation } from "react-i18next";
import type { ContractType } from "@codecash/contracts";
import { TITLE_MAX_LENGTH } from "../lib/uploadDraft";
import type { ContractUploadFormState } from "../hooks/useContractUploadForm";
import type { UploadFormOptions } from "../types";
import styles from "./ContractUploadForm.module.css";

interface UploadDetailsSectionProps {
  form: ContractUploadFormState;
  options: UploadFormOptions;
}

/** Type, code, title, parties, value and dates. */
export function UploadDetailsSection({
  form,
  options,
}: UploadDetailsSectionProps) {
  const { t } = useTranslation("contracts");
  const { t: tc } = useTranslation("common");
  const { t: td } = useTranslation("domain");
  const {
    value,
    set,
    feedback,
    placeholder,
    titleError,
    setTitleError,
    changeSupplier,
  } = form;
  const stages = value.type
    ? (options.workflows[value.type]?.stages ?? [])
    : [];
  return (
    <>
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
    </>
  );
}
