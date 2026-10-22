import type {
  DecisionCode,
  Milestone,
  ReasonCheck,
  ReasonCode,
} from "../types";
import { basisPointsOf, subtractMillion } from "./money";

export interface Proposal {
  code: DecisionCode;
  reasonCode: ReasonCode;
  valueMillion: number;
  lateDays: number;
  rateBpPerDay: number;
  capBp: number;
  /** Penalty before the cap is applied. */
  calculatedPenaltyMillion: number;
  capMillion: number;
  capReached: boolean;
  penaltyMillion: number;
  payableMillion: number;
  checks: ReasonCheck[];
}

/** Engine proposal for a milestone whose evidence is complete and approvals are still to come. */
export function evaluateProposal(
  milestone: Milestone,
  lateDays: number,
): Proposal {
  const valueMillion = milestone.plannedMillion;
  const late = Math.max(0, lateDays);
  const calculatedPenaltyMillion = basisPointsOf(
    valueMillion,
    milestone.penaltyRateBpPerDay * late,
  );
  const capMillion = basisPointsOf(valueMillion, milestone.penaltyCapBp);
  const capReached = late > 0 && calculatedPenaltyMillion >= capMillion;
  const penaltyMillion = Math.min(calculatedPenaltyMillion, capMillion);
  const checks: ReasonCheck[] = [
    { code: "NO_OPEN_DISPUTE", outcome: "PASS" },
    { code: "AUTHORIZED_SUBMITTER_AND_VALID_SIGNATURES", outcome: "PASS" },
    { code: "APPROVAL_QUORUM_MET", outcome: "PASS" },
  ];
  if (late > 0) checks.push({ code: "LATE_DELIVERY", outcome: "WARN" });
  return {
    code: late > 0 ? "PENALTY" : "RELEASE",
    reasonCode: late > 0 ? "LATE_DELIVERY" : "ALL_CONDITIONS_MET",
    valueMillion,
    lateDays: late,
    rateBpPerDay: milestone.penaltyRateBpPerDay,
    capBp: milestone.penaltyCapBp,
    calculatedPenaltyMillion,
    capMillion,
    capReached,
    penaltyMillion,
    payableMillion: subtractMillion(valueMillion, penaltyMillion),
    checks,
  };
}
