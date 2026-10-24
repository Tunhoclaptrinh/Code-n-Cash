import {
  Injectable,
  OnModuleDestroy,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import mongoose from "mongoose";
import type { RecordEntity } from "./types";
import { chainHead, seal } from "./audit-chain";
import { repoRoot } from "./paths";
import { auditChanges, enrichAudit } from "./audit-events";
/** Adapted from UniFlow's repository/service boundary. Application writes include their audit entry. */
@Injectable()
export class Repository implements OnModuleDestroy {
  private data: Record<string, RecordEntity[]> = {};
  private queue: Promise<unknown> = Promise.resolve();
  private db?: mongoose.Connection;
  readonly driver = process.env.STORAGE_DRIVER ?? "file";
  readonly path = resolve(
    repoRoot(),
    process.env.DATA_DIR ?? ".data",
    "records.json",
  );
  async init() {
    if (this.driver === "mongo") {
      if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required");
      this.db = await mongoose
        .createConnection(process.env.MONGO_URI)
        .asPromise();
      for (const name of [
        "organizations",
        "users",
        "contract-drafts",
        "milestone-templates",
        "settings",
        "contract-templates",
        "app-migrations",
        "documents",
        "datasets",
        "audit",
        // Workflow database (apps/api/src/domain/records.ts).
        "parties",
        "contracts",
        "milestones",
        "events",
        "payment-rules",
        "evaluations",
        "status-history",
        "engine-runs",
        "signing",
        "signing-requests",
        "signing-profiles",
        "attachments",
        "notes",
        "exceptions",
        "payments",
        "anchor-jobs",
        "extraction-proposals",
        "rule-versions",
      ])
        await this.db.collection(name).createIndex({ id: 1 }, { unique: true });
      for (const [name, field] of [
        ["users", "email"],
        ["organizations", "code"],
        ["contract-drafts", "code"],
        // One entry per position in the audit chain, even with several API instances.
        ["audit", "seq"],
      ])
        await this.db
          .collection(name)
          .createIndex({ [field]: 1 }, { unique: true, sparse: true });
      return;
    }
    if (this.driver !== "file") throw new Error("UNKNOWN_STORAGE_DRIVER");
    if (process.env.NODE_ENV === "production")
      throw new Error("Production requires STORAGE_DRIVER=mongo");
    try {
      this.data = JSON.parse(await readFile(this.path, "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  async reset(): Promise<void> {
    if (this.db) {
      await this.db.dropDatabase();
      await this.init();
    } else {
      this.data = {};
      try {
        const { unlink } = await import("node:fs/promises");
        await unlink(this.path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }
  async list(resource: string): Promise<RecordEntity[]> {
    if (this.db)
      return (await this.db
        .collection(resource)
        .find({}, { projection: { _id: 0 } })
        .toArray()) as unknown as RecordEntity[];
    return structuredClone(this.data[resource] ?? []);
  }
  async mutate<T>(
    resource: string,
    fn: (items: RecordEntity[]) => T | Promise<T>,
    audit?: RecordEntity,
  ): Promise<T> {
    return this.transact(
      [resource],
      (tables) => fn(tables[resource]),
      audit ? [audit] : [],
    );
  }
  /**
   * Runs `fn` on several collections at once and writes every change, plus the audit entries,
   * atomically: a MongoDB transaction, or a single file write. Calls are queued, so a handler
   * always sees the result of the previous one.
   */
  async transact<T>(
    resources: string[],
    fn: (tables: Record<string, RecordEntity[]>) => T | Promise<T>,
    audit: RecordEntity[] | ((result: T) => RecordEntity[]) = [],
  ): Promise<T> {
    const auditFor = (result: T) =>
      typeof audit === "function" ? audit(result) : audit;
    const names = [...new Set(resources)];
    const task = this.queue.then(async () => {
      if (this.db) {
        const session = await this.db.startSession();
        let result!: T;
        try {
          await session.withTransaction(async () => {
            const originals: Record<string, RecordEntity[]> = {};
            const tables: Record<string, RecordEntity[]> = {};
            for (const name of names) {
              originals[name] = (await this.db!.collection(name)
                .find({}, { projection: { _id: 0 }, session })
                .toArray()) as unknown as RecordEntity[];
              tables[name] = structuredClone(originals[name]);
            }
            result = await fn(tables);
            const added = names.includes("audit")
              ? appendedTo(originals.audit, tables.audit)
              : [];
            const [head] = (await this.db!.collection("audit")
              .find(
                { hash: { $exists: true } },
                { projection: { _id: 0 }, session },
              )
              .sort({ seq: -1 })
              .limit(1)
              .toArray()) as unknown as RecordEntity[];
            const entries = seal(
              enrichAudit(
                [...added, ...auditFor(result)],
                auditChanges(originals, tables),
              ),
              head,
            );
            for (const name of names.filter((n) => n !== "audit")) {
              const collection = this.db!.collection(name);
              const old = new Map(originals[name].map((x) => [x.id, x])),
                current = new Set(tables[name].map((x) => x.id));
              const inserts: RecordEntity[] = [];
              for (const item of tables[name]) {
                const previous = old.get(item.id);
                if (!previous) inserts.push(item);
                else if (JSON.stringify(previous) !== JSON.stringify(item))
                  await collection.replaceOne(
                    { id: item.id, version: previous.version },
                    item,
                    { session },
                  );
              }
              if (inserts.length)
                await collection.insertMany(inserts, { session });
              for (const item of originals[name])
                if (!current.has(item.id))
                  await collection.deleteOne(
                    { id: item.id, version: item.version },
                    { session },
                  );
            }
            if (entries.length)
              await this.db!.collection("audit").insertMany(entries, {
                session,
              });
          });
        } finally {
          await session.endSession();
        }
        return result;
      }
      const tables: Record<string, RecordEntity[]> = {};
      for (const name of names) tables[name] = await this.list(name);
      const result = await fn(tables);
      const before = this.data.audit ?? [];
      const added = names.includes("audit")
        ? appendedTo(before, tables.audit)
        : [];
      const originals = Object.fromEntries(
        names.map((name) => [name, this.data[name] ?? []]),
      );
      const entries = seal(
        enrichAudit(
          [...added, ...auditFor(result)],
          auditChanges(originals, tables),
        ),
        chainHead(before),
      );
      const next = { ...this.data, ...tables };
      if (names.includes("audit") || entries.length)
        next.audit = [...before, ...entries];
      await mkdir(dirname(this.path), { recursive: true });
      await writeFile(this.path + ".tmp", JSON.stringify(next));
      await rename(this.path + ".tmp", this.path);
      this.data = next;
      return result;
    });
    const normalized = task.catch((error) => {
      if (error?.code === 11000)
        throw new ConflictException("DUPLICATE_RECORD");
      throw error;
    });
    this.queue = normalized.catch(() => {});
    return normalized;
  }
  async onModuleDestroy() {
    await this.queue;
    await this.db?.close();
  }
}

/** Rows a handler appended to the audit log; editing or removing an existing row is refused. */
function appendedTo(before: RecordEntity[], after: RecordEntity[]) {
  const kept = after.slice(0, before.length);
  if (
    kept.length !== before.length ||
    kept.some((row, i) => JSON.stringify(row) !== JSON.stringify(before[i]))
  )
    throw new ForbiddenException("APPEND_ONLY_RESOURCE");
  return after.slice(before.length);
}
