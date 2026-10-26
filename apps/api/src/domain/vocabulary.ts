import type {
  ApprovalRole,
  BusinessEventType,
  ContractType,
  EventStatus,
  EventType,
  MilestoneStatus,
  ReasonCode,
  Role,
  Side,
  WorkflowTemplate,
} from "./types";

/**
 * Spec 4.2: the side that may create each business event. The engine enforces it when deciding;
 * the API uses the same table so a user can only record the events of their own side (spec 17).
 */
export const AUTHORITY: Record<BusinessEventType, Side> = {
  CONTRACT_SIGNED: "BUYER",
  KICKOFF_CONFIRMED: "BUYER",
  REQUIREMENTS_APPROVED: "BUYER",
  UAT_PASSED: "BUYER",
  ACCEPTANCE: "BUYER",
  DELIVERY: "SUPPLIER",
  INVOICE: "SUPPLIER",
  GO_LIVE: "SUPPLIER",
  SERVICE_ACTIVATED: "SUPPLIER",
  SERVICE_COMPLETED: "SUPPLIER",
  WARRANTY_COMPLETED: "SUPPLIER",
};

/**
 * Roles of the platform operator (organisation OPS). None of them is a party to a contract, so
 * none of them reads contract content: the administrator configures, the integrity checker sees
 * hashes, anchors and proofs only (spec 2.2).
 */
export const INTERNAL_ROLES: Role[] = ["SYSTEM_ADMIN", "AUDITOR"];

export const BUSINESS_EVENTS = Object.keys(AUTHORITY) as BusinessEventType[];

/** BR-05: the status each event type is recorded with. */
export const VALID_STATUS: Record<EventType, EventStatus> = {
  ...(Object.fromEntries(
    BUSINESS_EVENTS.map((type) => [type, "CONFIRMED"]),
  ) as Record<BusinessEventType, EventStatus>),
  APPROVAL: "APPROVED",
  REJECTION: "REJECTED",
  DISPUTE_OPENED: "OPEN",
  DISPUTE_RESOLVED: "RESOLVED",
};

/** Spec 9.1: milestone status for each reason code. */
export const STATUS_BY_REASON: Record<ReasonCode, MilestoneStatus> = {
  OPEN_DISPUTE: "ON_HOLD",
  REJECTION_PRESENT: "REJECTED",
  UNAUTHORIZED_EVENT: "ON_HOLD",
  MISSING_REQUIRED_EVENT: "WAITING_EVIDENCE",
  APPROVAL_QUORUM_NOT_MET: "WAITING_APPROVAL",
  LATE_COMPLETION: "PAID_WITH_PENALTY",
  ALL_CONDITIONS_MET: "ELIGIBLE_FOR_PAYMENT",
  UNRESOLVED_CONDITION: "ON_HOLD",
};

/** Contract type → workflow and rule set, as in contracts.csv (100/100 contracts). */
export const WORKFLOW_BY_TYPE: Record<
  ContractType,
  { template: WorkflowTemplate; ruleSetId: string }
> = {
  GOODS_SUPPLY: { template: "WF_GOODS_4STAGE", ruleSetId: "R_GOODS_STD" },
  SERVICES: { template: "WF_SERVICE_4STAGE", ruleSetId: "R_SERVICE_STD" },
  SOFTWARE_IMPLEMENTATION: {
    template: "WF_SOFTWARE_5STAGE",
    ruleSetId: "R_SOFTWARE_STD",
  },
  MAINTENANCE: {
    template: "WF_MAINTENANCE_3STAGE",
    ruleSetId: "R_MAINTENANCE_STD",
  },
};

export const CONTRACT_TYPES = Object.keys(WORKFLOW_BY_TYPE) as ContractType[];

export const APPROVAL_ROLES: ApprovalRole[] = [
  "CONTRACT_OWNER",
  "FINANCE_APPROVER",
  "SECONDARY_APPROVER",
];

/** Milestone statuses that new events can no longer change (spec 9.4). */
export const TERMINAL: MilestoneStatus[] = ["REJECTED", "COMPLETED"];

export const isBusinessEvent = (type: string): type is BusinessEventType =>
  type in AUTHORITY;
