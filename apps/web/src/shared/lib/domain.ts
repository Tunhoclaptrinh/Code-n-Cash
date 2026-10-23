import type {
  ContractStatus,
  Decision,
  EventClass,
  MilestoneStatus,
  NextStep,
} from "@codecash/contracts";
import type { TFunction } from "i18next";
import type { Tone } from "../ui/ToneTag";

/** Display tones of the workflow vocabulary; labels live in locales/<lang>/domain.json. */
export const statusTone: Record<MilestoneStatus, Tone> = {
  WAITING_EVIDENCE: "primary",
  WAITING_APPROVAL: "indigo",
  ON_HOLD: "warning",
  REJECTED: "danger",
  ELIGIBLE_FOR_PAYMENT: "success",
  PAID_WITH_PENALTY: "warning",
  COMPLETED: "neutral",
};

export const decisionTone: Record<Decision, Tone> = {
  RELEASE: "success",
  PENALTY: "warning",
  HOLD: "primary",
  REJECT: "danger",
};

export const contractStatusTone: Record<ContractStatus, Tone> = {
  DRAFT: "neutral",
  AWAITING_SIGNATURE: "indigo",
  PENDING_CONDITIONS: "warning",
  NEEDS_REVIEW: "danger",
  ALL_MILESTONES_ELIGIBLE: "success",
  CLOSED: "neutral",
};

export const eventClassTone: Record<EventClass, Tone> = {
  EVIDENCE: "success",
  ADDITIONAL: "neutral",
  APPROVAL: "success",
  APPROVAL_NOT_COUNTED: "neutral",
  REJECTION: "danger",
  OPEN_DISPUTE: "warning",
  CLOSED_DISPUTE: "neutral",
  RESOLUTION: "primary",
  DUPLICATE: "neutral",
  UNAUTHORIZED: "danger",
  WRONG_STATUS: "warning",
  UNRELATED: "neutral",
  VOIDED: "neutral",
};

/** One sentence for who has to act next on a milestone (spec 9.5). */
export function describeNext(t: TFunction, step: NextStep): string {
  switch (step.kind) {
    case "SUBMIT":
      return t("domain:next.SUBMIT", {
        side: t(`domain:side.${step.side}`),
        events: step.eventTypes
          .map((type) => t(`domain:eventType.${type}`))
          .join(", "),
      });
    case "APPROVE":
      return t("domain:next.APPROVE", {
        roles: step.roles
          .map((role) => t(`domain:approvalRole.${role}`))
          .join(", "),
      });
    default:
      return t(`domain:next.${step.kind}`);
  }
}
