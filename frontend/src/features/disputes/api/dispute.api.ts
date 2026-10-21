import { ApiError, simulateLatency } from '@/shared/api/client';
import { getContractSummary, updateContractSummary } from '@/shared/api/contracts.api';
import { adjustPendingTaskCount } from '@/shared/api/tasks.api';
import { followUpUserIds, seedDisputes } from '../mock/disputes';
import type { Dispute, ResolveDisputeInput } from '../types';

const disputes: Dispute[] = structuredClone(seedDisputes);

function find(contractCode: string, milestoneNo: number): Dispute {
  const dispute = disputes.find(
    (candidate) => candidate.contractCode === contractCode && candidate.milestoneNo === milestoneNo,
  );
  if (!dispute) throw new ApiError('DISPUTE_NOT_FOUND');
  return dispute;
}

export async function getDispute(contractCode: string, milestoneNo: number): Promise<Dispute> {
  return simulateLatency(find(contractCode, milestoneNo));
}

/**
 * Records the contract owner's decision on an open dispute.
 * Accepting or keeping the penalty closes the dispute and sends the milestone to payment approval;
 * asking for more evidence keeps it open and hands the work back to the supplier.
 */
export async function resolveDispute(input: ResolveDisputeInput): Promise<Dispute> {
  const dispute = find(input.contractCode, input.milestoneNo);
  if (dispute.status !== 'OPEN') throw new ApiError('DISPUTE_NOT_OPEN');

  const now = new Date().toISOString();
  const closes = input.option !== 'REQUEST_MORE_EVIDENCE';

  dispute.status = closes ? 'RESOLVED' : 'AWAITING_EVIDENCE';
  dispute.resolution = { option: input.option, note: input.note, decidedAt: now, decidedBy: input.actor.displayName };
  dispute.timeline.push({ kind: input.option, at: now, actorName: input.actor.displayName });

  adjustPendingTaskCount(input.actor.id, -1);
  adjustPendingTaskCount(closes ? followUpUserIds.financeApprover : followUpUserIds.supplier, 1);

  if (!closes) {
    const summary = await getContractSummary(input.contractCode);
    if (summary.status === 'DISPUTED') {
      await updateContractSummary(input.contractCode, {
        status: 'AWAITING_EVIDENCE',
        waitingFor: { kind: 'SUPPLIER_SUBMITS_EVIDENCE', milestoneNo: input.milestoneNo },
      });
    }
  }

  return simulateLatency(dispute);
}
