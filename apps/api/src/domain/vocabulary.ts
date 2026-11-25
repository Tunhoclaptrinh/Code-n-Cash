import { enginePolicy, evidenceSides } from "./policy";
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
 * Spec 2.1: the side that may create each business event, read from the engine policy pack. The engine
 * enforces it when deciding; the API uses the same table so a user can only record the events of their
 * own side (spec 2.2).
 */
export const AUTHORITY = evidenceSides() as Record<BusinessEventType, Side>;

/**
 * Roles of the platform operator (organisation OPS). None of them is a party to a contract, so
 * none of them reads contract content: the administrator configures, the integrity checker sees
 * hashes, anchors and proofs only (spec 2.2).
 */
export const INTERNAL_ROLES: Role[] = ["SYSTEM_ADMIN", "AUDITOR"];

/**
 * Roles a company administrator may give, by the kind of its company (same table as
 * ORG_ADMIN_ASSIGNABLE in packages/contracts). Controllers, other administrators and platform
 * roles stay with the system administrator, so a company never appoints its own controller (SoD-1).
 */
export const ORG_ADMIN_ASSIGNABLE: Record<"BUYER" | "SUPPLIER", Role[]> = {
  BUYER: [
    "CONTRACT_OWNER",
    "FINANCE_APPROVER",
    "SECONDARY_APPROVER",
    "LEGAL_REVIEWER",
  ],
  SUPPLIER: ["SUPPLIER"],
};

/**
 * Why a company administrator may not hold `account` (role, company, party), or null when it may:
 * a business account of its own company, acting for that company or one of its approvers.
 */
export function orgAdminRefusal(
  actor: { role: Role; organizationId: string },
  account: { role?: unknown; organizationId?: unknown; partyId?: unknown },
  tables: { organizations: RecordLike[]; parties: RecordLike[] },
): string | null {
  if (actor.role !== "ORG_ADMIN") return null;
  if (account.organizationId !== actor.organizationId)
    return "OTHER_ORGANIZATION";
  const kind = tables.organizations.find(
    (org) => org.id === actor.organizationId,
  )?.kind as "BUYER" | "SUPPLIER" | undefined;
  if (!kind || !ORG_ADMIN_ASSIGNABLE[kind]?.includes(account.role as Role))
    return "ROLE_NOT_ASSIGNABLE";
  const party = account.partyId;
  if (party !== undefined && party !== null && party !== "") {
    const row = tables.parties.find((p) => p.party_id === party);
    if (
      !row ||
      (row.party_id !== actor.organizationId &&
        row.parent_party_id !== actor.organizationId)
    )
      return "OTHER_ORGANIZATION";
  }
  return null;
}
type RecordLike = Record<string, unknown>;

export const BUSINESS_EVENTS = Object.keys(AUTHORITY) as BusinessEventType[];

/** BR-05: the status each event type is recorded with (engine policy). */
export const VALID_STATUS = Object.fromEntries(
  Object.entries(enginePolicy.event_types).map(([type, kind]) => [
    type,
    kind.valid_status,
  ]),
) as Record<EventType, EventStatus>;

/** Spec 9.2: milestone status for each reason code (engine policy). */
export const STATUS_BY_REASON = Object.fromEntries(
  Object.entries(enginePolicy.reasons).map(([reason, entry]) => [
    reason,
    entry.status,
  ]),
) as Record<ReasonCode, MilestoneStatus>;

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
