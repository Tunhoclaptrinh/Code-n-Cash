import { Inject, Injectable, Logger } from "@nestjs/common";
import { recordHash } from "../common/audit-chain";
import { Repository } from "../common/repository";
import { BaseService } from "../common/services/base.service";
import type { Actor, RecordEntity } from "../common/types";
import type { Outcome } from "./actions";
import type { AccountSpec } from "./accounts";
import { Ctx, READ_TABLES } from "./context";
import { applyRun, assertEngineOutcome, runEngine } from "./engine";
import { dataPackSeal, TABLE, type Tables } from "./records";
import { buildSeed } from "./seed";
import type { Evaluation } from "./types";

const WRITE_TABLES = READ_TABLES.filter(
  (name) => !["users", "organizations", "milestone-templates"].includes(name),
);

/**
 * The workflow database. Reads build a per-user view; writes run in one transaction that records
 * the change, re-evaluates with the Python engine and appends the status history and audit.
 */
@Injectable()
export class DomainService {
  private readonly logger = new Logger("Domain");
  constructor(
    @Inject(Repository) private repo: Repository,
    @Inject(BaseService) private base: BaseService,
  ) {}

  /**
   * First start: imports the Data Pack, adds the seed data and evaluates everything once.
   * Returns the accounts to create, so the caller can hash their passwords.
   */
  async bootstrap(): Promise<AccountSpec[]> {
    if ((await this.repo.list(TABLE.contracts)).length) return [];
    const started = Date.now();
    const seed = await buildSeed();
    await this.repo.transact(
      [...WRITE_TABLES, "organizations", "milestone-templates", "settings"],
      async (tables) => {
        for (const [name, rows] of Object.entries(seed.tables))
          tables[name].splice(0, tables[name].length, ...rows);
        const replace = (name: string, rows: RecordEntity[]) => {
          const ids = new Set(rows.map((r) => r.id));
          tables[name].splice(
            0,
            tables[name].length,
            ...tables[name].filter((r) => !ids.has(r.id)),
            ...rows,
          );
        };
        replace("organizations", seed.organizations);
        replace("milestone-templates", seed.templates);
        replace("settings", seed.settings);
        const outcome = await runEngine(tables);
        applyRun(tables, outcome, { kind: "IMPORT" });
        return { runId: outcome.runId, seal: dataPackSeal(tables) };
      },
      // First entry of the audit chain: the hash of the organiser's data as imported.
      ({ runId, seal }) => {
        const now = new Date().toISOString();
        return [
          {
            id: `import-${runId}`,
            version: 1,
            createdAt: now,
            updatedAt: now,
            organizationId: "OPS",
            actorId: "system",
            action: "IMPORT_DATA_PACK",
            resource: "datapack",
            recordId: runId,
            seal,
          },
        ];
      },
    );
    this.logger.log(
      `Imported the Data Pack and seed data in ${Date.now() - started} ms`,
    );
    return seed.accounts;
  }

  async resetDemo(): Promise<AccountSpec[]> {
    await this.repo.reset();
    return this.bootstrap();
  }

  private async load(names: string[]): Promise<Tables> {
    const tables: Tables = {};
    for (const name of names) tables[name] = await this.repo.list(name);
    return tables;
  }

  /** Runs the engine on the current data plus hypothetical events (preview, nothing is stored). */
  dryRun(tables: Tables) {
    return async (events: RecordEntity[]): Promise<Map<string, Evaluation>> => {
      const outcome = await runEngine(tables, events as never);
      assertEngineOutcome(outcome);
      return outcome.evaluations;
    };
  }

  async read<T>(
    actor: Actor,
    fn: (
      ctx: Ctx,
      dryRun: ReturnType<DomainService["dryRun"]>,
    ) => T | Promise<T>,
    extra: string[] = [],
  ): Promise<T> {
    const tables = await this.load([...READ_TABLES, ...extra]);
    return fn(new Ctx(tables, actor), this.dryRun(tables));
  }

  /**
   * Applies an action, re-evaluates when it recorded something the engine reads, and stores it all
   * with one audit entry per change. Returns the action result and the milestone's new evaluation.
   */
  async write<T>(
    actor: Actor,
    action: string,
    fn: (ctx: Ctx) => Outcome<T> | Promise<Outcome<T>>,
    contractReference = "",
  ): Promise<T & { evaluation?: Evaluation | null }> {
    let done!: Outcome<T>;
    let evaluation: Evaluation | null = null;
    await this.repo.transact(
      [...READ_TABLES],
      async (tables) => {
        const ctx = new Ctx(tables, actor);
        done = await fn(ctx);
        if (done.evaluate) {
          const outcome = await runEngine(tables);
          applyRun(tables, outcome, done.trigger);
          if (done.milestoneId)
            evaluation = outcome.evaluations.get(done.milestoneId) ?? null;
        }
        return done;
      },
      (result) => {
        const reference =
          result.audit[0]?.contractId ??
          result.events[0]?.contract_id ??
          result.milestoneId ??
          contractReference;
        const entries = [
          {
            ...this.base.auditRecord(
              action,
              "workflow",
              String(reference),
              actor,
            ),
            milestoneId: result.milestoneId,
            contractId: String(reference),
            eventIds: result.events.map((e) => e.event_id),
            // Sealed with the chained entry: the integrity check finds any later edit of the event.
            eventHashes: Object.fromEntries(
              result.events.map((e) => [e.event_id, recordHash(e)]),
            ),
          },
        ];
        for (const item of result.audit)
          entries.push({
            ...this.base.auditRecord(
              action,
              "workflow",
              item.contractId,
              actor,
            ),
            contractId: item.contractId,
            milestoneId: item.milestoneId,
            category: item.category,
            detail: item.detail,
            at: new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 19),
            eventIds: [],
          } as never);
        return entries;
      },
    );
    const result = done.result as T;
    return result && typeof result === "object" && !Array.isArray(result)
      ? { ...result, ...(done.evaluate ? { evaluation } : {}) }
      : (result as T & { evaluation?: Evaluation | null });
  }
}
