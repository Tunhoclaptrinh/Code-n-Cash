import { ApiError, simulateLatency } from '@/shared/api/client';
import { updateContractSummary } from '@/shared/api/contracts.api';
import { adjustPendingTaskCount } from '@/shared/api/tasks.api';
import { REQUEST_LIFETIME_MS, signingDb } from '../mock/signingDb';
import type { SignMethod, SigningRequest } from '../types';
import { storedSigning } from './signingConfig.api';

/** The simulated signer confirms on the phone a few seconds after the request is sent. */
const SIMULATED_CONFIRM_DELAY_MS = 7000;

function findRequest(contractCode: string, stepNo: number): SigningRequest | undefined {
  return [...signingDb.requests].reverse().find((r) => r.contractCode === contractCode && r.stepNo === stepNo);
}

/** Records the signature on the file, advances the sequence and updates everything that depends on it. */
async function completeRequest(request: SigningRequest): Promise<void> {
  request.status = 'COMPLETED';
  const stored = storedSigning(request.contractCode);
  const step = stored.steps.find((candidate) => candidate.stepNo === request.stepNo);
  if (!step) throw new ApiError('STEP_NOT_FOUND');
  const signedAt = new Date().toISOString();
  step.status = 'SIGNED';
  step.signedAt = signedAt;
  step.method = request.method;
  const next = stored.steps.find((candidate) => candidate.stepNo === request.stepNo + 1);
  if (next) next.status = 'CURRENT';

  const profile = (signingDb.profiles[step.signerUserId] ??= { lastMethod: request.method, certificates: {} });
  profile.lastMethod = request.method;
  const certificate = profile.certificates[request.method];
  const fallbackExpiry = new Date(signedAt);
  fallbackExpiry.setFullYear(fallbackExpiry.getFullYear() + 2);

  const signatures = (signingDb.verifications[request.contractCode] ??= []);
  const record = {
    stepNo: step.stepNo,
    party: step.party,
    signerName: step.signerName,
    signedAt,
    method: request.method,
    certExpiryMonth: certificate?.expiryMonth ?? fallbackExpiry.getMonth() + 1,
    certExpiryYear: certificate?.expiryYear ?? fallbackExpiry.getFullYear(),
    status: 'VALID' as const,
    contentIntact: true,
  };
  const existing = signatures.findIndex((signature) => signature.stepNo === step.stepNo);
  if (existing >= 0) signatures[existing] = record;
  else signatures.push(record);

  adjustPendingTaskCount(step.signerUserId, -1);

  if (signatures.length >= stored.steps.length) {
    await updateContractSummary(request.contractCode, {
      status: 'AWAITING_EVIDENCE',
      waitingFor: { kind: 'SUPPLIER_SUBMITS_EVIDENCE', milestoneNo: 1 },
      isNewlyDigitized: false,
    });
  }
}

/** Reading a request also lets the simulated phone side progress (expiry, auto-confirmation). */
export async function getSigningRequest(contractCode: string, stepNo: number): Promise<SigningRequest | null> {
  const request = findRequest(contractCode, stepNo);
  if (request?.status === 'PENDING') {
    const now = Date.now();
    if (new Date(request.expiresAt).getTime() <= now) request.status = 'EXPIRED';
    else if (request.autoConfirmAt && new Date(request.autoConfirmAt).getTime() <= now) await completeRequest(request);
  }
  return simulateLatency(request ?? null, 40);
}

export async function sendSigningRequest(
  contractCode: string,
  stepNo: number,
  method: SignMethod,
): Promise<SigningRequest> {
  const stored = storedSigning(contractCode);
  const step = stored.steps.find((candidate) => candidate.stepNo === stepNo);
  if (!step) throw new ApiError('STEP_NOT_FOUND');
  if (step.status !== 'CURRENT') throw new ApiError('NOT_YOUR_TURN');
  if (method === 'IMAGE' && stored.digitalSignatureRequired) throw new ApiError('IMAGE_NOT_ALLOWED');

  for (const open of signingDb.requests) {
    if (open.contractCode === contractCode && open.stepNo === stepNo && open.status === 'PENDING') {
      open.status = 'CANCELLED';
    }
  }
  const now = Date.now();
  const request: SigningRequest = {
    id: `rq-${now}`,
    contractCode,
    stepNo,
    method,
    status: 'PENDING',
    code: String(Math.floor(1000 + Math.random() * 9000)),
    sentAt: new Date(now).toISOString(),
    expiresAt: new Date(now + REQUEST_LIFETIME_MS).toISOString(),
    autoConfirmAt: new Date(now + SIMULATED_CONFIRM_DELAY_MS).toISOString(),
  };
  signingDb.requests.push(request);
  return simulateLatency(request);
}

function pendingRequest(contractCode: string, stepNo: number): SigningRequest {
  const request = findRequest(contractCode, stepNo);
  if (!request || request.status !== 'PENDING') throw new ApiError('REQUEST_NOT_PENDING');
  return request;
}

/** The signer approves on their phone. */
export async function confirmSigningRequest(contractCode: string, stepNo: number): Promise<SigningRequest> {
  const request = pendingRequest(contractCode, stepNo);
  await completeRequest(request);
  return simulateLatency(request);
}

/** The signer rejects on their phone. */
export async function rejectSigningRequest(contractCode: string, stepNo: number): Promise<SigningRequest> {
  const request = pendingRequest(contractCode, stepNo);
  request.status = 'REJECTED';
  return simulateLatency(request);
}

/** The requester withdraws the pending request, which unlocks the file. */
export async function cancelSigningRequest(contractCode: string, stepNo: number): Promise<SigningRequest> {
  const request = pendingRequest(contractCode, stepNo);
  request.status = 'CANCELLED';
  return simulateLatency(request);
}

/** Cancels the whole signing sequence. Only possible while nobody has signed. */
export async function cancelSigning(contractCode: string): Promise<void> {
  const stored = storedSigning(contractCode);
  if (stored.steps.some((step) => step.status === 'SIGNED')) throw new ApiError('SIGNING_ALREADY_STARTED');
  for (const request of signingDb.requests) {
    if (request.contractCode === contractCode && request.status === 'PENDING') request.status = 'CANCELLED';
  }
  return simulateLatency(undefined, 80);
}
