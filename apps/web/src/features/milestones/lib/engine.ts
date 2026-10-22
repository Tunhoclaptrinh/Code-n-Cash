import type { DecisionCode, ReasonCode, ReasonCheck } from "../types";
/** View model only. Workflow computation lives in apps/api; Data Pack evaluation lives in apps/engine. */
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
