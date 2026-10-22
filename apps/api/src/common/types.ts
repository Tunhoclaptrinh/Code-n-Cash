export type Role =
  | "CONTRACT_OWNER"
  | "LEGAL_REVIEWER"
  | "FINANCE_APPROVER"
  | "ADMIN_AUDITOR"
  | "SUPPLIER";
export interface Actor {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  organizationId: string;
  roleChipOrganization: string;
  permissions: string[];
  active?: boolean;
}
export interface RecordEntity {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  organizationId?: string;
  [key: string]: unknown;
}
export interface Field {
  key: string;
  type: string;
  required?: boolean;
  options?: string[];
  /** Name of the resource this field points to (by id). */
  ref?: string;
}
export interface Resource {
  name: string;
  fields: Field[];
  readOnly?: boolean;
}
export interface SessionRequest {
  user: Actor;
  requestId: string;
}
