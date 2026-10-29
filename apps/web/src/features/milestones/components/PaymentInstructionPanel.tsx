import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Descriptions, Space, Tag } from "antd";
import { useTranslation } from "react-i18next";
import type { MilestoneDetail, PaymentInstruction } from "@codecash/contracts";
import { retryPaymentDelivery } from "@/shared/api/domain";
import { useCurrentUser } from "@/shared/auth/session";
import { useApiErrorMessage } from "../hooks/useApiErrorMessage";
import { formatDateTime, formatDecimalString } from "@/shared/lib/format";
import { DecisionTag } from "@/shared/ui/DomainTags";
import { TrackingCode } from "@/shared/ui/TechnicalInfo";

/**
 * The payment instruction of a paying decision: drawn up by the decision itself, approved by finance,
 * then sent to the payment gateway with the gateway's answer.
 */
export function PaymentInstructionPanel({ data }: { data: MilestoneDetail }) {
  const { t } = useTranslation("milestones");
  const queryClient = useQueryClient();
  // Only finance (payments:transfer) sends instructions; the API checks it again.
  const canSend = useCurrentUser().permissions.includes("payments:transfer");
  const failed = useApiErrorMessage();
  const payment = data.payment;
  const retry = useMutation({
    mutationFn: () => retryPaymentDelivery(data.payment!.id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["milestones"] }),
    onError: failed,
  });
  const instruction = payment?.instruction ?? data.instruction;
  if (!instruction) return null;
  const delivery = payment?.delivery;
  const tone = !payment
    ? "info"
    : delivery?.status === "FAILED"
      ? "error"
      : delivery?.status === "ACKNOWLEDGED" || !delivery
        ? "success"
        : "warning";
  const title = !payment
    ? t("instruction.drawnUp")
    : t(`instruction.state.${delivery?.status ?? "ACKNOWLEDGED"}`, {
        by: payment.transferredBy,
        at: formatDateTime(payment.transferredAt),
      });
  return (
    <Alert
      type={tone}
      showIcon
      data-testid="payment-instruction"
      title={title}
      description={
        <Space orientation="vertical" size={8} style={{ width: "100%" }}>
          <InstructionDetails instruction={instruction} />
          {delivery ? (
            <Space wrap size={8}>
              <Tag>{t(`instruction.channel.${delivery.channel}`)}</Tag>
              {delivery.reference ? (
                <span>
                  {t("instruction.reference")}{" "}
                  <TrackingCode code={delivery.reference} />
                </span>
              ) : null}
              {delivery.error ? (
                <Tag color="error">
                  {t("instruction.error", {
                    error: delivery.error,
                    attempts: delivery.attempts,
                  })}
                </Tag>
              ) : null}
              {delivery.status !== "ACKNOWLEDGED" && canSend ? (
                <Button
                  size="small"
                  loading={retry.isPending}
                  onClick={() => retry.mutate()}
                  data-testid="retry-payment-delivery"
                >
                  {t("instruction.retry")}
                </Button>
              ) : null}
            </Space>
          ) : null}
        </Space>
      }
    />
  );
}

function InstructionDetails({
  instruction,
}: {
  instruction: PaymentInstruction;
}) {
  const { t } = useTranslation("milestones");
  return (
    <Descriptions
      size="small"
      column={1}
      items={[
        {
          key: "decision",
          label: t("instruction.decision"),
          children: <DecisionTag decision={instruction.decision} />,
        },
        {
          key: "amount",
          label: t("instruction.amount"),
          children: t("instruction.amountValue", {
            amount: formatDecimalString(instruction.amountMillion),
            penalty: formatDecimalString(instruction.penaltyMillion),
          }),
        },
        {
          key: "parties",
          label: t("instruction.parties"),
          children: t("instruction.partiesValue", {
            payer: instruction.payer.name,
            payee: instruction.payee.name,
          }),
        },
        {
          key: "digest",
          label: t("instruction.digest"),
          children: <TrackingCode code={instruction.decisionDigest} />,
        },
      ]}
    />
  );
}
