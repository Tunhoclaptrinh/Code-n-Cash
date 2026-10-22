import { db } from "../mock/db";
import { simulateLatency } from "./client";

export async function getPendingTaskCount(userId: string): Promise<number> {
  return simulateLatency(db.pendingTaskCount[userId] ?? 0, 40);
}

/** Features call this after they complete or create work for a user. */
export function adjustPendingTaskCount(userId: string, delta: number): void {
  db.pendingTaskCount[userId] = Math.max(
    0,
    (db.pendingTaskCount[userId] ?? 0) + delta,
  );
}
