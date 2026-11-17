import {
  Col,
  Divider,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Switch,
} from "antd";
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

/** Days offered when the acceptance review window is switched back on (the system default). */
const REVIEW_DAYS_FALLBACK = 5;

/** Approval policy, late-delivery penalty terms and the acceptance review window (BR-21). */
export function UploadTermsSection({ form, options }: UploadTermsSectionProps) {
  const { t } = useTranslation("contracts");
  const { t: td } = useTranslation("domain");
  const { value, set, feedback, placeholder } = form;
  const reviewOn = value.acceptanceReviewDays !== null;
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
        <Col xs={24}>
          <Form.Item
            label={
              <HelpLabel
                label={t("contractUpload.form.acceptance.label")}
                hint={t("contractUpload.form.acceptance.hint")}
              />
            }
            {...feedback("acceptanceReviewDays")}
            extra={t(
              reviewOn
                ? "contractUpload.form.acceptance.on"
                : "contractUpload.form.acceptance.off",
              { days: value.acceptanceReviewDays },
            )}
          >
            <Space wrap>
              <Switch
                checked={reviewOn}
                aria-label={t("contractUpload.form.acceptance.toggle")}
                onChange={(checked) =>
                  set(
                    "acceptanceReviewDays",
                    checked ? REVIEW_DAYS_FALLBACK : null,
                  )
                }
              />
              <InputNumber
                min={1}
                max={60}
                precision={0}
                disabled={!reviewOn}
                value={reviewOn ? value.acceptanceReviewDays : undefined}
                placeholder={placeholder("acceptanceDays")}
                aria-label={t("contractUpload.form.acceptance.days")}
                suffix={t("contractUpload.form.acceptance.unit")}
                style={{ width: 140 }}
                onChange={(days) =>
                  set("acceptanceReviewDays", days ?? Number.NaN)
                }
              />
            </Space>
          </Form.Item>
        </Col>
      </Row>
    </>
  );
}
