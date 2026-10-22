export type Decision = "RELEASE" | "HOLD" | "REJECT" | "PENALTY";
export type Role =
  | "CONTRACT_OWNER"
  | "LEGAL_REVIEWER"
  | "FINANCE_APPROVER"
  | "ADMIN_AUDITOR"
  | "SUPPLIER";
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
}
export interface ResourceDefinition {
  name: string;
  fields: ResourceField[];
  readOnly?: boolean;
}
export const roles: Role[] = [
  "CONTRACT_OWNER",
  "LEGAL_REVIEWER",
  "FINANCE_APPROVER",
  "ADMIN_AUDITOR",
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
