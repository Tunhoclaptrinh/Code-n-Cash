import { Col, Divider, Form, Input, InputNumber, Row, Select } from "antd";
import { useTranslation } from "react-i18next";
import type { ApprovalPolicy } from "@codecash/contracts";
import type { ContractUploadFormState } from "../hooks/useContractUploadForm";
import type { UploadFormOptions } from "../types";
import { HelpLabel } from "./HelpLabel";
import styles from "./ContractUploadForm.module.css";

interface UploadTermsSectionProps {
  form: ContractUploadFormState;
  options: UploadFormOptions;
}

/** Approval policy, late-delivery penalty terms and the buyer's payment term. */
export function UploadTermsSection({ form, options }: UploadTermsSectionProps) {
  const { t } = useTranslation("contracts");
  const { t: td } = useTranslation("domain");
  const { value, set, feedback, placeholder } = form;
  return (
    <>
      <Divider className={styles.divider} titlePlacement="start">
        {t("contractUpload.sections.terms")}
      </Divider>
      <Row gutter={16}>
        <Col xs={24}>
          <Form.Item
            label={
              value.approvalPolicy ? (
                <HelpLabel
                  label={t("contractUpload.form.policy.label")}
                  hint={td(`policyHint.${value.approvalPolicy}`)}
                />
              ) : (
                t("contractUpload.form.policy.label")
              )
            }
            required
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
        <Col xs={24} sm={12}>
          <Form.Item
            label={
              <HelpLabel
                label={t("contractUpload.form.payment.term")}
                hint={t("contractUpload.form.payment.termHint")}
              />
            }
            {...feedback("paymentTermDays")}
          >
            <InputNumber
              min={1}
              max={180}
              precision={0}
              placeholder={placeholder("paymentTerm")}
              value={value.paymentTermDays ?? undefined}
              style={{ width: "100%" }}
              onChange={(days) => set("paymentTermDays", days ?? null)}
            />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item
            label={
              <HelpLabel
                label={t("contractUpload.form.payment.rate")}
                hint={t("contractUpload.form.payment.rateHint")}
              />
            }
            {...feedback("latePaymentRatePct")}
          >
            <Input
              value={value.latePaymentRatePct ?? ""}
              placeholder={placeholder("latePaymentRate")}
              inputMode="decimal"
              suffix={t("contractUpload.form.payment.rateSuffix")}
              onChange={(event) =>
                set("latePaymentRatePct", event.target.value || null)
              }
            />
          </Form.Item>
        </Col>
      </Row>
    </>
  );
}
