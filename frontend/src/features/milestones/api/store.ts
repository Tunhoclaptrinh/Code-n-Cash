import { ApiError } from '@/shared/api/client';
import { milestoneDb } from '../mock/seed';
import type { ApprovalCase, Milestone, Task } from '../types';

/** Internal helpers shared by the feature's api modules; pages do not import this file. */

export const keyOf = (contractId: string, milestoneNo: number): string => `${contractId}:${milestoneNo}`;

export function findMilestone(contractId: string, milestoneNo: number): Milestone {
  const milestone = milestoneDb.milestones.find((item) => item.contractId === contractId && item.no === milestoneNo);
  if (!milestone) throw new ApiError('MILESTONE_NOT_FOUND');
  return milestone;
}

export function listMilestones(contractId: string): Milestone[] {
  return milestoneDb.milestones.filter((item) => item.contractId === contractId).sort((a, b) => a.no - b.no);
}

export function getApprovalCase(contractId: string, milestoneNo: number): ApprovalCase | undefined {
  return milestoneDb.approvalCases[keyOf(contractId, milestoneNo)];
}

export function openTasks(userId: string, kind: Task['kind']): Task[] {
  return milestoneDb.tasks.filter((task) => task.userId === userId && task.kind === kind && task.status === 'OPEN');
}

export interface MilestoneRef {
  contractId: string;
  milestoneNo: number;
}

/** Falls back to the first open task of `kind` for the user when the route names no record. */
export function resolveRef(
  userId: string,
  kind: Task['kind'],
  contractId: string | undefined,
  milestoneNo: number | undefined,
): MilestoneRef {
  if (contractId && milestoneNo) return { contractId, milestoneNo };
  const task = openTasks(userId, kind).find((candidate) => candidate.target.milestoneNo !== undefined);
  if (task) {
    return { contractId: task.target.contractId, milestoneNo: task.target.milestoneNo ?? 0 };
  }
  const fallback = milestoneDb.tasks.find((candidate) => candidate.kind === kind && candidate.target.milestoneNo);
  if (fallback) return { contractId: fallback.target.contractId, milestoneNo: fallback.target.milestoneNo ?? 0 };
  throw new ApiError('MILESTONE_NOT_FOUND');
}
