import { useMemo } from "react";
/** Presentation guard only; API authorization always remains authoritative. */
export function useAccess(
  actor?: { permissions?: readonly string[]; role?: string } | null,
) {
  return useMemo(() => {
    const granted = new Set(actor?.permissions ?? []);
    const hasPermission = (permission: string) =>
      granted.has("manage:all") || granted.has(permission);
    return {
      hasPermission,
      hasAnyPermission: (permissions: string[]) =>
        permissions.some(hasPermission),
      hasAllPermissions: (permissions: string[]) =>
        permissions.every(hasPermission),
      isAdmin: granted.has("manage:all"),
      role: actor?.role,
    };
  }, [actor]);
}
