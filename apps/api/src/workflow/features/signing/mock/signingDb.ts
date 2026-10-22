import type {
  Digitization,
  PdfPagePreview,
  SignerProfile,
  SignStep,
  SigningRequest,
  SlotMap,
  VerifiedSignature,
} from "../types";

/** Contract signing configuration as stored by the signing feature. */
export interface StoredSigning {
  contractCode: string;
  fileName: string;
  pageCount: number;
  digitalSignatureRequired: boolean;
  steps: SignStep[];
  slots: SlotMap;
  previewPages: PdfPagePreview[];
}

export const defaultSlots = (): SlotMap => ({
  1: { page: 14, x: 36, y: 416, w: 214, h: 120, look: "NAME_AND_TIME" },
  2: { page: 14, x: 270, y: 416, w: 214, h: 120, look: "NAME_AND_TIME" },
});

const previewPages: PdfPagePreview[] = [
  {
    pageNo: 13,
    heading: "ARTICLE_13",
    textLineCount: 26,
    hasSignatureBlock: false,
    blockedZones: [{ x: 0, y: 28, w: 520, h: 540 }],
  },
  {
    pageNo: 14,
    heading: "ARTICLE_14",
    textLineCount: 9,
    hasSignatureBlock: true,
    blockedZones: [
      { x: 0, y: 28, w: 520, h: 200 },
      { x: 36, y: 390, w: 214, h: 24 },
      { x: 270, y: 390, w: 214, h: 24 },
      { x: 36, y: 540, w: 214, h: 44 },
      { x: 270, y: 540, w: 214, h: 44 },
    ],
  },
];

const today = (hours: number, minutes: number): string => {
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
};

const REQUEST_LIFETIME_MS = 5 * 60 * 1000;

export const signingDb = {
  contracts: {
    CT0101: {
      contractCode: "CT0101",
      fileName: "HopDong_ThietBi_PhongTH.pdf",
      pageCount: 14,
      digitalSignatureRequired: true,
      steps: [
        {
          stepNo: 1,
          party: "BUYER",
          signerUserId: "u-owner",
          signerName: "Nguyễn Văn An",
          signerTitle: "Giám đốc",
          signerRole: "CONTRACT_OWNER",
          organizationId: "org-nova-an",
          isFinal: false,
          status: "CURRENT",
        },
        {
          stepNo: 2,
          party: "SUPPLIER",
          signerUserId: "u-phu-minh-director",
          signerName: "Trần Quốc Phú",
          signerTitle: "Tổng giám đốc",
          organizationId: "org-phu-minh",
          isFinal: true,
          status: "WAITING",
        },
      ],
      slots: defaultSlots(),
      previewPages,
    },
  } as Record<string, StoredSigning>,

  /** Signing requests; the seeded one is the owner's request already sent to the phone. */
  requests: [
    {
      id: "rq-seed-1",
      contractCode: "CT0101",
      stepNo: 1,
      method: "VNPT_SMARTCA",
      status: "PENDING",
      code: "7429",
      sentAt: today(10, 42),
      expiresAt: new Date(Date.now() + (4 * 60 + 36) * 1000).toISOString(),
      autoConfirmAt: null,
    },
  ] as SigningRequest[],

  profiles: {
    "u-owner": {
      lastMethod: "VNPT_SMARTCA",
      certificates: {
        VNPT_SMARTCA: {
          holder: "Nguyễn Văn An",
          expiryMonth: 12,
          expiryYear: 2027,
        },
      },
    },
  } as Record<string, SignerProfile>,

  digitizations: {
    CT0101: {
      contractCode: "CT0101",
      contractValueMillion: 2400,
      clauses: [
        { kind: "TOTAL_VALUE", article: 3, page: 4 },
        { kind: "DELIVERY", article: 5, page: 6 },
        { kind: "LATE_PENALTY", article: 9, page: 10 },
        { kind: "APPROVALS", article: 11, page: 12 },
      ],
      milestones: [
        {
          no: 1,
          kind: "SIGNING",
          valueMillion: 480,
          dueDate: "2026-05-15T00:00:00",
          documents: ["SIGNED_CONTRACT"],
          penalty: null,
          source: "MATCH",
          sourceClause: "TOTAL_VALUE",
        },
        {
          no: 2,
          kind: "DELIVERY",
          valueMillion: 960,
          dueDate: "2026-06-30T00:00:00",
          documents: ["DELIVERY_NOTE", "INVOICE"],
          penalty: { ratePerDay: 0.35, capPercent: 8 },
          source: "MATCH",
          sourceClause: "DELIVERY",
        },
        {
          no: 3,
          kind: "ACCEPTANCE",
          valueMillion: 720,
          dueDate: "2026-07-31T00:00:00",
          documents: ["ACCEPTANCE_REPORT"],
          penalty: { ratePerDay: 0.35, capPercent: 8 },
          source: "MATCH",
          sourceClause: "LATE_PENALTY",
        },
        {
          no: 4,
          kind: "WARRANTY",
          valueMillion: 240,
          dueDate: null,
          documents: ["WARRANTY_END_REPORT"],
          penalty: null,
          source: "NEEDS_CONFIRMATION",
          sourceClause: null,
          relativeTermMonths: 12,
        },
      ],
      approvers: ["CONTRACT_OWNER", "FINANCE_APPROVER", "SECOND_APPROVER"],
      requiredApprovals: 2,
      suggestedDueDate: "2027-07-31T00:00:00",
      locked: false,
    },
  } as Record<string, Digitization>,

  /** Signatures found in the contract file, as checked by the verification service. */
  verifications: {
    CT0101: [
      {
        stepNo: 1,
        party: "BUYER",
        signerName: "Nguyễn Văn An",
        signedAt: "2026-05-11T13:52:00",
        method: "VNPT_SMARTCA",
        certExpiryMonth: 12,
        certExpiryYear: 2027,
        status: "VALID",
        contentIntact: true,
      },
      {
        stepNo: 2,
        party: "SUPPLIER",
        signerName: "Trần Quốc Phú",
        signedAt: "2026-05-11T14:08:00",
        method: "VIETTEL_MYSIGN",
        certExpiryMonth: 3,
        certExpiryYear: 2027,
        status: "VALID",
        contentIntact: true,
      },
    ] as VerifiedSignature[],
  } as Record<string, VerifiedSignature[]>,
};

export { REQUEST_LIFETIME_MS };
