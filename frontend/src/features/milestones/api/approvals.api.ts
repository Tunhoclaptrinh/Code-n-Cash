import { ApiError, simulateLatency } from '@/shared/api/client';
import { getContractSummary, updateContractSummary } from '@/shared/api/contracts.api';
import { adjustPendingTaskCount } from '@/shared/api/tasks.api';
import type { Role } from '@/shared/api/types';
import { daysBetween } from '../lib/dates';
import { evaluateProposal, type Proposal } from '../lib/engine';
import { businessTimestamp, businessToday, milestoneDb } from '../mock/seed';
import type {
  ApprovalCase,
  ApprovalStepRole,
  EvidenceFile,
  Milestone,
  MilestoneDecision,
  ParticipantRole,
  VoteChoice,
} from '../types';
import { findMilestone, getApprovalCase, keyOf, listMilestones, resolveRef } from './store';

export type ApprovalStepState = 'APPROVED' | 'HELD' | 'REJECTED' | 'CURRENT' | 'PENDING';

export interface ApprovalStep {
  role: ApprovalStepRole;
  required: boolean;
  state: ApprovalStepState;
  /** Name of whoever acted, or of the person the step is assigned to. */
  personName?: string;
  /** True when this step is waiting for the signed-in user. */
  isYou: boolean;
  signedAt?: string;
}

export interface ApprovalView {
  contractId: string;
  milestone: Milestone;
  status: ApprovalCase['status'];
  proposal: Proposal;
  quorum: number;
  distinctRoles: number;
  steps: ApprovalStep[];
  documents: EvidenceFile[];
}

const STEP_PARTICIPANT: Record<ApprovalStepRole, ParticipantRole> = {
  CONTRACT_OWNER: 'CONTRACT_OWNER',
  FINANCE_APPROVER: 'FINANCE_APPROVER',
  SECOND_APPROVER: 'SECOND_APPROVER',
};

export async function getApprovalView(
  userId: string,
  userRole: Role,
  contractId?: string,
  milestoneNo?: number,
): Promise<ApprovalView> {
  const ref = resolveRef(userId, 'APPROVE_PAYMENT', contractId, milestoneNo);
  const milestone = findMilestone(ref.contractId, ref.milestoneNo);
  const approvalCase = getApprovalCase(ref.contractId, ref.milestoneNo);
  if (!approvalCase) throw new ApiError('APPROVAL_NOT_FOUND');
  const participants = milestoneDb.participants[ref.contractId] ?? [];

  const lateDays = daysBetween(milestone.dueDate, milestone.deliveredOn ?? businessToday());
  const proposal = evaluateProposal(milestone, lateDays);

  let currentAssigned = false;
  const steps: ApprovalStep[] = [
    ...approvalCase.policy.requiredRoles.map((role) => ({ role: role as ApprovalStepRole, required: true })),
    ...(approvalCase.policy.hasOptionalSecondApprover
      ? [{ role: 'SECOND_APPROVER' as ApprovalStepRole, required: false }]
      : []),
  ].map(({ role, required }) => {
    const vote = approvalCase.votes.find((candidate) => candidate.role === role);
    const person = participants.find((participant) => participant.role === STEP_PARTICIPANT[role]);
    let state: ApprovalStepState = 'PENDING';
    if (vote) state = vote.choice === 'APPROVE' ? 'APPROVED' : vote.choice === 'HOLD' ? 'HELD' : 'REJECTED';
    else if (required && approvalCase.status === 'OPEN' && !currentAssigned) {
      state = 'CURRENT';
      currentAssigned = true;
    }
    const isYou = state === 'CURRENT' && role === userRole;
    return {
      role,
      required,
      state,
      isYou,
      personName: vote?.actorName ?? (isYou ? undefined : person?.name),
      signedAt: vote?.signedAt,
    };
  });

  return simulateLatency({
    contractId: ref.contractId,
    milestone,
    status: approvalCase.status,
    proposal,
    quorum: approvalCase.policy.quorum,
    distinctRoles: new Set(approvalCase.policy.requiredRoles).size,
    steps,
    documents: approvalCase.documents,
  });
}

export async function markDocumentViewed(contractId: string, milestoneNo: number, fileId: string): Promise<void> {
  const document = getApprovalCase(contractId, milestoneNo)?.documents.find((file) => file.id === fileId);
  if (document) document.viewedByApprover = true;
  return simulateLatency(undefined, 20);
}

export interface CastVoteInput {
  userId: string;
  role: Role;
  actorName: string;
  contractId: string;
  milestoneNo: number;
  choice: VoteChoice;
  note?: string;
}

export interface CastVoteResult {
  /** True once the approvals reached a final decision; the caller then opens the decision screen. */
  finalized: boolean;
}

