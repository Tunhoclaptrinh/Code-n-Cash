import type { RecordEntity } from "../../common/types";
import { type Ctx, today } from "../context";
import { type HistoryRecord, TABLE } from "../records";
import type {
  ActivityAction,
  ActivityCategory,
  ActivityEntry,
  EventStatus,
  EventType,
} from "../types";

const categoryOf = (type: string): ActivityCategory =>
  type === "CONTRACT_SIGNED"
    ? "SIGN"
    : type === "APPROVAL" || type === "REJECTION"
      ? "APPROVAL"
      : type.startsWith("DISPUTE")
        ? "DISPUTE"
        : "EVIDENCE";

export function activity(ctx: Ctx): ActivityEntry[] {
  const visible = new Set(ctx.visibleContracts().map((c) => c.contract_id));
  const sequenceOf = new Map(
    ctx.milestones.map((m) => [m.milestone_id, Number(m.milestone_sequence)]),
  );
  const entries: ActivityEntry[] = [];
  for (const e of ctx.events) {
    if (!visible.has(e.contract_id)) continue;
    const party = ctx.party(e.actor_party_id);
    entries.push({
      id: e.event_id,
      at: e.event_timestamp,
      actor: {
        id: e.recordedByUserId ?? e.actor_party_id,
        displayName: e.recordedBy ?? party?.party_name ?? e.actor_party_id,
        role:
          party?.party_type === "APPROVER"
            ? (party.approval_role as ActivityEntry["actor"]["role"])
            : ((party?.party_type ??
                "SYSTEM") as ActivityEntry["actor"]["role"]),
      },
      category: categoryOf(e.event_type),
      action: {
        kind: "EVENT",
        eventType: e.event_type as EventType,
        status: e.event_status as EventStatus,
        eventId: e.event_id,
      },
      contractCode: e.contract_id,
      milestoneId: e.milestone_id,
      milestoneNo: sequenceOf.get(e.milestone_id) ?? null,
      origin: e.origin,
    });
  }
  for (const h of ctx.t[TABLE.history] as HistoryRecord[]) {
    if (!visible.has(h.contractId) || h.trigger.kind === "IMPORT") continue;
    entries.push({
      id: h.id,
      at: h.at.slice(0, 19),
      actor: { id: "system", displayName: null, role: "SYSTEM" },
      category: "SYSTEM",
      action: {
        kind: "DECISION",
        decision: h.to.decision,
        reasonCode: h.to.reasonCode,
        status: h.to.status,
        previous: h.from?.status ?? null,
        runId: h.runId,
      },
      contractCode: h.contractId,
      milestoneId: h.milestoneId,
      milestoneNo: sequenceOf.get(h.milestoneId) ?? null,
      origin: "APP",
    });
  }
  const users = new Map(ctx.users().map((u) => [u.id, u]));
  const auditEntries = (ctx.t.audit ?? []) as RecordEntity[];
  const detailed = new Set(
    auditEntries
      .filter((entry) => entry.detail)
      .map((entry) => entry.transactionId),
  );
  const primaryByTransaction = new Map(
    auditEntries
      .filter((entry) => entry.changes)
      .map((entry) => [entry.transactionId, entry]),
  );
  for (const entry of auditEntries) {
    const contractCode = String(entry.contractId ?? "");
    if (
      entry.resource !== "workflow" ||
      !visible.has(contractCode) ||
      (!entry.detail && detailed.has(entry.transactionId))
    )
      continue;
    const user = users.get(String(entry.actorId));
    entries.push({
      id: entry.id,
      at: String(
        entry.at ??
          new Date(
            Date.parse(String(entry.createdAt)) + 7 * 3_600_000,
          ).toISOString(),
      ).slice(0, 19),
      actor: {
        id: String(entry.actorId),
        displayName: String(
          entry.actorName ?? user?.displayName ?? entry.actorId,
        ),
        role:
          ((entry.actorRole ?? user?.role) as ActivityEntry["actor"]["role"]) ??
          "SYSTEM",
      },
      category: (entry.category as ActivityCategory) ?? "SYSTEM",
      action: (entry.detail as ActivityAction) ?? {
        kind: "WORKFLOW_ACTION",
        code: String(entry.action),
      },
      contractCode,
      milestoneId: (entry.milestoneId as string) ?? null,
      milestoneNo: entry.milestoneId
        ? (sequenceOf.get(String(entry.milestoneId)) ?? null)
        : null,
      origin: "APP",
      audit: (() => {
        const primary = primaryByTransaction.get(entry.transactionId) ?? entry;
        const changes = (primary.changes ?? []) as NonNullable<
          ActivityEntry["audit"]
        >["changes"];
        return {
          seq: Number(entry.seq),
          hash: String(entry.hash),
          transactionId: entry.transactionId as string,
          requestId: entry.requestId as string,
          outcome: entry.outcome as string,
          changes: changes?.filter((change) => {
            const row = ctx.t[change.resource]?.find(
              (item) => item.id === change.recordId,
            );
            const reference =
              row?.contract_id ??
              row?.contractCode ??
              row?.contractId ??
              change.fields.contract_id?.before ??
              change.fields.contractCode?.before;
            return (
              reference === contractCode ||
              change.recordId === contractCode ||
              change.recordId === `draft-${contractCode}`
            );
          }),
        };
      })(),
    });
  }
  return entries.sort(
    (a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id),
  );
}

export function activityRange(ctx: Ctx) {
  const visible = new Set(ctx.visibleContracts().map((c) => c.contract_id));
  const stamps = ctx.events
    .filter((e) => visible.has(e.contract_id))
    .map((e) => e.event_timestamp)
    .sort();
  const last = (stamps.at(-1) ?? today()).slice(0, 10);
  return {
    from: (stamps[0] ?? today()).slice(0, 10),
    to: last > today() ? last : today(),
  };
}
