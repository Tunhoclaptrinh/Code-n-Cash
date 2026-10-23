import type { Decision, Role } from "./workflow";
export * from "./workflow";
export * from "./listing";
export * from "./field-validation";
export interface PageQuery {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  filters?: Record<string, string | number | boolean>;
}
export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  requestId?: string;
}
export interface ApiProblem {
  statusCode: number;
  code: string;
  message: string | string[];
  requestId?: string;
}
export interface Entity {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}
export interface Actor {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  organizationId: string;
  roleChipOrganization: string;
  /** Data Pack party the user acts as; null for internal staff. */
  partyId: string | null;
  title: string;
  permissions: string[];
}
export interface AuthResult {
  token: string;
  user: Actor;
}
export interface ResourceField {
  key: string;
  type: "string" | "email" | "number" | "boolean" | "select";
  required?: boolean;
  options?: string[];
  /** Resource this field references by id; forms populate it and the API checks it exists. */
  ref?: string;
  min?: number;
  max?: number;
  integer?: boolean;
  maxLength?: number;
  pattern?: string;
}
export interface ResourceDefinition {
  name: string;
  fields: ResourceField[];
  readOnly?: boolean;
  /** Records with these origins belong to the Data Pack or the workflow: CRUD may read, not change them. */
  managedOrigins?: string[];
}
export const roles: Role[] = [
  "CONTRACT_OWNER",
  "FINANCE_APPROVER",
  "SECONDARY_APPROVER",
  "LEGAL_REVIEWER",
  "ADMIN_AUDITOR",
  "SYSTEM_ADMIN",
  "AUDITOR",
  "SUPPLIER",
];
export const decisions: Decision[] = ["RELEASE", "HOLD", "REJECT", "PENALTY"];
export function pageResult<T>(
  items: T[],
  total: number,
  page: number,
  limit: number,
): PageResult<T> {
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

/** all = every organization, org = own organization, own = records the user is party to, assigned = steps assigned to the user. */
export type PermissionScope = "all" | "org" | "own" | "assigned";
/** Shape of packages/contracts/permissions.json, served read-only by GET /permissions. */
export interface PermissionMatrix {
  roles: Role[];
  modules: {
    key: string;
    permissions: {
      key: string;
      grants: Partial<Record<Role, PermissionScope>>;
    }[];
  }[];
}
/** Import dry-run report from POST /resources/:resource/import/validate. */
export interface ImportValidationReport {
  summary: { total: number; valid: number; error: number };
  results: {
    row: number;
    data: Record<string, unknown>;
    status: "valid" | "invalid";
    errors: string[];
  }[];
}

export * from "./trust";
