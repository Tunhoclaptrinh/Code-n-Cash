import type { Dispute } from "../types";

/** The open dispute on milestone 2 (delivery) of CT0101. */
export const seedDisputes: Dispute[] = [
  {
    contractCode: "CT0101",
    milestoneNo: 2,
    milestoneKind: "DELIVERY",
    status: "OPEN",
    raisedBy: {
      name: "Trần Quốc Phú",
      organizationName: "Phú Minh Technology JSC",
      initials: "PH",
    },
    raisedAt: "2026-07-05T10:20:00",
    message:
      "Bên mua đổi địa điểm giao hàng ngày 28/06 nên chúng tôi giao muộn 3 ngày. Đề nghị không tính tiền phạt.",
    evidence: [
      { id: "ev-1", fileName: "Email_doi_dia_diem_28-06.pdf", kind: "PDF" },
    ],
    impact: { keepPenaltyMillion: 949.92, waivePenaltyMillion: 960 },
    draftNote: "Đã đối chiếu email đổi địa điểm ngày 28/06, đồng ý bỏ phạt.",
    timeline: [
      { kind: "OPENED", at: "2026-07-05T10:20:00", actorName: "Trần Quốc Phú" },
    ],
  },
];

/** Users who receive follow-up work once the contract owner has decided. */
export const followUpUserIds = {
  financeApprover: "u-finance",
  supplier: "u-supplier",
};
