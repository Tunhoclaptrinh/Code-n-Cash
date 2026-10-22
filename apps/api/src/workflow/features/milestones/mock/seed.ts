import type {
  ApprovalCase,
  ContractKind,
  EvidenceFile,
  HistoryEvent,
  Milestone,
  MilestoneDecision,
  Participant,
  Task,
} from "../types";
import { evaluateProposal } from "../lib/engine";
import { daysBetween } from "../lib/dates";

/** Fixed business clock so overdue counts and timestamps are reproducible. */
const CLOCK_ORIGIN = Date.parse("2026-07-03T09:31:00");
const CLOCK_STARTED = Date.now();

const pad = (value: number) => String(value).padStart(2, "0");

function businessNow(): Date {
  return new Date(CLOCK_ORIGIN + (Date.now() - CLOCK_STARTED));
}

export function businessToday(): string {
  const now = businessNow();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function businessTimestamp(): string {
  const now = businessNow();
  return `${businessToday()}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

const SUPPLIER_REP = "Trần Quốc Phú";

const milestones: Milestone[] = [
  {
    contractId: "CT0101",
    no: 1,
    kind: "SIGNING",
    plannedMillion: 480,
    dueDate: "2026-05-15",
    status: "RELEASE",
    requiredEvidence: [],
    submitterRole: "CONTRACT_OWNER",
    completedOn: "2026-05-11",
    penaltyRateBpPerDay: 35,
    penaltyCapBp: 800,
  },
  {
    contractId: "CT0101",
    no: 2,
    kind: "DELIVERY",
    plannedMillion: 960,
    dueDate: "2026-06-30",
    status: "PENALTY",
    requiredEvidence: ["DELIVERY_REPORT", "INVOICE"],
    submitterRole: "SUPPLIER",
    deliveredOn: "2026-07-03",
    penaltyRateBpPerDay: 35,
    penaltyCapBp: 800,
  },
  {
    contractId: "CT0101",
    no: 3,
    kind: "ACCEPTANCE",
    plannedMillion: 720,
    dueDate: "2026-07-31",
    status: "NOT_DUE",
    requiredEvidence: ["ACCEPTANCE_REPORT"],
    submitterRole: "SUPPLIER",
    penaltyRateBpPerDay: 35,
    penaltyCapBp: 800,
  },
  {
    contractId: "CT0101",
    no: 4,
    kind: "WARRANTY",
    plannedMillion: 240,
    dueDate: "2027-07-31",
    status: "NOT_OPEN",
    requiredEvidence: ["WARRANTY_END_REPORT"],
    submitterRole: "SUPPLIER",
    opensAfterNo: 3,
    penaltyRateBpPerDay: 35,
    penaltyCapBp: 800,
  },
];

const participants: Record<string, Participant[]> = {
  CT0101: [
    {
      id: "p-owner",
      name: "Nguyễn Văn An",
      role: "CONTRACT_OWNER",
      side: "BUYER",
    },
    {
      id: "p-finance",
      name: "Lê Thu Hà",
      role: "FINANCE_APPROVER",
      side: "BUYER",
    },
    {
      id: "p-second",
      name: "Phạm Minh Đức",
      role: "SECOND_APPROVER",
      side: "BUYER",
    },
    {
      id: "p-supplier",
      name: SUPPLIER_REP,
      role: "SUPPLIER_REPRESENTATIVE",
      side: "SUPPLIER",
    },
  ],
};

const evidenceDraft: Record<string, EvidenceFile[]> = {
  "CT0101:2": [
    {
      id: "f-delivery-report",
      type: "DELIVERY_REPORT",
      fileName: "BBGH_CT0101.pdf",
      sizeMb: 0.9,
      pages: 3,
      signature: {
        signerName: SUPPLIER_REP,
        signedAt: "2026-07-03T09:14:00",
        valid: true,
      },
    },
    {
      id: "f-invoice",
      type: "INVOICE",
      fileName: "HD_0000412.pdf",
      sizeMb: 0.4,
      pages: 1,
      signingMethod: "VIETTEL_MYSIGN",
      signaturePosition: { page: 1, corner: "BOTTOM_RIGHT" },
    },
  ],
};

const approvalCases: Record<string, ApprovalCase> = {
  "CT0101:2": {
    contractId: "CT0101",
    milestoneNo: 2,
    status: "OPEN",
    policy: {
      requiredRoles: ["CONTRACT_OWNER", "FINANCE_APPROVER"],
      quorum: 2,
      hasOptionalSecondApprover: true,
    },
    documents: [
      {
        id: "a-delivery-report",
        type: "DELIVERY_REPORT",
        fileName: "BBGH_CT0101.pdf",
        sizeMb: 0.9,
        pages: 3,
        signature: {
          signerName: SUPPLIER_REP,
          signedAt: "2026-07-03T09:14:00",
          valid: true,
        },
      },
      {
        id: "a-invoice",
        type: "INVOICE",
        fileName: "HD_0000412.pdf",
        sizeMb: 0.4,
        pages: 1,
        signature: {
          signerName: SUPPLIER_REP,
          signedAt: "2026-07-03T09:31:00",
          valid: true,
        },
      },
    ],
    votes: [
      {
        role: "CONTRACT_OWNER",
        userId: "u-owner",
        actorName: "Nguyễn Văn An",
        choice: "APPROVE",
        signedAt: "2026-07-04T08:50:00",
      },
    ],
  },
};

function seedDecision(
  milestone: Milestone,
  finalizedAt: string,
): MilestoneDecision {
  const lateDays = milestone.deliveredOn
    ? daysBetween(milestone.dueDate, milestone.deliveredOn)
    : 0;
  const proposal = evaluateProposal(milestone, lateDays);
  return {
    contractId: milestone.contractId,
    milestoneNo: milestone.no,
    code: proposal.code,
    reasonCode: proposal.reasonCode,
    lateDays: proposal.lateDays,
    penaltyMillion: proposal.penaltyMillion,
    payableMillion: proposal.payableMillion,
    checks: proposal.checks,
    finalizedAt,
    approvals: 2,
    transferredToAccounting: milestone.no === 1,
  };
}

const decisions: Record<string, MilestoneDecision> = {};
const history: Record<string, HistoryEvent[]> = {};
{
  const [signing, delivery] = milestones;
  decisions["CT0101:1"] = seedDecision(signing, "2026-05-11T10:00:00");
  const deliveryDecision = seedDecision(delivery, "2026-07-04T08:57:00");
  history["CT0101:2"] = [
    {
      at: "2026-07-03T09:14:00",
      category: "SIGNATURE",
      kind: "DOCUMENT_SIGNED",
      actorName: SUPPLIER_REP,
      roleName: "SUPPLIER",
      document: "DELIVERY_REPORT",
    },
    {
      at: "2026-07-03T09:31:00",
      category: "SIGNATURE",
      kind: "DOCUMENT_SIGNED",
      actorName: SUPPLIER_REP,
      document: "INVOICE",
    },
    {
      at: "2026-07-03T09:32:00",
      category: "SYSTEM",
      kind: "EVIDENCE_RECEIVED",
      code: deliveryDecision.code,
      penaltyMillion: deliveryDecision.penaltyMillion,
    },
    {
      at: "2026-07-04T08:50:00",
      category: "HUMAN",
      kind: "APPROVED_AND_SIGNED",
      actorName: "Nguyễn Văn An",
      roleName: "CONTRACT_OWNER",
    },
    {
      at: "2026-07-04T08:57:00",
      category: "HUMAN",
      kind: "APPROVED_AND_SIGNED",
      actorName: "Lê Thu Hà",
      roleName: "FINANCE_APPROVER",
    },
    {
      at: "2026-07-04T08:57:00",
      category: "SYSTEM",
      kind: "DECISION_FINALIZED",
      code: deliveryDecision.code,
      payableMillion: deliveryDecision.payableMillion,
    },
  ];
  decisions["CT0101:2"] = deliveryDecision;
}

const tasks: Task[] = [
  {
    id: "t-evidence-ct0101-2",
    userId: "u-supplier",
    kind: "SUBMIT_EVIDENCE",
    status: "OPEN",
    contractId: "CT0101",
    milestoneNo: 2,
    milestoneKind: "DELIVERY",
    dueDate: "2026-06-30",
    requirements: ["DELIVERY_REPORT", "INVOICE"],
    target: { screen: "EVIDENCE", contractId: "CT0101", milestoneNo: 2 },
  },
  {
    id: "t-sign-ct0107",
    userId: "u-supplier",
    kind: "SIGN_CONTRACT",
    status: "OPEN",
    contractId: "CT0107",
    contractTitle: "Cung cấp dịch vụ bảo trì",
    dueDate: "2026-05-05",
    requirements: ["OWN_DIGITAL_SIGNATURE"],
    detail: { kind: "BUYER_SIGNED", at: "2026-05-04T09:30:00" },
    target: { screen: "SIGNING", contractId: "CT0101", stepNo: 1 },
  },
  {
    id: "t-resubmit-ct0099-3",
    userId: "u-supplier",
    kind: "RESUBMIT_EVIDENCE",
    status: "OPEN",
    contractId: "CT0099",
    milestoneNo: 3,
    milestoneKind: "ACCEPTANCE",
    milestoneStatus: "HOLD",
    dueDate: "2026-07-20",
    requirements: ["ACCEPTANCE_REPORT_REVISED"],
    detail: {
      kind: "REQUEST_REASON",
      text: "Biên bản thiếu chữ ký người nhận",
    },
    target: { screen: "EVIDENCE", contractId: "CT0101", milestoneNo: 2 },
  },
  {
    id: "t-approve-ct0101-2",
    userId: "u-finance",
    kind: "APPROVE_PAYMENT",
    status: "OPEN",
    contractId: "CT0101",
    milestoneNo: 2,
    milestoneKind: "DELIVERY",
    dueDate: "2026-07-06",
    requirements: ["DELIVERY_REPORT", "INVOICE"],
    target: { screen: "APPROVAL", contractId: "CT0101", milestoneNo: 2 },
  },
];

const contractKinds: Record<string, ContractKind> = { CT0101: "GOODS_SUPPLY" };

/** Milestone domain store. Pages reach it only through `features/milestones/api`. */
export const milestoneDb = {
  milestones,
  participants,
  evidenceDraft,
  approvalCases,
  decisions,
  history,
  tasks,
  contractKinds,
  /** Days a supplier has to open a dispute after a decision is final. */
  disputeWindowDays: 5,
};
