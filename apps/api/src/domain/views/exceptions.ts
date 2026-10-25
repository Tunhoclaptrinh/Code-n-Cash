import type { Ctx } from "../context";
import type { ExceptionQueueRow } from "../types";
import { toException } from "./shared";
import { voidCandidates } from "./milestones";

export function exceptionQueue(ctx: Ctx): ExceptionQueueRow[] {
  const rows: ExceptionQueueRow[] = [];
  for (const contract of ctx.visibleContracts()) {
    for (const m of ctx.milestonesOf(contract.contract_id)) {
      if (!ctx.hasEvaluation(m.milestone_id)) continue;
      const evaluation = ctx.evaluation(m.milestone_id);
      const requests = ctx.exceptionsOf(m.milestone_id);
      if (
        !requests.length &&
        !["UNAUTHORIZED_EVENT", "UNRESOLVED_CONDITION"].includes(
          evaluation.reasonCode,
        )
      )
        continue;
      rows.push({
        contract: ctx.contractRow(contract),
        milestone: ctx.milestoneRow(m),
        evaluation,
        candidates: voidCandidates(ctx, m).map((e) => ctx.eventRow(e)),
        requests: requests.map(toException),
      });
    }
  }
  return rows;
}
