import type { ContractSummary, Role } from '@/shared/api/types';

/** A contract summary joined with the supplier's display name, ready to render as a table row. */
export interface ContractRow extends ContractSummary {
  supplierName: string;
}

export interface ContractList {
  organizationName: string;
  contracts: ContractRow[];
}

export interface ContractViewer {
  id: string;
  role: Role;
  organizationId: string;
}

export type ContractType = 'GOODS_SUPPLY';
export type SigningTemplateId = 'TWO_PARTY_BUYER_FIRST';
export type SigningStepKind = 'BUYER_OWNER' | 'SUPPLIER_FINAL_DIGITAL';
export type ContractFileKind = 'PDF' | 'DOCX';

export interface SigningTemplate {
  id: SigningTemplateId;
  steps: { no: number; kind: SigningStepKind }[];
}

export interface ReviewerOption {
  id: string;
  role: Role;
  /** Organisation text shown after the role name. */
  organizationLabel: string;
}

export interface ContractFile {
  name: string;
  sizeBytes: number;
  kind: ContractFileKind;
  /** Unknown until the replaced file has been analysed. */
  pages?: number;
}

export interface ContractDraft {
  code: string;
  type: ContractType;
  title: string;
  supplierId: string;
  reviewerId: string;
  signingTemplateId: SigningTemplateId;
  file: ContractFile;
  appendixNames: string[];
}

export interface UploadFormOptions {
  types: ContractType[];
  suppliers: { id: string; name: string }[];
  reviewers: ReviewerOption[];
  signingTemplates: SigningTemplate[];
}
