import { listOrganizations, updateContractSummary } from '@/shared/api/contracts.api';
import { simulateLatency } from '@/shared/api/client';
import { reviewerOptions, seedDraft, signingTemplates } from '../mock/draft';
import type { ContractDraft, UploadFormOptions } from '../types';

let draft: ContractDraft = structuredClone(seedDraft);

export async function getContractDraft(): Promise<ContractDraft> {
  return simulateLatency(draft);
}

export async function getUploadFormOptions(buyerOrganizationId: string): Promise<UploadFormOptions> {
  const organizations = await listOrganizations();
  const options: UploadFormOptions = {
    types: ['GOODS_SUPPLY'],
    suppliers: organizations.filter((organization) => organization.id !== buyerOrganizationId),
    reviewers: reviewerOptions,
    signingTemplates,
  };
  return simulateLatency(options);
}

/** Persists the wizard's step 1 and keeps the contract list in sync with the edited fields. */
export async function saveContractDraft(next: ContractDraft): Promise<ContractDraft> {
  draft = structuredClone(next);
  await updateContractSummary(next.code, { title: next.title, supplierId: next.supplierId });
  return simulateLatency(draft);
}
