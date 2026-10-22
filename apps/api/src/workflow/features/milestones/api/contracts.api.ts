import { simulateLatency } from "../../../shared/api/client";
import {
  getContractSummary,
  listOrganizations,
} from "../../../shared/api/contracts.api";
import { evaluateProposal, type Proposal } from "../lib/engine";
import { sumMillion } from "../lib/money";
import { milestoneDb } from "../mock/seed";
import type {
  ContractOverview,
  EvidenceFile,
  HistoryEvent,
  Milestone,
  MilestoneDecision,
  MilestoneRow,
} from "../types";
import { findMilestone, getApprovalCase, keyOf, listMilestones } from "./store";

const FINAL_STATUSES = ["RELEASE", "PENALTY", "HOLD", "REJECT"];

function toRow(milestone: Milestone): MilestoneRow {
  const decision = FINAL_STATUSES.includes(milestone.status)
    ? milestoneDb.decisions[keyOf(milestone.contractId, milestone.no)]
    : undefined;
  return {
    ...milestone,
    payableMillion: decision?.payableMillion,
    penaltyMillion: decision?.penaltyMillion,
    transferredToAccounting: decision?.transferredToAccounting,
  };
}

export async function getContractOverview(
  contractId: string,
): Promise<ContractOverview> {
  const [summary, organizations] = await Promise.all([
    getContractSummary(contractId),
    listOrganizations(),
  ]);
  const rows = listMilestones(contractId).map(toRow);
  const settled = rows.filter(
    (row) => row.status === "RELEASE" || row.status === "PENALTY",
  );
  const waiting = rows.filter(
    (row) => row.status === "NOT_DUE" || row.status === "NOT_OPEN",
  );
  const inProgress = rows.filter(
    (row) =>
      row.status === "AWAITING_EVIDENCE" || row.status === "AWAITING_APPROVAL",
  );
  return simulateLatency({
    contractId,
    title: summary.title,
    kind: milestoneDb.contractKinds[contractId] ?? "GOODS_SUPPLY",
    supplierName:
      organizations.find(
        (organization) => organization.id === summary.supplierId,
      )?.name ?? "",
    valueMillion: summary.valueMillion,
    phase:
      rows.length > 0 && settled.length === rows.length
        ? "COMPLETED"
        : "IN_PROGRESS",
    milestones: rows,
    settledMillion: sumMillion(settled.map((row) => row.payableMillion ?? 0)),
    penaltyMillion: sumMillion(settled.map((row) => row.penaltyMillion ?? 0)),
    notDueMillion: sumMillion(waiting.map((row) => row.plannedMillion)),
    inProgressMillion: sumMillion(inProgress.map((row) => row.plannedMillion)),
    participants: milestoneDb.participants[contractId] ?? [],
    documents: Object.values(milestoneDb.approvalCases)
      .filter((approvalCase) => approvalCase.contractId === contractId)
      .flatMap((approvalCase) =>
        approvalCase.documents.map((file) => ({
          milestoneNo: approvalCase.milestoneNo,
          file,
        })),
      ),
  } satisfies ContractOverview);
}

export interface DecisionView {
  contractId: string;
  contractTitle: string;
  supplierName: string;
  milestone: Milestone;
  decision: MilestoneDecision;
  /** Penalty working shown in the amount table. */
  calculation: Proposal;
  documents: EvidenceFile[];
  history: HistoryEvent[];
  disputeWindowDays: number;
}

export async function getDecisionView(
  contractId: string,
  milestoneNo: number,
): Promise<DecisionView | null> {
  const milestone = findMilestone(contractId, milestoneNo);
  const decision = milestoneDb.decisions[keyOf(contractId, milestoneNo)];
  const [summary, organizations] = await Promise.all([
    getContractSummary(contractId),
    listOrganizations(),
  ]);
  if (!decision) return simulateLatency(null);
  return simulateLatency({
    contractId,
    contractTitle: summary.title,
    supplierName:
      organizations.find(
        (organization) => organization.id === summary.supplierId,
      )?.name ?? "",
    milestone,
    decision,
    calculation: evaluateProposal(milestone, decision.lateDays),
    documents: getApprovalCase(contractId, milestoneNo)?.documents ?? [],
    history: milestoneDb.history[keyOf(contractId, milestoneNo)] ?? [],
    disputeWindowDays: milestoneDb.disputeWindowDays,
  });
}

/** Marks the decision as handed to accounting; the payment order itself is outside this app. */
export async function transferToAccounting(
  contractId: string,
  milestoneNo: number,
): Promise<void> {
  const decision = milestoneDb.decisions[keyOf(contractId, milestoneNo)];
  if (decision) decision.transferredToAccounting = true;
  return simulateLatency(undefined);
}
