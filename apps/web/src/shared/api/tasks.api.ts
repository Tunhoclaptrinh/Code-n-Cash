import type { TaskRow } from "@codecash/contracts";
import { getPendingTaskCount, getTaskInbox } from "./domain";

export type PendingTask = TaskRow;
export { getPendingTaskCount };

/** Open work of the signed-in user; the API derives it from the latest evaluations. */
export const listPendingTasks = (): Promise<TaskRow[]> => getTaskInbox();
