import { ApiError, simulateLatency } from "../../../shared/api/client";
import { getContractSummary } from "../../../shared/api/contracts.api";
import { organizationName } from "../../../shared/mock/db";
import { defaultSlots, signingDb, type StoredSigning } from "../mock/signingDb";
import type {
  SignStepView,
  SigningConfig,
  SigningOverview,
  SlotMap,
} from "../types";

export const signingKeys = {
  config: (contractCode: string) =>
    ["signing", "config", contractCode] as const,
  overview: (contractCode: string, userId: string) =>
    ["signing", "overview", contractCode, userId] as const,
  request: (contractCode: string, stepNo: number) =>
    ["signing", "request", contractCode, stepNo] as const,
  digitization: (contractCode: string) =>
    ["signing", "digitization", contractCode] as const,
  verification: (contractCode: string) =>
    ["signing", "verification", contractCode] as const,
};

export function storedSigning(contractCode: string): StoredSigning {
  const stored = signingDb.contracts[contractCode];
  if (!stored) throw new ApiError("CONTRACT_NOT_FOUND");
  return stored;
}

async function buildConfig(contractCode: string): Promise<SigningConfig> {
  const stored = storedSigning(contractCode);
  const summary = await getContractSummary(contractCode);
  const steps: SignStepView[] = stored.steps.map((step) => ({
    ...step,
    organizationName: organizationName(step.organizationId),
  }));
  return {
    contractCode,
    title: summary.title,
    supplierName: organizationName(summary.supplierId),
    valueMillion: summary.valueMillion,
    fileName: stored.fileName,
    pageCount: stored.pageCount,
    digitalSignatureRequired: stored.digitalSignatureRequired,
    steps,
    slots: stored.slots,
    previewPages: stored.previewPages,
  };
}

export async function getSigningConfig(
  contractCode: string,
): Promise<SigningConfig> {
  return simulateLatency(await buildConfig(contractCode), 40);
}

export async function getDefaultSignatureSlots(
  contractCode: string,
): Promise<SlotMap> {
  storedSigning(contractCode);
  return simulateLatency(defaultSlots(), 0);
}

/** Persists the slot layout of a contract. A started signing sequence can no longer be changed. */
export async function saveSignatureSlots(
  contractCode: string,
  slots: SlotMap,
): Promise<SlotMap> {
  const stored = storedSigning(contractCode);
  if (stored.steps.some((step) => step.status === "SIGNED"))
    throw new ApiError("SIGNING_ALREADY_STARTED");
  stored.slots = structuredClone(slots);
  return simulateLatency(stored.slots);
}

export async function getSigningOverview(
  contractCode: string,
  userId: string,
): Promise<SigningOverview> {
  const config = await buildConfig(contractCode);
  const profile = signingDb.profiles[userId];
  const current = config.steps.find((step) => step.status === "CURRENT");
  const mine = config.steps.find((step) => step.signerUserId === userId);
  return simulateLatency(
    {
      ...config,
      currentStepNo: current?.stepNo ?? null,
      myStepNo: mine?.stepNo ?? null,
      lastMethod: profile?.lastMethod ?? "USB_TOKEN",
      certificates: profile?.certificates ?? {},
      anySigned: config.steps.some((step) => step.status === "SIGNED"),
    },
    40,
  );
}
