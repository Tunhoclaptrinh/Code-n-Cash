import type { ComponentType } from "react";
import {
  AuditOutlined,
  CloudUploadOutlined,
  DatabaseOutlined,
  FileProtectOutlined,
  FileTextOutlined,
  InboxOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import type { Role } from "../api/types";

export type NavKey =
  | "tasks"
  | "contracts"
  | "upload"
  | "activity"
  | "verify"
  | "submissions"
  | "approvals"
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

/** Sections are separated by a divider in the sidebar. */
export type NavSection = NavItem[];

/** Resources of Administration, in the order of the API definitions. */
export const PLATFORM_RESOURCES = [
  "organizations",
  "users",
  "contract-drafts",
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
  children: PLATFORM_RESOURCES.map((name) => ({
    to: `/platform/${name}`,
    labelKey: `resources.${name}`,
    ns: "platform" as const,
  })),
};

const ownerWorkflow = [tasks, contracts, upload, activity, verify];

export const navByRole: Record<Role, NavSection[]> = {
  CONTRACT_OWNER: [ownerWorkflow, [data]],
  LEGAL_REVIEWER: [ownerWorkflow, [data]],
  ADMIN_AUDITOR: [ownerWorkflow, [data, platform]],
  SUPPLIER: [
    [
      tasks,
      { ...contracts, labelKey: "nav.myContracts" },
      {
        key: "submissions",
        to: "/submissions",
        icon: FileProtectOutlined,
        labelKey: "nav.submissions",
      },
      verify,
    ],
  ],
  FINANCE_APPROVER: [
    [
      {
        key: "approvals",
        to: "/approvals",
        icon: InboxOutlined,
        labelKey: "nav.approvals",
        badge: true,
      },
      contracts,
      activity,
      verify,
    ],
    [data],
  ],
};

/** First screen after signing in. */
export const homeByRole: Record<Role, string> = {
  CONTRACT_OWNER: "/contracts",
  LEGAL_REVIEWER: "/contracts",
  ADMIN_AUDITOR: "/activity-log",
  SUPPLIER: "/tasks",
  FINANCE_APPROVER: "/approvals",
};
