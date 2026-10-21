import { simulateLatency } from '@/shared/api/client';
import { defaultRange, seedActivity } from '../mock/activity';
import type { ActivityEntry } from '../types';

/** The log is append-only: there is deliberately no update or delete function. */
export async function listActivityEntries(): Promise<ActivityEntry[]> {
  return simulateLatency(seedActivity);
}

export async function getDefaultActivityRange(): Promise<{ from: string; to: string }> {
  return simulateLatency(defaultRange, 0);
}
