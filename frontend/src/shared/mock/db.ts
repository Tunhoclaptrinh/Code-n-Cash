import { contractSummaries } from './contracts';
import { organizations, users } from './users';

/**
 * In-memory store that stands in for the backend. It is the only place that holds demo data.
 * UI code reaches it exclusively through the functions in `shared/api` and `features/<name>/api`.
 */
export const db = {
  organizations,
  users,
  contractSummaries,
  /** Open work items per user; drives the badge in the side navigation. */
  pendingTaskCount: {
    'u-owner': 3,
    'u-legal': 3,
    'u-finance': 1,
    'u-admin': 3,
    'u-supplier': 3,
  } as Record<string, number>,
};

export function organizationName(organizationId: string): string {
  return db.organizations.find((organization) => organization.id === organizationId)?.name ?? organizationId;
}
