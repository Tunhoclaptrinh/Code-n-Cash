import { workflowCall } from "@/shared/api/workflow";
import type { Task, TaskRow } from "../types";
export function taskHref(target: Task["target"]): string {
  switch (target.screen) {
    case "EVIDENCE":
      return `/submissions/${target.contractId}/${target.milestoneNo}`;
    case "APPROVAL":
      return `/approvals/${target.contractId}/${target.milestoneNo}`;
    case "SIGNING":
      return `/contracts/${target.contractId}/signing/${target.stepNo ?? 1}`;
  }
}
/** Open work items for one user, in priority order. */
export async function getTaskInbox(userId: string): Promise<TaskRow[]> {
  return workflowCall("milestones-tasks", "getTaskInbox", [userId]);
}
