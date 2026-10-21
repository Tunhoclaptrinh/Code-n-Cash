import type { ContractDraft, ReviewerOption, SigningTemplate } from '../types';

/** Draft CT0101 as it stands after the file upload finished (wizard step 1). */
export const seedDraft: ContractDraft = {
  code: 'CT0101',
  type: 'GOODS_SUPPLY',
  title: 'Mua sắm thiết bị phòng thực hành',
  supplierId: 'org-phu-minh',
  reviewerId: 'u-legal',
  signingTemplateId: 'TWO_PARTY_BUYER_FIRST',
  file: {
    name: 'HopDong_ThietBi_PhongTH.pdf',
    sizeBytes: 1_887_437,
    kind: 'PDF',
    pages: 14,
  },
  appendixNames: [],
};

export const reviewerOptions: ReviewerOption[] = [
  { id: 'u-legal', role: 'LEGAL_REVIEWER', organizationLabel: 'Nova An' },
];

export const signingTemplates: SigningTemplate[] = [
  {
    id: 'TWO_PARTY_BUYER_FIRST',
    steps: [
      { no: 1, kind: 'BUYER_OWNER' },
      { no: 2, kind: 'SUPPLIER_FINAL_DIGITAL' },
    ],
  },
];
