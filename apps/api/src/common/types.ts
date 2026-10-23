import type { Role } from "../domain/types";
export type { Role };
export interface Actor {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  organizationId: string;
  roleChipOrganization: string;
  /** Data Pack party the user acts as: approver, buyer or supplier; null for internal staff. */
  partyId: string | null;
  title: string;
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
  /** Records with these origins belong to the Data Pack or the workflow: CRUD may read, not change them. */
  managedOrigins?: string[];
}
export interface SessionRequest {
  user: Actor;
  requestId: string;
}
