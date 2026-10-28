import type { TFunction } from "i18next";
import { formatDecimalString } from "@/shared/lib/format";
import type { ActivityAction, ActivityEntry } from "../types";

/** Human-readable sentence for what an entry recorded; enum values are translated here, not stored. */
export function describeAction(t: TFunction, action: ActivityAction): string {
  switch (action.kind) {
    case "EVENT":
      return t("actions.EVENT", {
        event: t(`domain:eventType.${action.eventType}`),
        status: t(`domain:eventStatus.${action.status}`),
        id: action.eventId,
      });
    case "DECISION":
      return t(
        action.previous ? "actions.DECISION" : "actions.DECISION_FIRST",
        {
          from: action.previous ? t(`domain:status.${action.previous}`) : "",
          to: t(`domain:status.${action.status}`),
          reason: t(`domain:reason.${action.reasonCode}`),
          decision: action.decision,
        },
      );
    case "SIGNATURE":
      return t(
        action.isFinal ? "actions.SIGNATURE_FINAL" : "actions.SIGNATURE",
        {
          step: action.stepNo,
          total: action.totalSteps,
        },
      );
    case "DIGITIZATION_CONFIRMED":
      return t("actions.DIGITIZATION_CONFIRMED", {
        count: action.milestoneCount,
      });
    case "EXCEPTION":
      return t(`actions.EXCEPTION_${action.state}`, { id: action.eventId });
    case "PAYMENT":
      return t("actions.PAYMENT", {
        amount: formatDecimalString(action.amountMillion),
      });
    case "PAYMENT_DELIVERY":
      return t(`actions.PAYMENT_DELIVERY_${action.status}`, {
        channel: t(`paymentChannel.${action.channel}`),
        attempts: action.attempts,
        reference: action.reference ?? "",
        error: action.error ?? "",
      });
    case "REQUEST_INFO":
      return t("actions.REQUEST_INFO", { text: action.text });
    case "WORKFLOW_ACTION":
      return t("actions.WORKFLOW_ACTION", {
        action: t(`workflowActions.${action.code}`, {
          defaultValue: action.code,
        }),
      });
  }
}

export function actorName(t: TFunction, entry: ActivityEntry): string {
  return entry.actor.displayName ?? t("actorNames.SYSTEM");
}

export function contractReference(t: TFunction, entry: ActivityEntry): string {
  return entry.milestoneNo === null
    ? entry.contractCode
    : t("contractRef.withMilestone", {
        contract: entry.contractCode,
        milestoneNo: entry.milestoneNo,
      });
}

/** Label of an action code from the activity list facets (event type, decision or action). */
export function actionLabel(t: TFunction, code: string): string {
  if (code.startsWith("DECISION_"))
    return t("actionCodes.DECISION", { decision: code.slice(9) });
  return t(`domain:eventType.${code}`, {
    defaultValue: t(`workflowActions.${code}`, {
      defaultValue: t(`actionCodes.${code}`, { defaultValue: code }),
    }),
  });
}
