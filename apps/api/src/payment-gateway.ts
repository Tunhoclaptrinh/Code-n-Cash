import { createHmac } from "node:crypto";
import type { Payment, PaymentDelivery } from "./domain/types";

/**
 * Delivery of approved payment instructions to an external payment gateway.
 *
 * With PAYMENT_GATEWAY_URL set, each instruction is POSTed as JSON with the payment id as the
 * Idempotency-Key (a resend never pays twice) and, when PAYMENT_GATEWAY_SECRET is set, an
 * X-CodeCash-Signature header "sha256=<HMAC-SHA256 of the body>". A 2xx answer acknowledges the
 * instruction; its JSON `reference`, when present, is kept. Without a URL the gateway is simulated
 * and acknowledges at once, so the demo keeps working without an external system.
 */
export const gatewayChannel = (): PaymentDelivery["channel"] =>
  process.env.PAYMENT_GATEWAY_URL ? "WEBHOOK" : "SIMULATED";

const TIMEOUT_MS = 10_000;

export interface DeliveryResult {
  status: "ACKNOWLEDGED" | "FAILED";
  reference: string | null;
  error: string | null;
}

/** The message the gateway receives; amounts stay decimal strings in VND millions. */
export function gatewayMessage(payment: Payment) {
  const instruction = payment.instruction;
  return {
    instructionId: payment.id,
    contractId: payment.contractId,
    milestoneId: payment.milestoneId,
    decision: payment.decision,
    amountMillion: payment.amountMillion,
    penaltyMillion: instruction?.penaltyMillion ?? "0.00",
    currency: "VND",
    unit: "MILLION",
    payer: instruction?.payer ?? null,
    payee: instruction?.payee ?? null,
    runId: payment.runId,
    decisionDigest: instruction?.decisionDigest ?? null,
    approvedBy: payment.transferredBy,
    approvedAt: payment.transferredAt,
  };
}

export async function sendInstruction(
  payment: Payment,
): Promise<DeliveryResult> {
  const url = process.env.PAYMENT_GATEWAY_URL;
  if (!url)
    return {
      status: "ACKNOWLEDGED",
      reference: `SIM-${payment.id}`,
      error: null,
    };
  const body = JSON.stringify(gatewayMessage(payment));
  const secret = process.env.PAYMENT_GATEWAY_SECRET;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "idempotency-key": payment.id,
  };
  if (secret)
    headers["x-codecash-signature"] =
      `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok)
      return {
        status: "FAILED",
        reference: null,
        error: `HTTP_${response.status}`,
      };
    const answer = (await response.json().catch(() => null)) as {
      reference?: unknown;
    } | null;
    return {
      status: "ACKNOWLEDGED",
      reference:
        typeof answer?.reference === "string" ? answer.reference : null,
      error: null,
    };
  } catch (error) {
    return {
      status: "FAILED",
      reference: null,
      error:
        error instanceof Error && error.name === "TimeoutError"
          ? "TIMEOUT"
          : "UNREACHABLE",
    };
  }
}
