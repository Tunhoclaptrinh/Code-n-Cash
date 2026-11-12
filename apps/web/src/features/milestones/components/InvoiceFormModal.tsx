import { useEffect } from "react";
import { Alert, Form, Input, Modal } from "antd";
import { useTranslation } from "react-i18next";
import { invoiceProblems, type InvoiceData } from "@codecash/contracts";
import { DemoFillButton } from "@/shared/ui/DemoFillButton";
import { formatDecimalString, sumDecimalStrings } from "@/shared/lib/format";

type Field = keyof InvoiceData;

/**
 * The invoice's own data, entered with its file (Thông tư 78/2021/TT-BTC). The form checks the format
 * as the API does; the API also checks the total against the milestone, the dates against the
 * contract and that the invoice was not used before.
 */
export function InvoiceFormModal({
  open,
  fileName,
  plannedMillion,
  today,
  busy,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  fileName: string;
  plannedMillion: string;
  today: string;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (invoice: InvoiceData) => void;
}) {
  const { t } = useTranslation("milestones");
  const { t: td } = useTranslation("domain");
  const [form] = Form.useForm<InvoiceData>();
  useEffect(() => {
    if (open) form.resetFields();
  }, [open, form]);
  const rule = (field: Field) => ({
    validator: (_: unknown, value: unknown) => {
      const code = invoiceProblems({
        ...form.getFieldsValue(),
        [field]: value,
      })[field];
      if (code) return Promise.reject(new Error(td(`errors.${code}`)));
      // Exact decimal comparison in hundredths, never floats.
      if (
        field === "amountMillion" &&
        sumDecimalStrings([String(value).replace(",", ".")]) !==
          sumDecimalStrings([plannedMillion])
      )
        return Promise.reject(new Error(td("errors.INVOICE_AMOUNT_MISMATCH")));
      return Promise.resolve();
    },
  });
  const year = today.slice(2, 4);
  return (
    <Modal
      open={open}
      title={t("invoice.form.title")}
      okText={t("invoice.form.submit")}
      confirmLoading={busy}
      onCancel={onCancel}
      onOk={() => void form.validateFields().then(onSubmit)}
      destroyOnHidden
      data-testid="invoice-form"
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        title={t("invoice.form.notice", {
          fileName,
          planned: formatDecimalString(plannedMillion),
        })}
        action={
          <DemoFillButton
            testId="invoice-demo-fill"
            onClick={() =>
              form.setFieldsValue({
                symbol: `1C${year}TAA`,
                number: String(Date.now() % 100_000_000).padStart(8, "0"),
                issueDate: today,
                sellerTaxCode: "0109876543",
                amountMillion: plannedMillion,
              })
            }
          />
        }
      />
      <Form form={form} layout="vertical" requiredMark>
        <Form.Item
          name="symbol"
          label={t("invoice.fields.symbol")}
          extra={t("invoice.hints.symbol", { example: `1C${year}TAA` })}
          rules={[{ required: true, message: "" }, rule("symbol")]}
          normalize={(value: string) => value?.toUpperCase()}
        >
          <Input maxLength={7} data-testid="invoice-symbol" />
        </Form.Item>
        <Form.Item
          name="number"
          label={t("invoice.fields.number")}
          rules={[{ required: true, message: "" }, rule("number")]}
        >
          <Input
            maxLength={8}
            inputMode="numeric"
            data-testid="invoice-number"
          />
        </Form.Item>
        <Form.Item
          name="issueDate"
          label={t("invoice.fields.issueDate")}
          rules={[{ required: true, message: "" }, rule("issueDate")]}
        >
          <Input type="date" max={today} data-testid="invoice-date" />
        </Form.Item>
        <Form.Item
          name="sellerTaxCode"
          label={t("invoice.fields.sellerTaxCode")}
          extra={t("invoice.hints.sellerTaxCode")}
          rules={[{ required: true, message: "" }, rule("sellerTaxCode")]}
        >
          <Input maxLength={14} data-testid="invoice-tax-code" />
        </Form.Item>
        <Form.Item
          name="amountMillion"
          label={t("invoice.fields.amountMillion")}
          extra={t("invoice.hints.amountMillion", {
            planned: formatDecimalString(plannedMillion),
          })}
          rules={[{ required: true, message: "" }, rule("amountMillion")]}
        >
          <Input inputMode="decimal" data-testid="invoice-amount" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