export async function castVote(input: CastVoteInput): Promise<CastVoteResult> {
  const { contractId, milestoneNo, choice } = input;
  const milestone = findMilestone(contractId, milestoneNo);
  const approvalCase = getApprovalCase(contractId, milestoneNo);
  if (!approvalCase || approvalCase.status !== 'OPEN') throw new ApiError('APPROVAL_CLOSED');
  if (!approvalCase.policy.requiredRoles.includes(input.role)) throw new ApiError('NOT_AN_APPROVER');
  if (approvalCase.votes.some((vote) => vote.role === input.role)) throw new ApiError('ALREADY_VOTED');
  const note = input.note?.trim();
  if (choice !== 'APPROVE' && !note) throw new ApiError('NOTE_REQUIRED');

  const now = businessTimestamp();
  approvalCase.votes.push({
    role: input.role,
    userId: input.userId,
    actorName: input.actorName,
    choice,
    note,
    signedAt: now,
  });

  const history = (milestoneDb.history[keyOf(contractId, milestoneNo)] ??= []);
  const roleName = input.role;
  if (choice === 'APPROVE') {
    history.push({ at: now, category: 'HUMAN', kind: 'APPROVED_AND_SIGNED', actorName: input.actorName, roleName });
  } else if (choice === 'HOLD') {
    history.push({ at: now, category: 'HUMAN', kind: 'HELD', actorName: input.actorName, roleName });
  } else {
    history.push({ at: now, category: 'HUMAN', kind: 'REJECTED', actorName: input.actorName, roleName });
  }

  const approvedRoles = new Set(approvalCase.votes.filter((vote) => vote.choice === 'APPROVE').map((vote) => vote.role));
  const quorumMet = approvedRoles.size >= approvalCase.policy.quorum;
  const stopped = choice !== 'APPROVE';

  completeOwnTask(input.userId, contractId, milestoneNo);

  if (!stopped && !quorumMet) return simulateLatency({ finalized: false });

  const lateDays = daysBetween(milestone.dueDate, milestone.deliveredOn ?? businessToday());
  const proposal = evaluateProposal(milestone, lateDays);
  const decision: MilestoneDecision = stopped
    ? {
        contractId,
        milestoneNo,
        code: choice === 'HOLD' ? 'HOLD' : 'REJECT',
        reasonCode: choice === 'HOLD' ? 'HELD_BY_APPROVER' : 'REJECTED_BY_APPROVER',
        lateDays: proposal.lateDays,
        penaltyMillion: 0,
        payableMillion: 0,
        checks: proposal.checks.filter((check) => check.code !== 'APPROVAL_QUORUM_MET' && check.outcome === 'PASS'),
        finalizedAt: now,
        approvals: approvedRoles.size,
        transferredToAccounting: false,
      }
    : {
        contractId,
        milestoneNo,
        code: proposal.code,
        reasonCode: proposal.reasonCode,
        lateDays: proposal.lateDays,
        penaltyMillion: proposal.penaltyMillion,
        payableMillion: proposal.payableMillion,
        checks: proposal.checks,
        finalizedAt: now,
        approvals: approvedRoles.size,
        transferredToAccounting: false,
      };

  milestoneDb.decisions[keyOf(contractId, milestoneNo)] = decision;
  approvalCase.status = 'CLOSED';
  milestone.status = decision.code;
  history.push({
    at: now,
    category: 'SYSTEM',
    kind: 'DECISION_FINALIZED',
    code: decision.code,
    payableMillion: decision.payableMillion,
  });

  await syncContractSummary(contractId);
  return simulateLatency({ finalized: true });
}

function completeOwnTask(userId: string, contractId: string, milestoneNo: number): void {
  for (const task of milestoneDb.tasks) {
    if (
      task.userId === userId &&
      task.kind === 'APPROVE_PAYMENT' &&
      task.status === 'OPEN' &&
      task.contractId === contractId &&
      task.milestoneNo === milestoneNo
    ) {
      task.status = 'DONE';
      adjustPendingTaskCount(userId, -1);
    }
  }
}

/** Pushes the outcome of a finalised decision into the shared contract list. */
async function syncContractSummary(contractId: string): Promise<void> {
  const summary = await getContractSummary(contractId);
  const milestones = listMilestones(contractId);
  const settled = milestones.filter((item) => item.status === 'RELEASE' || item.status === 'PENALTY');
  const next = milestones.find((item) => !settled.includes(item));
  await updateContractSummary(contractId, {
    milestonesDone: settled.length,
    milestonesTotal: milestones.length || summary.milestonesTotal,
    deductedMilestones: settled.filter((item) => item.status === 'PENALTY').length,
    status: next ? 'AWAITING_EVIDENCE' : 'COMPLETED',
    waitingFor: next
      ? { kind: 'SUPPLIER_SUBMITS_EVIDENCE', milestoneNo: next.no }
      : { kind: 'NOTHING' },
  });
}
