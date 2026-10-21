import { simulateLatency } from '@/shared/api/client';
import { getContractSummary } from '@/shared/api/contracts.api';
import { daysBetween } from '../lib/dates';
import { milestoneDb, businessToday } from '../mock/seed';
import type { Task, TaskRow } from '../types';
import { findMilestone } from './store';

export function taskHref(target: Task['target']): string {
  switch (target.screen) {
    case 'EVIDENCE':
      return `/submissions/${target.contractId}/${target.milestoneNo}`;
    case 'APPROVAL':
      return `/approvals/${target.contractId}/${target.milestoneNo}`;
    case 'SIGNING':
      return `/contracts/${target.contractId}/signing/${target.stepNo ?? 1}`;
  }
}

async function toRow(task: Task): Promise<TaskRow> {
  const isEvidence = task.kind === 'SUBMIT_EVIDENCE' || task.kind === 'RESUBMIT_EVIDENCE';
  const overdueDays = task.kind === 'SUBMIT_EVIDENCE' ? Math.max(0, daysBetween(task.dueDate, businessToday())) : 0;

  let subtitle: TaskRow['subtitle'];
  if (task.detail?.kind === 'BUYER_SIGNED') subtitle = { kind: 'BUYER_SIGNED', at: task.detail.at };
  else if (task.detail?.kind === 'REQUEST_REASON') subtitle = { kind: 'REQUEST_REASON', text: task.detail.text };
  else {
    const summary = await getContractSummary(task.contractId);
    const milestone = findMilestone(task.contractId, task.milestoneNo ?? 0);
    subtitle = { kind: 'CONTRACT_AMOUNT', title: summary.title, amountMillion: milestone.plannedMillion };
  }

  let heading: TaskRow['heading'];
  if (task.milestoneNo && task.milestoneKind) {
    heading = { kind: 'MILESTONE', no: task.milestoneNo, milestoneKind: task.milestoneKind };
  } else {
    heading = { kind: 'TITLE', title: task.contractTitle ?? task.contractId };
  }

  let badge: TaskRow['badge'] = 'ON_TIME';
  if (task.kind === 'SIGN_CONTRACT') badge = 'YOUR_TURN';
  else if (task.milestoneStatus === 'HOLD') badge = 'MILESTONE_ON_HOLD';
  else if (isEvidence && overdueDays > 0) badge = 'LATE_PENALTY_RISK';

  return {
    id: task.id,
    kind: task.kind,
    contractId: task.contractId,
    heading,
    subtitle,
    dueDate: task.dueDate,
    overdueDays,
    requirements: task.requirements,
    badge,
    primary: overdueDays > 0,
    href: taskHref(task.target),
  };
}

/** Open work items for one user, in priority order. */
export async function getTaskInbox(userId: string): Promise<TaskRow[]> {
  const open = milestoneDb.tasks.filter(
    (task) => task.userId === userId && task.status === 'OPEN' && task.kind !== 'APPROVE_PAYMENT',
  );
  const rows = await Promise.all(open.map(toRow));
  return simulateLatency(rows);
}
