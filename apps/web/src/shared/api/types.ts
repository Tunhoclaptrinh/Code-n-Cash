import type { Actor } from "@codecash/contracts";
export type { Role } from "@codecash/contracts";

export interface Organization {
  id: string;
  name: string;
}

export type User = Actor;

export type ContractStatus =
  "AWAITING_SIGNATURE" | "DISPUTED" | "AWAITING_EVIDENCE" | "COMPLETED";

export type ContractWaitingFor =
  | { kind: "OWNER_SIGNS_FIRST" }
  | { kind: "OWNER_RESOLVES_DISPUTE"; milestoneNo: number }
  | { kind: "SUPPLIER_SUBMITS_EVIDENCE"; milestoneNo: number }
  | { kind: "NOTHING" };

export interface ContractSummary {
  code: string;
  title: string;
  supplierId: string;
  /** Contract value in millions of VND. */
  valueMillion: number;
  milestonesDone: number;
  milestonesTotal: number;
  /** Number of completed milestones that were paid with a deduction. */
  deductedMilestones: number;
  status: ContractStatus;
  waitingFor: ContractWaitingFor;
  isNewlyDigitized: boolean;
}
