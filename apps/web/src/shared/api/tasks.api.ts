/** Features call this after they complete or create work for a user. */
import { workflowCall } from "@/shared/api/workflow";

export async function getPendingTaskCount(userId: string): Promise<number> {
  return workflowCall("shared-tasks", "getPendingTaskCount", [userId]);
}

/** The fields of an inbox row the header notification list shows. */
export interface PendingTask {
  id: string;
  kind: string;
  contractId: string;
  heading:
    | { kind: "MILESTONE"; no: number; milestoneKind: string }
    | { kind: "TITLE"; title: string };
  dueDate: string;
  overdueDays: number;
  href: string;
}

export async function listPendingTasks(userId: string): Promise<PendingTask[]> {
  return workflowCall("milestones-tasks", "getTaskInbox", [userId]);
}
