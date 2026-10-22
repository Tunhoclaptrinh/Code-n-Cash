import type { Role } from "../api/types";
import type { IconName } from "../ui/Icon";

export type NavKey =
  | "tasks"
  | "contracts"
  | "upload"
  | "activity"
  | "verify"
  | "submissions"
  | "approvals";

export interface NavItem {
  key: NavKey;
  to: string;
  icon: IconName;
  /** Translation key inside the `common` namespace. */
  labelKey: string;
  /** Where the pending-task badge is shown. */
  badge?: boolean;
}

const owner: NavItem[] = [
  {
    key: "tasks",
    to: "/tasks",
    icon: "inbox",
    labelKey: "nav.tasks",
    badge: true,
  },
  {
    key: "contracts",
    to: "/contracts",
    icon: "file",
    labelKey: "nav.contracts",
  },
  {
    key: "upload",
    to: "/contracts/new",
    icon: "upload",
    labelKey: "nav.upload",
  },
  {
    key: "activity",
    to: "/activity-log",
    icon: "clock",
    labelKey: "nav.activity",
  },
  { key: "verify", to: "/verify", icon: "shield", labelKey: "nav.verify" },
];

export const navByRole: Record<Role, NavItem[]> = {
  CONTRACT_OWNER: owner,
  LEGAL_REVIEWER: owner,
  ADMIN_AUDITOR: owner,
  SUPPLIER: [
    {
      key: "tasks",
      to: "/tasks",
      icon: "inbox",
      labelKey: "nav.tasks",
      badge: true,
    },
    {
      key: "contracts",
      to: "/contracts",
      icon: "file",
      labelKey: "nav.myContracts",
    },
    {
      key: "submissions",
      to: "/submissions",
      icon: "upload",
      labelKey: "nav.submissions",
    },
    { key: "verify", to: "/verify", icon: "shield", labelKey: "nav.verify" },
  ],
  FINANCE_APPROVER: [
    {
      key: "approvals",
      to: "/approvals",
      icon: "inbox",
      labelKey: "nav.approvals",
      badge: true,
    },
    {
      key: "contracts",
      to: "/contracts",
      icon: "file",
      labelKey: "nav.contracts",
    },
    {
      key: "activity",
      to: "/activity-log",
      icon: "clock",
      labelKey: "nav.activity",
    },
    { key: "verify", to: "/verify", icon: "shield", labelKey: "nav.verify" },
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
