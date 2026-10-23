import { BadRequestException } from "@nestjs/common";
import type { Ctx } from "./context";
import {
  ListQueryError,
  runList,
  type ListPage,
  type ListSpec,
} from "./listing";
import { toCents } from "./templates";
import type {
  ActivityEntry,
  ContractRow,
  ExceptionQueueRow,
  TaskRow,
} from "./types";
import { activity, contractList, exceptionQueue, taskInbox } from "./views";

/**
 * Paged workflow lists: each request carries page, size, search, filters and sort, and gets one
 * page with the total and the facets the statistics and filter menus need (spec 17: only rows in
 * the actor's scope are ever counted).
 */
function paged<T>(rows: T[], query: unknown, spec: ListSpec<T>): ListPage<T> {
  try {
    return runList(rows, query, spec);
  } catch (error) {
    if (error instanceof ListQueryError)
      throw new BadRequestException(error.message);
    throw error;
  }
}

/** Sortable form of a decimal amount, without floating point. */
const cents = (amount: string | null | undefined) =>
  amount ? Number(toCents(amount)) : 0;

const CONTRACTS: ListSpec<ContractRow> = {
  fields: {
    contract: {
      value: (c) => `${c.id} ${c.title}`,
      filter: "contains",
      sort: true,
    },
    buyer: {
      value: (c) => c.buyer.name,
      filter: "eq",
      sort: true,
      facet: true,
    },
    supplier: {
      value: (c) => c.supplier.name,
      filter: "eq",
      sort: true,
      facet: true,
    },
    type: { value: (c) => c.type, filter: "eq", facet: true },
    policy: { value: (c) => c.approvalPolicy, filter: "eq", facet: true },
    origin: { value: (c) => c.origin, filter: "eq", facet: true },
    status: { value: (c) => c.status, filter: "eq", facet: true },
    yourTurn: { value: (c) => c.yourTurn, filter: "eq", facet: true },
    valueMillion: { value: (c) => cents(c.valueMillion), sort: true },
    nextDue: { value: (c) => c.next?.dueDate ?? "9999", sort: true },
  },
  search: (c) => [c.id, c.title, c.buyer.name, c.supplier.name],
  defaultSort: { by: "contract", order: "asc" },
};

export function listContracts(ctx: Ctx, query: unknown) {
  const list = contractList(ctx);
  return {
    ...paged(list.contracts, query, CONTRACTS),
    organizationName: list.organizationName,
  };
}

const TASKS: ListSpec<TaskRow & { rank: number }> = {
  fields: {
    rank: { value: (r) => r.rank, sort: true },
    contract: {
      value: (r) => `${r.contractId} ${r.contractTitle}`,
      filter: "contains",
      sort: true,
    },
    contractId: { value: (r) => r.contractId, filter: "eq", facet: true },
    kind: { value: (r) => r.kind, filter: "eq", facet: true },
    badge: { value: (r) => r.badge, filter: "eq", facet: true },
    dueDate: { value: (r) => r.dueDate ?? "9999", sort: true },
    amount: { value: (r) => cents(r.amountMillion), sort: true },
  },
  search: (r) => [r.contractId, r.contractTitle, r.milestoneId],
  // The inbox order already puts what is late or waiting for the user first.
  defaultSort: { by: "rank", order: "asc" },
};

export const listTasks = (ctx: Ctx, query: unknown) =>
  paged(
    taskInbox(ctx).map((row, rank) => ({ ...row, rank })),
    query,
    TASKS,
  );

type QueueRow = ExceptionQueueRow & { state: "OPEN" | "PROPOSED" | "DECIDED" };

const EXCEPTIONS: ListSpec<QueueRow> = {
  fields: {
    contract: {
      value: (r) => `${r.contract.id} ${r.milestone.id} ${r.contract.title}`,
      filter: "contains",
      sort: true,
    },
    buyer: {
      value: (r) => r.contract.buyer.name,
      filter: "eq",
      facet: true,
    },
    state: { value: (r) => r.state, filter: "eq", facet: true },
    reason: {
      value: (r) => r.evaluation.reasonCode,
      filter: "eq",
      facet: true,
    },
    amount: { value: (r) => cents(r.milestone.plannedMillion), sort: true },
  },
  search: (r) => [
    r.contract.id,
    r.contract.title,
    r.contract.buyer.name,
    r.contract.supplier.name,
    r.milestone.id,
    ...r.candidates.map((e) => e.id),
    ...r.requests.map((x) => x.id),
  ],
  defaultSort: { by: "contract", order: "asc" },
};

export const listExceptions = (ctx: Ctx, query: unknown) =>
  paged(
    exceptionQueue(ctx).map((row) => ({
      ...row,
      state: row.requests.some((r) => r.status === "PROPOSED")
        ? ("PROPOSED" as const)
        : row.requests.length && !row.candidates.length
          ? ("DECIDED" as const)
          : ("OPEN" as const),
    })),
    query,
    EXCEPTIONS,
  );

/** What an entry did, as one code: the event type, the decision, or the kind of action. */
const actionCode = (e: ActivityEntry) =>
  e.action.kind === "EVENT"
    ? e.action.eventType
    : e.action.kind === "DECISION"
      ? `DECISION_${e.action.decision}`
      : e.action.kind === "WORKFLOW_ACTION"
        ? e.action.code
        : e.action.kind;

const ACTIVITY: ListSpec<ActivityEntry> = {
  fields: {
    at: { value: (e) => e.at, sort: true },
    from: { value: (e) => e.at.slice(0, 10), filter: "gte" },
    to: { value: (e) => e.at.slice(0, 10), filter: "lte" },
    category: { value: (e) => e.category, filter: "eq", facet: true },
    actorRole: { value: (e) => e.actor.role, filter: "eq", facet: true },
    actorId: { value: (e) => e.actor.id, filter: "eq", facet: true },
    action: { value: actionCode, filter: "eq", facet: true },
    contractCode: { value: (e) => e.contractCode, filter: "eq", facet: true },
    origin: { value: (e) => e.origin, filter: "eq", facet: true },
  },
  search: (e) => [
    e.contractCode,
    e.milestoneId,
    e.actor.displayName,
    e.id,
    actionCode(e),
    e.action.kind === "REQUEST_INFO" ? e.action.text : null,
  ],
  defaultSort: { by: "at", order: "desc" },
};

export function listActivity(ctx: Ctx, query: unknown) {
  const entries = activity(ctx);
  const names = new Map(
    entries.map((e) => [e.actor.id, e.actor.displayName ?? ""]),
  );
  return {
    ...paged(entries, query, ACTIVITY),
    /** Display name of each actor in the facets (the filter menu shows names, not ids). */
    actorNames: Object.fromEntries(names),
  };
}
