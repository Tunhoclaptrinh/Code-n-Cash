import type {
  ActivityEntry,
  ContractRow,
  ListPage,
  ListQuery,
  ApprovalView,
  ContractDraft,
  ContractList,
  ContractOverview,
  Digitization,
  DisputeView,
  Evaluation,
  EvidenceWorkspace,
  ExceptionQueueRow,
  IntegrityReport,
  MilestoneDetail,
  SmartContractView,
  SignMethod,
  SigningConfig,
  SigningOverview,
  SigningRequest,
  SlotMap,
  TaskRow,
  TimelinePoint,
  UploadFormOptions,
  VerificationResult,
  DashboardView,
} from "@codecash/contracts";
import { ApiError as HttpError } from "@codecash/api-client";
import { ApiError } from "./client";
import { platform } from "./platform";
import { workflowCall } from "./workflow";

/** Query keys of the workflow; every write invalidates them (shared/auth/session.tsx). */
export const WORKFLOW_KEYS = [
  "anchors",
  "rule-versions",
  "extraction",
  "contract-summaries",
  "milestones",
  "pending-task-count",
  "pending-tasks",
  "activity-log",
  "dispute",
  "exceptions",
  "signing",
  "contract-view",
  "contract-draft",
  "integrity",
  "dashboard",
];

type MilestoneRef = { contractId: string; sequence: number };
type WithEvaluation<T> = T & { evaluation?: Evaluation | null };

/* ------------------------------ contracts ------------------------------ */

export const getContractList = () =>
  workflowCall<ContractList>("contracts", "getContractList", []);
/** One page of the contracts in scope (search, filters and sort are applied on the server). */
export const listContracts = (query: ListQuery) =>
  workflowCall<ListPage<ContractRow> & { organizationName: string }>(
    "contracts",
    "listContracts",
    [query],
  );
export const getContractOverview = (contractId: string) =>
  workflowCall<ContractOverview>("contracts", "getContractOverview", [
    contractId,
  ]);
export const getSmartContract = (contractId: string) =>
  workflowCall<SmartContractView>("contracts", "getSmartContract", [
    contractId,
  ]);
/** The contract's decisions with their input and seals, for `tools/verify_decision.py`. */
export const getVerificationBundle = (contractId: string) =>
  workflowCall<Record<string, unknown>>("contracts", "getVerificationBundle", [
    contractId,
  ]);
export const getMilestoneDetail = (contractId: string, sequence: number) =>
  workflowCall<MilestoneDetail>("contracts", "getMilestoneDetail", [
    contractId,
    sequence,
  ]);
export const getMilestoneTimeline = (contractId: string, sequence: number) =>
  workflowCall<TimelinePoint[]>("contracts", "getMilestoneTimeline", [
    contractId,
    sequence,
  ]);

/* -------------------------------- tasks -------------------------------- */

export const getTaskInbox = () =>
  workflowCall<TaskRow[]>("tasks", "getTaskInbox", []);
export const listTasks = (query: ListQuery) =>
  workflowCall<ListPage<TaskRow & { rank: number }>>("tasks", "listTasks", [
    query,
  ]);
export const getPendingTaskCount = () =>
  workflowCall<number>("tasks", "getPendingTaskCount", []);

/* ------------------------------- evidence ------------------------------- */

export const getEvidenceWorkspace = (contractId?: string, sequence?: number) =>
  workflowCall<EvidenceWorkspace>("evidence", "getEvidenceWorkspace", [
    contractId,
    sequence,
  ]);
/** Uploads the file itself; the API stores it under its SHA-256 and attaches it to the milestone. */
export async function uploadEvidenceFile(
  input: MilestoneRef & { eventType: string; file: File },
) {
  const body = new FormData();
  body.append("contractId", input.contractId);
  body.append("sequence", String(input.sequence));
  body.append("eventType", input.eventType);
  body.append("file", input.file);
  try {
    const result = await platform.request<{ id: string }>(
      "/evidence-documents",
      { method: "POST", body },
    );
    window.dispatchEvent(new Event("codecash:workflow-changed"));
    return result;
  } catch (error) {
    if (error instanceof HttpError) throw new ApiError(error.code);
    throw error;
  }
}
export const removeEvidenceFile = (
  input: MilestoneRef & { attachmentId: string },
) =>
  workflowCall<{ removed: boolean }>("evidence", "removeEvidenceFile", [input]);
export const submitEvidence = (input: MilestoneRef) =>
  workflowCall<WithEvaluation<{ eventIds: string[] }>>(
    "evidence",
    "submitEvidence",
    [input],
  );

/* ------------------------------- approvals ------------------------------- */

export const getApprovalView = (contractId?: string, sequence?: number) =>
  workflowCall<ApprovalView>("approvals", "getApprovalView", [
    contractId,
    sequence,
  ]);
export type VoteChoice = "APPROVE" | "REJECT" | "REQUEST_INFO";
export const castVote = (
  input: MilestoneRef & { choice: VoteChoice; note?: string },
) =>
  workflowCall<WithEvaluation<{ eventIds?: string[]; noted?: boolean }>>(
    "approvals",
    "castVote",
    [input],
  );

/* ------------------------------- disputes ------------------------------- */

export const getDispute = (contractId: string, sequence: number) =>
  workflowCall<DisputeView>("disputes", "getDispute", [contractId, sequence]);
