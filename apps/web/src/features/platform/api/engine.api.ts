import { platform } from "@/shared/api/platform";

export type Decision = "RELEASE" | "HOLD" | "REJECT" | "PENALTY";
export type EngineRow = Record<string, string>;
export interface Trace {
  id: string;
  result: Record<string, unknown>;
  [key: string]: unknown;
}
export interface EvaluationSummary {
  source?: {
    kind: "datapack" | "dataset";
    generatedTemplate?: boolean;
    scopeRows?: number | null;
    unknownScopeIds?: string[];
  };
  contracts: number;
  milestones: number;
  sampleMatched: number | null;
  sampleTotal: number;
  invariantViolations: string[];
  payableMillion: string;
  penaltyMillion: string;
  decisions: Partial<Record<Decision, number>>;
}
export interface Evaluation {
  runId: string;
  rows: EngineRow[];
  traces: Trace[];
  summary: EvaluationSummary;
}

export type DatasetFileStatus =
  "ok" | "missing" | "optional" | "invalid" | "ambiguous";
export interface Dataset {
  id: string;
  name: string;
  createdAt: string;
  createdBy: string;
  files: { name: string; size: number }[];
  report: {
    ok: boolean;
    files: {
      role: string;
      name: string;
      required: boolean;
      status: DatasetFileStatus;
      path: string | null;
      rows: number;
      missingColumns: string[];
    }[];
    scope: { path: string; rows: number; status: DatasetFileStatus } | null;
  };
  lastRun?: { runId: string; at: string; summary: EvaluationSummary };
}
/** Files the engine writes for every run (cli.py --output). */
export const OUTPUT_FILES = [
  "submission_output.csv",
  "audit.json",
  "metrics.json",
] as const;
export type OutputFile = (typeof OUTPUT_FILES)[number];

export const getDecisions = () => platform.get<Evaluation>("/engine/decisions");
export const evaluateDataPack = () =>
  platform.post<Evaluation>("/engine/evaluate", {});
export const listDatasets = () => platform.get<Dataset[]>("/engine/datasets");
export function uploadDataset(files: File[], name?: string) {
  const body = new FormData();
  for (const file of files) body.append("files", file);
  if (name) body.append("name", name);
  return platform.request<Dataset>("/engine/datasets", {
    method: "POST",
    body,
  });
}
export const getDatasetResult = (id: string) =>
  platform.get<Evaluation>(`/engine/datasets/${id}/result`);
export const evaluateDataset = (id: string) =>
  platform.post<Evaluation>(`/engine/datasets/${id}/evaluate`, {});
export const downloadDatasetFile = (id: string, file: OutputFile) =>
  platform.download(`/engine/datasets/${id}/files/${file}`);
export const deleteDataset = (id: string) =>
  platform.request(`/engine/datasets/${id}`, { method: "DELETE" });
