import { workflowCall } from "@/shared/api/workflow";
import type { ActivityEntry } from "../types";
/** The log is append-only: there is deliberately no update or delete function. */
export async function listActivityEntries(): Promise<ActivityEntry[]> {
  return workflowCall("audit-activity", "listActivityEntries", []);
}
export async function getDefaultActivityRange(): Promise<{
  from: string;
  to: string;
}> {
  return workflowCall("audit-activity", "getDefaultActivityRange", []);
}
