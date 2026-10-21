export type ActivityCategory = 'SYSTEM' | 'APPROVAL' | 'EVIDENCE' | 'DISPUTE' | 'SIGN';

export type ActorRole = 'SYSTEM' | 'CONTRACT_OWNER' | 'FINANCE_APPROVER' | 'SUPPLIER' | 'LEGAL';

export type ActivityAction =
  | { kind: 'DECISION_FINALIZED'; decision: string; amountMillion: number }
  | { kind: 'DECISION_APPROVED_AND_SIGNED' }
  | { kind: 'EVIDENCE_CHECKED'; decision: string; amountMillion: number }
  | { kind: 'EVIDENCE_SUBMITTED'; document: 'INVOICE' | 'DELIVERY_RECORD' }
  | { kind: 'DISPUTE_OPENED'; milestoneKind: 'DELIVERY' }
  | { kind: 'CONTRACT_SIGNED'; step: number; totalSteps: number; isFinal: boolean }
  | { kind: 'DIGITIZATION_CONFIRMED'; milestoneCount: number };

export interface ActivityActor {
  id: string;
  /** Null for the system actor, whose name is translated at render time. */
  displayName: string | null;
  role: ActorRole;
}

/** One append-only audit record. */
export interface ActivityEntry {
  id: string;
  /** Local ISO timestamp. */
  at: string;
  actor: ActivityActor;
  category: ActivityCategory;
  action: ActivityAction;
  contractCode: string;
  milestoneNo?: number;
}

export interface ActivityFilters {
  contractCode: string;
  actorId: string;
  category: ActivityCategory | '';
  /** `yyyy-mm-dd`, empty for no lower bound. */
  from: string;
  /** `yyyy-mm-dd`, empty for no upper bound. */
  to: string;
}
