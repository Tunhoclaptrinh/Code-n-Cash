import { workflowCall } from "@/shared/api/workflow";
export async function getPendingTaskCount(userId: string): Promise<number> {
  return workflowCall("shared-tasks", "getPendingTaskCount", [userId]);
}
/** Features call this after they complete or create work for a user. */
