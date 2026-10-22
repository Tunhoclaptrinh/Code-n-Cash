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

export interface NavItem {
  key: NavKey;
  to: string;
  icon: ComponentType;
  /** Translation key; `ns` defaults to `common`. */
  labelKey: string;
  ns?: "common" | "platform";
  /** Shows the pending-task count; the bell in the header links here. */
  badge?: boolean;
}

export interface NavGroup {
  /** Translation key inside `common`. */
  labelKey: string;
  items: NavItem[];
}

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
};

const ownerWorkflow = [tasks, contracts, upload, activity, verify];

export const navByRole: Record<Role, NavGroup[]> = {
  CONTRACT_OWNER: [
    { labelKey: "nav.groups.workflow", items: ownerWorkflow },
    { labelKey: "nav.groups.data", items: [data] },
  ],
  LEGAL_REVIEWER: [
    { labelKey: "nav.groups.workflow", items: ownerWorkflow },
    { labelKey: "nav.groups.data", items: [data] },
  ],
  ADMIN_AUDITOR: [
    { labelKey: "nav.groups.workflow", items: ownerWorkflow },
    { labelKey: "nav.groups.data", items: [data, platform] },
  ],
  SUPPLIER: [
    {
      labelKey: "nav.groups.workflow",
      items: [
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
    },
  ],
  FINANCE_APPROVER: [
    {
      labelKey: "nav.groups.workflow",
      items: [
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
    },
    { labelKey: "nav.groups.data", items: [data] },
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
