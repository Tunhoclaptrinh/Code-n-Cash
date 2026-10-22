import type { TFunction } from "i18next";
import { formatMillionVnd } from "@/shared/lib/format";
import type { ActivityAction, ActivityEntry, ActivityFilters } from "../types";

/** Human-readable sentence for what an entry recorded; enum values are translated here, not stored. */
export function describeAction(t: TFunction, action: ActivityAction): string {
  switch (action.kind) {
    case "WORKFLOW_ACTION":
      return t("actions.WORKFLOW_ACTION", {
        action: t(`workflowActions.${action.code}`, {
          defaultValue: action.code,
        }),
      });
    case "DECISION_FINALIZED":
    case "EVIDENCE_CHECKED":
      return t(`actions.${action.kind}`, {
        decision: action.decision,
        amount: formatMillionVnd(action.amountMillion),
      });
    case "DECISION_APPROVED_AND_SIGNED":
      return t("actions.DECISION_APPROVED_AND_SIGNED");
    case "EVIDENCE_SUBMITTED":
      return t("actions.EVIDENCE_SUBMITTED", {
        document: t(`documents.${action.document}`),
      });
    case "DISPUTE_OPENED":
      return t("actions.DISPUTE_OPENED", {
        milestone: t(`milestoneNames.${action.milestoneKind}`),
      });
    case "CONTRACT_SIGNED":
      return t(
        action.isFinal
          ? "actions.CONTRACT_SIGNED_FINAL"
          : "actions.CONTRACT_SIGNED",
        {
          step: action.step,
          total: action.totalSteps,
        },
      );
    case "DIGITIZATION_CONFIRMED":
      return t("actions.DIGITIZATION_CONFIRMED", {
        count: action.milestoneCount,
      });
  }
}

export function actorName(t: TFunction, entry: ActivityEntry): string {
  return entry.actor.displayName ?? t("actorNames.SYSTEM");
}

export function contractReference(t: TFunction, entry: ActivityEntry): string {
  return entry.milestoneNo === undefined
    ? entry.contractCode
    : t("contractRef.withMilestone", {
        contract: entry.contractCode,
        milestoneNo: entry.milestoneNo,
      });
}

const DAY_START = "T00:00:00";
const DAY_END = "T23:59:59.999";

export function filterActivity(
  entries: ActivityEntry[],
  filters: ActivityFilters,
): ActivityEntry[] {
  const from = filters.from
    ? new Date(`${filters.from}${DAY_START}`).getTime()
    : -Infinity;
  const to = filters.to
    ? new Date(`${filters.to}${DAY_END}`).getTime()
    : Infinity;

  return entries.filter((entry) => {
    const at = new Date(entry.at).getTime();
    return (
      (!filters.contractCode || entry.contractCode === filters.contractCode) &&
      (!filters.actorId || entry.actor.id === filters.actorId) &&
      (!filters.category || entry.category === filters.category) &&
      at >= from &&
      at <= to
    );
  });
}
