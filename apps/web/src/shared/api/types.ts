import type { Actor } from "@codecash/contracts";
export type { Role, ContractStatus } from "@codecash/contracts";

export interface Organization {
  id: string;
  name: string;
}

export type User = Actor;
