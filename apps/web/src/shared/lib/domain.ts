import type {
  ContractStatus,
  Decision,
  EventActor,
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

/** The milestone status that says the same as a decision, so a screen shows only one of the two. */
const statusOfDecision: Record<Decision, MilestoneStatus> = {
  HOLD: "ON_HOLD",
  PENALTY: "PAID_WITH_PENALTY",
  RELEASE: "ELIGIBLE_FOR_PAYMENT",
  REJECT: "REJECTED",
};

export const statusRepeatsDecision = (
  status: MilestoneStatus,
  decision: Decision,
) => statusOfDecision[decision] === status;

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

/** Data Pack titles end with their own code ("… - CT0084"); drop it where the code is shown anyway. */
export function contractTitle(contract: { id: string; title: string }) {
  const suffix = new RegExp(`\\s*[-–]\\s*${contract.id}$`);
  return contract.title.replace(suffix, "") || contract.title;
}

/** "CT0084 · Cung cấp thiết bị hội nghị", with the code shown once. */
export const contractHeading = (contract: { id: string; title: string }) =>
  `${contract.id} · ${contractTitle(contract)}`;

/**
 * Who recorded an event, in business terms. Data Pack approver parties are named like
 * "Contract Owner - Nova An Business JSC"; show the person when known, otherwise the role.
 */
export function actorName(
  td: TFunction,
  actor: EventActor,
  people?: ReadonlyMap<string, string>,
) {
  if (actor.type !== "APPROVER") return actor.name;
  return (
    people?.get(actor.partyId) ??
    (actor.approvalRole ? td(`approvalRole.${actor.approvalRole}`) : actor.name)
  );
}

/** Person names of a contract's approver parties, for `actorName`. */
export const peopleOf = (
  participants: { kind: string; partyId: string; personName: string | null }[],
) =>
  new Map(
    participants
      .filter((p) => p.kind === "APPROVER" && p.personName)
      .map((p) => [p.partyId, p.personName!] as const),
  );
