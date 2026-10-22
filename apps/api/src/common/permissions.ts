import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SetMetadata } from "@nestjs/common";
import type { Role } from "./types";

export type PermissionScope = "all" | "org" | "own" | "assigned";
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

/** The matrix in packages/contracts/permissions.json is the only place roles get rights. */
export const matrix: PermissionMatrix = JSON.parse(
  readFileSync(
    resolve(
      process.env.REPO_ROOT ?? process.cwd(),
      "packages/contracts/permissions.json",
    ),
    "utf8",
  ),
);

const granted = new Map<Role, Map<string, PermissionScope>>();
for (const module of matrix.modules)
  for (const permission of module.permissions)
    for (const [role, scope] of Object.entries(permission.grants)) {
      if (!granted.has(role as Role)) granted.set(role as Role, new Map());
      granted.get(role as Role)!.set(permission.key, scope as PermissionScope);
    }

export function can(role: Role, permission: string): boolean {
  return granted.get(role)?.has(permission) ?? false;
}

export function scopeOf(
  role: Role,
  permission: string,
): PermissionScope | undefined {
  return granted.get(role)?.get(permission);
}

export function permissionsFor(role: Role): string[] {
  return [...(granted.get(role)?.keys() ?? [])].sort();
}

export const PERMISSION_KEY = "permission";
/** Requires a permission from the matrix; checked by RolesGuard after authentication. */
export const RequirePermission = (permission: string) =>
  SetMetadata(PERMISSION_KEY, permission);
