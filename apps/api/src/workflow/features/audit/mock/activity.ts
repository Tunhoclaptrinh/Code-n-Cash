import type { ActivityActor, ActivityEntry } from "../types";

const system: ActivityActor = {
  id: "system",
  displayName: null,
  role: "SYSTEM",
};
const financeApprover: ActivityActor = {
  id: "u-finance-approver",
  displayName: "Lê Thu Hà",
  role: "FINANCE_APPROVER",
};
const contractOwner: ActivityActor = {
  id: "u-owner",
  displayName: "Nguyễn Văn An",
  role: "CONTRACT_OWNER",
};
const supplier: ActivityActor = {
  id: "u-supplier",
  displayName: "Trần Quốc Phú",
  role: "SUPPLIER",
};
const legal: ActivityActor = {
  id: "u-legal",
  displayName: "Nova An Pháp chế",
  role: "LEGAL",
};

/** Append-only history, newest first. */
export const seedActivity: ActivityEntry[] = [
  {
    id: "act-10",
    at: "2026-07-04T08:57:00",
    actor: system,
    category: "SYSTEM",
    action: {
      kind: "DECISION_FINALIZED",
      decision: "PENALTY",
      amountMillion: 949.92,
    },
    contractCode: "CT0101",
    milestoneNo: 2,
  },
  {
    id: "act-09",
    at: "2026-07-04T08:57:00",
    actor: financeApprover,
    category: "APPROVAL",
    action: { kind: "DECISION_APPROVED_AND_SIGNED" },
    contractCode: "CT0101",
    milestoneNo: 2,
  },
  {
    id: "act-08",
    at: "2026-07-04T08:50:00",
    actor: contractOwner,
    category: "APPROVAL",
    action: { kind: "DECISION_APPROVED_AND_SIGNED" },
    contractCode: "CT0101",
    milestoneNo: 2,
  },
  {
    id: "act-07",
    at: "2026-07-03T09:32:00",
    actor: system,
    category: "SYSTEM",
    action: {
      kind: "EVIDENCE_CHECKED",
      decision: "PENALTY",
      amountMillion: 10.08,
    },
    contractCode: "CT0101",
    milestoneNo: 2,
  },
  {
    id: "act-06",
    at: "2026-07-03T09:31:00",
    actor: supplier,
    category: "EVIDENCE",
    action: { kind: "EVIDENCE_SUBMITTED", document: "INVOICE" },
    contractCode: "CT0101",
    milestoneNo: 2,
  },
  {
    id: "act-05",
    at: "2026-07-03T09:14:00",
    actor: supplier,
    category: "EVIDENCE",
    action: { kind: "EVIDENCE_SUBMITTED", document: "DELIVERY_RECORD" },
    contractCode: "CT0101",
    milestoneNo: 2,
  },
  {
    id: "act-04",
    at: "2026-06-02T11:05:00",
    actor: supplier,
    category: "DISPUTE",
    action: { kind: "DISPUTE_OPENED", milestoneKind: "DELIVERY" },
    contractCode: "CT0019",
    milestoneNo: 2,
  },
  {
    id: "act-03",
    at: "2026-05-11T14:08:00",
    actor: supplier,
    category: "SIGN",
    action: { kind: "CONTRACT_SIGNED", step: 2, totalSteps: 2, isFinal: true },
    contractCode: "CT0101",
  },
  {
    id: "act-02",
    at: "2026-05-11T13:52:00",
    actor: contractOwner,
    category: "SIGN",
    action: { kind: "CONTRACT_SIGNED", step: 1, totalSteps: 2, isFinal: false },
    contractCode: "CT0101",
  },
  {
    id: "act-01",
    at: "2026-05-09T16:30:00",
    actor: legal,
    category: "SYSTEM",
    action: { kind: "DIGITIZATION_CONFIRMED", milestoneCount: 4 },
    contractCode: "CT0101",
  },
];

/** Date range the log opens with (`yyyy-mm-dd`). */
export const defaultRange = { from: "2026-05-01", to: "2026-07-31" };
