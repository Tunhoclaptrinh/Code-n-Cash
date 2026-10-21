import type { Organization, User } from '../api/types';

export const organizations: Organization[] = [
  { id: 'org-nova-an', name: 'Nova An Business JSC' },
  { id: 'org-phu-minh', name: 'Phú Minh Technology JSC' },
  { id: 'org-youngtech', name: 'YoungTech Vietnam JSC' },
  { id: 'org-smartcore', name: 'SmartCore Services JSC' },
  { id: 'org-mekong', name: 'Mekong IT Services JSC' },
  { id: 'org-bao-tin', name: 'Bảo Tín Systems JSC' },
];

/** Every seeded account shares this password. Replace with a real identity provider later. */
export const MOCK_PASSWORD = 'Passw0rd!';

export const users: User[] = [
  {
    id: 'u-owner',
    email: 'owner@novaan.vn',
    displayName: 'Nguyễn Văn An',
    role: 'CONTRACT_OWNER',
    organizationId: 'org-nova-an',
    roleChipOrganization: 'Nova An Business JSC',
  },
  {
    id: 'u-legal',
    email: 'legal@novaan.vn',
    displayName: 'Trần Thị Mai',
    role: 'LEGAL_REVIEWER',
    organizationId: 'org-nova-an',
    roleChipOrganization: 'Nova An',
  },
  {
    id: 'u-finance',
    email: 'finance@novaan.vn',
    displayName: 'Lê Quốc Dũng',
    role: 'FINANCE_APPROVER',
    organizationId: 'org-nova-an',
    roleChipOrganization: 'Nova An Business JSC',
  },
  {
    id: 'u-admin',
    email: 'admin@novaan.vn',
    displayName: 'Phạm Hoàng Nam',
    role: 'ADMIN_AUDITOR',
    organizationId: 'org-nova-an',
    roleChipOrganization: 'Nova An',
  },
  {
    id: 'u-supplier',
    email: 'supplier@phuminh.vn',
    displayName: 'Vũ Thanh Hà',
    role: 'SUPPLIER',
    organizationId: 'org-phu-minh',
    roleChipOrganization: 'Phú Minh Technology JSC',
  },
];
