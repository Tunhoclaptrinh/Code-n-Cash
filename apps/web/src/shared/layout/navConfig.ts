import type { ComponentType } from "react";
import {
  AuditOutlined,
  DashboardOutlined,
  CloudUploadOutlined,
  DatabaseOutlined,
  ExceptionOutlined,
  FileProtectOutlined,
  FileTextOutlined,
  InboxOutlined,
  ReadOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import type { Role } from "../api/types";

export type NavKey =
  | "dashboard"
  | "tasks"
  | "contracts"
  | "upload"
  | "activity"
  | "verify"
  | "exceptions"
  | "integrity"
  | "guide"
  | "data"
  | "platform";

export interface NavChild {
  /** Route path; also the menu key so the open route is highlighted. */
  to: string;
  labelKey: string;
  ns?: "common" | "platform";
}

export interface NavItem {
  key: NavKey;
  to: string;
  icon: ComponentType;
  /** Translation key; `ns` defaults to `common`. */
  labelKey: string;
  ns?: "common" | "platform";
  /** Shows the pending-task count; the header bell opens this inbox. */
  badge?: boolean;
  /** Rendered as an always-open submenu, as in the UniFlow sidebar. */
  children?: NavChild[];
}

/** A business area of the sidebar, shown under its own heading. */
export interface NavSection {
  /** Translation key inside `common`. */
  labelKey: string;
  items: NavItem[];
}

/** Resources of Administration, in the order of the API definitions. */
export const PLATFORM_RESOURCES = [
  "organizations",
  "users",
  "contract-drafts",
  "contract-templates",
  "milestone-templates",
  "settings",
  "documents",
  "audit",
] as const;

const tasks: NavItem = {
  key: "tasks",
  to: "/tasks",
  icon: InboxOutlined,
  labelKey: "nav.tasks",
  badge: true,
};
const contracts: NavItem = {
  key: "contracts",
  to: "/contracts",
  icon: FileTextOutlined,
  labelKey: "nav.contracts",
};
const upload: NavItem = {
  key: "upload",
  to: "/contracts/new",
  icon: CloudUploadOutlined,
  labelKey: "nav.upload",
};
const activity: NavItem = {
  key: "activity",
  to: "/activity-log",
  icon: AuditOutlined,
  labelKey: "nav.activity",
};
const verify: NavItem = {
  key: "verify",
  to: "/verify",
  icon: SafetyCertificateOutlined,
  labelKey: "nav.verify",
};
const data: NavItem = {
  key: "data",
  to: "/data",
  icon: DatabaseOutlined,
  labelKey: "data.title",
  ns: "platform",
};
const platform: NavItem = {
  key: "platform",
  to: "/platform/organizations",
  icon: SettingOutlined,
  labelKey: "title",
  ns: "platform",
  children: [
    { to: "/platform/anchors", labelKey: "anchorsTitle", ns: "platform" },
    { to: "/platform/rule-versions", labelKey: "rulesTitle", ns: "platform" },
    ...PLATFORM_RESOURCES.map((name) => ({
      to: `/platform/${name}`,
      labelKey: `resources.${name}`,
      ns: "platform" as const,
    })),
    {
      to: "/platform/permissions",
      labelKey: "permissions.title",
      ns: "platform",
    },
  ],
};

const workflow = (items: NavItem[]): NavSection => ({
  labelKey: "nav.groups.workflow",
  items,
});
const monitoring = (items: NavItem[]): NavSection => ({
  labelKey: "nav.groups.monitoring",
  items,
});
const dataAndAdmin = (items: NavItem[]): NavSection => ({
  labelKey: "nav.groups.data",
  items,
});

const dashboard: NavItem = {
  key: "dashboard",
  to: "/dashboard",
  icon: DashboardOutlined,
  labelKey: "nav.dashboard",
};
const exceptions: NavItem = {
  key: "exceptions",
  to: "/exceptions",
  icon: ExceptionOutlined,
  labelKey: "nav.exceptions",
};
const guide: NavItem = {
  key: "guide",
  to: "/guide",
  icon: ReadOutlined,
  labelKey: "nav.guide",
};
const help: NavSection = { labelKey: "nav.groups.help", items: [guide] };
const integrity: NavItem = {
  key: "integrity",
  to: "/integrity",
  icon: FileProtectOutlined,
  labelKey: "nav.integrity",
};

/** Buyer-side roles share the same areas; what each may do inside them comes from permissions.json. */
const buyer = (withUpload: boolean): NavSection[] => [
  workflow(
    withUpload
      ? [tasks, contracts, upload, verify]
      : [tasks, contracts, verify],
  ),
  monitoring([dashboard, activity]),
  dataAndAdmin([data]),
];

const byRole: Record<Role, NavSection[]> = {
  CONTRACT_OWNER: buyer(true),
  LEGAL_REVIEWER: buyer(true),
  FINANCE_APPROVER: buyer(false),
  SECONDARY_APPROVER: buyer(false),
  // The buyer's own controller checks exception proposals on its organisation's contracts.
  ADMIN_AUDITOR: [
    workflow([tasks, contracts, verify]),
    monitoring([dashboard, exceptions, activity]),
    dataAndAdmin([data]),
  ],
  // Platform roles: the administrator configures, the integrity checker sees hashes and proofs
  // only. Neither opens a contract (spec 2.2).
  SYSTEM_ADMIN: [dataAndAdmin([platform])],
  AUDITOR: [monitoring([integrity]), dataAndAdmin([platform])],
  SUPPLIER: [
    workflow([tasks, { ...contracts, labelKey: "nav.myContracts" }, verify]),
    monitoring([dashboard, activity]),
  ],
};

/** Every role ends with the user guide. */
export const navByRole = Object.fromEntries(
  Object.entries(byRole).map(([role, sections]) => [role, [...sections, help]]),
) as Record<Role, NavSection[]>;

/**
 * The read permission each screen needs (packages/contracts/permissions.json). A path with no entry
 * is open to every signed-in user; the API still checks every call.
 */
const ROUTE_PERMISSIONS: [path: string, permission: string][] = [
  ["/contracts/new", "contracts:draft-write"],
  ["/contracts", "contracts:read"],
  ["/verify", "signing:verify"],
  ["/dashboard", "contracts:read"],
  ["/tasks", "tasks:read"],
  ["/activity-log", "activity:read"],
  ["/exceptions", "exceptions:read"],
  ["/integrity", "audit:read"],
  ["/data", "engine:read"],
  ["/platform/anchors", "anchors:read"],
  ["/platform/rule-versions", "rules:read"],
  ["/platform/permissions", "permissions:read"],
  ...PLATFORM_RESOURCES.map((name): [string, string] => [
    `/platform/${name}`,
    `${name}:read`,
  ]),
];

/** Whether the signed-in user may open a screen: the first (most specific) matching entry decides. */
export function routeAllowed(path: string, permissions: readonly string[]) {
  const entry = ROUTE_PERMISSIONS.find(
    ([prefix]) => path === prefix || path.startsWith(`${prefix}/`),
  );
  return !entry || permissions.includes(entry[1]);
}

/** The role's sidebar without the screens its permissions do not open. */
export function navFor(role: Role, permissions: readonly string[]) {
  const open = (to: string) => routeAllowed(to, permissions);
  return navByRole[role]
    .map((section) => ({
      ...section,
      items: section.items.flatMap((item) => {
        if (!item.children) return open(item.to) ? [item] : [];
        const children = item.children.filter((child) => open(child.to));
        return children.length ? [{ ...item, children }] : [];
      }),
    }))
    .filter((section) => section.items.length > 0);
}

/** First screen after signing in: the work waiting for the user. */
export const homeByRole: Record<Role, string> = {
  CONTRACT_OWNER: "/tasks",
  LEGAL_REVIEWER: "/tasks",
  FINANCE_APPROVER: "/tasks",
  SECONDARY_APPROVER: "/tasks",
  ADMIN_AUDITOR: "/exceptions",
  SYSTEM_ADMIN: "/platform/organizations",
  AUDITOR: "/integrity",
  SUPPLIER: "/tasks",
};