export const openDispute = (input: MilestoneRef & { note: string }) =>
  workflowCall<WithEvaluation<{ eventIds: string[] }>>(
    "disputes",
    "openDispute",
    [input],
  );
export const resolveDispute = (
  input: MilestoneRef & { option: "RESOLVE" | "REQUEST_INFO"; note: string },
) =>
  workflowCall<WithEvaluation<{ eventIds?: string[]; noted?: boolean }>>(
    "disputes",
    "resolveDispute",
    [input],
  );

/* ------------------------- payment and exceptions ------------------------- */

export const retryPaymentDelivery = (paymentId: string) =>
  workflowCall<{ paymentId: string }>("payments", "retryPaymentDelivery", [
    paymentId,
  ]);
export const transferToAccounting = (input: MilestoneRef) =>
  workflowCall<{ paymentId: string }>("payments", "transferToAccounting", [
    input,
  ]);
export const listExceptionQueue = () =>
  workflowCall<ExceptionQueueRow[]>("exceptions", "listExceptionQueue", []);
export type QueueRow = ExceptionQueueRow & {
  state: "OPEN" | "PROPOSED" | "DECIDED";
};
export const listExceptions = (query: ListQuery) =>
  workflowCall<ListPage<QueueRow>>("exceptions", "listExceptions", [query]);
export const proposeException = (
  input: MilestoneRef & { eventId: string; reason: string },
) => workflowCall<{ id: string }>("exceptions", "proposeException", [input]);
export const decideException = (input: {
  exceptionId: string;
  approve: boolean;
  note?: string;
}) =>
  workflowCall<WithEvaluation<{ status: string }>>(
    "exceptions",
    "decideException",
    [input],
  );

/** Audit chain, sealed evidence and decisions re-run; `anchor` is a saved head ("seq:hash"). */
export const getDashboard = () =>
  workflowCall<DashboardView>("dashboard", "getDashboard", []);

export const verifyIntegrity = (anchor?: string) =>
  workflowCall<IntegrityReport>("integrity", "verifyIntegrity", [anchor]);

/* ------------------------------- signing ------------------------------- */

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

export const getSigningConfig = (contractCode: string) =>
  workflowCall<SigningConfig>("signing", "getSigningConfig", [contractCode]);
export const getDefaultSignatureSlots = (contractCode: string) =>
  workflowCall<SlotMap>("signing", "getDefaultSignatureSlots", [contractCode]);
export const saveSignatureSlots = (
  contractCode: string,
  slots: SlotMap,
  layout?: { documentSha256?: string; version?: number },
) =>
  workflowCall<SlotMap>("signing", "saveSignatureSlots", [
    contractCode,
    slots,
    layout,
  ]);
export const getSigningOverview = (contractCode: string) =>
  workflowCall<SigningOverview>("signing", "getSigningOverview", [
    contractCode,
  ]);
export const getSigningRequest = (contractCode: string, stepNo: number) =>
  workflowCall<SigningRequest | null>("signing", "getSigningRequest", [
    contractCode,
    stepNo,
  ]);
export const sendSigningRequest = (
  contractCode: string,
  stepNo: number,
  method: SignMethod,
) =>
  workflowCall<SigningRequest>("signing", "sendSigningRequest", [
    contractCode,
    stepNo,
    method,
  ]);
export const confirmSigningRequest = (contractCode: string, stepNo: number) =>
  workflowCall<SigningRequest>("signing", "confirmSigningRequest", [
    contractCode,
    stepNo,
  ]);
export const rejectSigningRequest = (contractCode: string, stepNo: number) =>
  workflowCall<SigningRequest>("signing", "rejectSigningRequest", [
    contractCode,
    stepNo,
  ]);
export const cancelSigningRequest = (contractCode: string, stepNo: number) =>
  workflowCall<SigningRequest>("signing", "cancelSigningRequest", [
    contractCode,
    stepNo,
  ]);
export const cancelSigning = (contractCode: string) =>
  workflowCall<{ cancelled: boolean }>("signing", "cancelSigning", [
    contractCode,
  ]);
export const getVerification = (contractCode: string) =>
  workflowCall<VerificationResult>("signing", "getVerification", [
    contractCode,
  ]);

/* ---------------------------- upload and digitisation ---------------------------- */

export const getContractDraft = (code?: string, fresh = false) =>
  workflowCall<ContractDraft>("drafts", "getContractDraft", [code, fresh]);
export const getUploadFormOptions = () =>
  workflowCall<UploadFormOptions>("drafts", "getUploadFormOptions", []);
export const saveContractDraft = (draft: ContractDraft) =>
  workflowCall<ContractDraft>("drafts", "saveContractDraft", [draft]);
export const getDigitization = (contractCode: string) =>
  workflowCall<Digitization>("drafts", "getDigitization", [contractCode]);
export const confirmDigitization = (
  contractCode: string,
  input: { dueDate: string | null },
) =>
  workflowCall<Digitization>("drafts", "confirmDigitization", [
    contractCode,
    input,
  ]);

/* ------------------------------- activity ------------------------------- */

export const listActivityEntries = () =>
  workflowCall<ActivityEntry[]>("activity", "listActivityEntries", []);
export const listActivity = (query: ListQuery) =>
  workflowCall<
    ListPage<ActivityEntry> & { actorNames: Record<string, string> }
  >("activity", "listActivity", [query]);
export const getDefaultActivityRange = () =>
  workflowCall<{ from: string; to: string }>(
    "activity",
    "getDefaultActivityRange",
    [],
  );
