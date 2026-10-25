import type { TFunction } from "i18next";
import type { ApprovalPolicy, ContractType } from "@codecash/contracts";
import type {
  ContractDraft,
  ContractFileKind,
  DraftSigner,
  UploadFormOptions,
} from "../types";

export const TITLE_MAX_LENGTH = 250;
export const FILE_MAX_BYTES = 20 * 1024 * 1024;
export const BYTES_PER_MB = 1024 * 1024;
export const MAX_SIGNERS = 4;
export const MAX_APPENDICES = 20;

export type DraftInput = Omit<
  ContractDraft,
  "type" | "approvalPolicy" | "graceDays"
> & {
  type?: ContractType;
  approvalPolicy?: ApprovalPolicy;
  graceDays?: number;
};

/** Fingerprint of the fields that feed the generated document; a change makes it stale. */
export const contentKey = (draft: DraftInput) =>
  JSON.stringify([
    draft.title,
    draft.type,
    draft.supplierId,
    draft.valueMillion,
    draft.startDate,
    draft.endDate,
    draft.approvalPolicy,
    draft.graceDays,
    draft.penaltyRatePct,
    draft.maxPenaltyPct,
    draft.signers,
    draft.documentBody,
  ]);

export function fileKindOf(fileName: string): ContractFileKind | null {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (extension === "pdf") return "PDF";
  if (extension === "docx") return "DOCX";
  return null;
}

/** Client-side check of the signing order; the API validates the same rules again. */
export function signerProblem(signers: DraftSigner[]): string | null {
  if (signers.length < 1 || signers.length > MAX_SIGNERS) return "count";
  if (signers.some((s) => !s.userId)) return "missing";
  if (new Set(signers.map((s) => s.userId)).size !== signers.length)
    return "duplicate";
  if (
    signers.length > 1 &&
    (!signers.some((s) => s.party === "BUYER") ||
      !signers.some((s) => s.party === "SUPPLIER"))
  )
    return "bothSides";
  return null;
}

export const emptyDraft = (draft: ContractDraft): DraftInput => ({
  ...draft,
  title: "",
  type: undefined,
  supplierId: "",
  reviewerId: "",
  valueMillion: "",
  startDate: "",
  endDate: "",
  approvalPolicy: undefined,
  graceDays: undefined,
  penaltyRatePct: "",
  maxPenaltyPct: "",
  signers: [],
  documentBody: "",
  templateId: undefined,
  templateVersion: undefined,
  templateSnapshot: undefined,
  file: { name: "", sizeBytes: 0, kind: "PDF" },
  appendixNames: [],
  appendixDocuments: [],
});

/** Demo values proposed by "fill all"; only empty inputs take them. */
export function sampleValues(
  options: UploadFormOptions,
  value: DraftInput,
  draft: ContractDraft,
  t: TFunction,
): Partial<DraftInput> {
  const supplier =
    options.suppliers.find((supplier) => supplier.id === value.supplierId) ??
    options.suppliers.find(
      (supplier) =>
        supplier.id === "S015" && options.supplierSigners[supplier.id]?.length,
    ) ??
    options.suppliers.find(
      (supplier) => options.supplierSigners[supplier.id]?.length,
    );
  const owner =
    options.buyerSigners.find((person) => person.role === "CONTRACT_OWNER") ??
    options.buyerSigners[0];
  const representative = supplier && options.supplierSigners[supplier.id]?.[0];
  return {
    title: t("contractUpload.demo.title"),
    type: "GOODS_SUPPLY",
    supplierId: supplier?.id,
    reviewerId: options.reviewers[0]?.userId,
    valueMillion: "1000.00",
    startDate: draft.startDate,
    endDate: draft.endDate,
    approvalPolicy: "SINGLE_BUYER_APPROVAL",
    graceDays: 5,
    penaltyRatePct: "0.10",
    maxPenaltyPct: "8.00",
    documentBody: t("contractUpload.demo.body"),
    signers: [
      ...(owner ? [{ party: "BUYER" as const, userId: owner.userId }] : []),
      ...(representative
        ? [{ party: "SUPPLIER" as const, userId: representative.userId }]
        : []),
    ],
  };
}

/** Gives every signer row without a person the next unused person of that side. */
export function fillMissingSigners(
  next: DraftInput,
  options: UploadFormOptions,
): DraftSigner[] {
  const used = new Set(
    next.signers.map((signer) => signer.userId).filter(Boolean),
  );
  return next.signers.map((signer) => {
    if (signer.userId) return signer;
    const people =
      signer.party === "BUYER"
        ? options.buyerSigners
        : (options.supplierSigners[next.supplierId] ?? []);
    const person = people.find((person) => !used.has(person.userId));
    if (person) used.add(person.userId);
    return { ...signer, userId: person?.userId ?? "" };
  });
}
