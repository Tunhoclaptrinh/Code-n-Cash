import type { Ctx } from "../context";
import {
  type EventRecord,
  type ExceptionRecord,
  type HistoryRecord,
  TABLE,
} from "../records";
import type { Evaluation, StatusChange } from "../types";

/** Runs the engine on the live data plus hypothetical events and returns the new evaluations. */
export type DryRun = (
  events: EventRecord[],
) => Promise<Map<string, Evaluation>>;

export const routes = {
  submission: (c: string, n: number) => `/submissions/${c}/${n}`,
  approval: (c: string, n: number) => `/approvals/${c}/${n}`,
  decision: (c: string, n: number) =>
    `/contracts/${c}/milestones/${n}/decision`,
  dispute: (c: string, n: number) => `/contracts/${c}/milestones/${n}/dispute`,
  signing: (c: string) => `/contracts/${c}/signing`,
};

export const historyOf = (
  ctx: Ctx,
  filter: (h: HistoryRecord) => boolean,
): StatusChange[] =>
  (ctx.t[TABLE.history] as HistoryRecord[])
    .filter(filter)
    .map(({ id, milestoneId, contractId, runId, at, from, to, trigger }) => ({
      id,
      milestoneId,
      contractId,
      runId,
      at,
      from,
      to,
      trigger,
    }))
    .sort((a, b) => a.at.localeCompare(b.at));

export const toException = (x: ExceptionRecord) => ({
  id: x.id,
  milestoneId: x.milestoneId,
  contractId: x.contractId,
  eventId: x.eventId,
  action: x.action,
  reason: x.reason,
  proposedBy: x.proposedBy,
  proposedAt: x.proposedAt,
  status: x.status,
  decidedBy: x.decidedBy,
  decidedAt: x.decidedAt,
  decisionNote: x.decisionNote,
});
