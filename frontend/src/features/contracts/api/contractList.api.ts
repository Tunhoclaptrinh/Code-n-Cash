import { listContractSummaries, listOrganizations } from '@/shared/api/contracts.api';
import type { ContractList, ContractViewer } from '../types';

const BUYER_ORGANIZATION_ID = 'org-nova-an';

/**
 * Contracts the viewer may see: the buying organisation sees everything,
 * a supplier only sees the contracts it is the supplier of.
 */
export async function getContractList(viewer: ContractViewer): Promise<ContractList> {
  const [summaries, organizations] = await Promise.all([listContractSummaries(), listOrganizations()]);
  const nameOf = (organizationId: string) =>
    organizations.find((organization) => organization.id === organizationId)?.name ?? organizationId;

  const isBuyerSide = viewer.organizationId === BUYER_ORGANIZATION_ID;
  const visible = isBuyerSide ? summaries : summaries.filter((summary) => summary.supplierId === viewer.organizationId);

  return {
    organizationName: nameOf(viewer.organizationId),
    contracts: visible.map((summary) => ({ ...summary, supplierName: nameOf(summary.supplierId) })),
  };
}
