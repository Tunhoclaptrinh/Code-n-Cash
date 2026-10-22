import { Injectable, OnModuleDestroy, ConflictException } from "@nestjs/common";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import mongoose from "mongoose";
import type { RecordEntity } from "./types";
/** Adapted from UniFlow's repository/service boundary. Application writes include their audit entry. */
@Injectable()
export class Repository implements OnModuleDestroy {
  private data: Record<string, RecordEntity[]> = {};
  private queue: Promise<unknown> = Promise.resolve();
  private db?: mongoose.Connection;
  readonly driver = process.env.STORAGE_DRIVER ?? "file";
  readonly path = resolve(
    process.env.REPO_ROOT ?? process.cwd(),
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
        "documents",
        "audit",
        "workflow-state",
      ])
        await this.db.collection(name).createIndex({ id: 1 }, { unique: true });
      for (const [name, field] of [
        ["users", "email"],
        ["organizations", "code"],
        ["contract-drafts", "code"],
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
    const task = this.queue.then(async () => {
      if (this.db) {
        const session = await this.db.startSession();
        let result!: T;
        try {
          await session.withTransaction(async () => {
            const collection = this.db!.collection(resource);
            const original = (await collection
              .find({}, { projection: { _id: 0 }, session })
              .toArray()) as unknown as RecordEntity[];
            const items = structuredClone(original);
            result = await fn(items);
            const old = new Map(original.map((x) => [x.id, x])),
              current = new Set(items.map((x) => x.id));
            for (const item of items) {
              const previous = old.get(item.id);
              if (!previous) await collection.insertOne(item, { session });
              else if (JSON.stringify(previous) !== JSON.stringify(item))
                await collection.replaceOne(
                  { id: item.id, version: previous.version },
                  item,
                  { session },
                );
            }
            for (const item of original)
              if (!current.has(item.id))
                await collection.deleteOne(
                  { id: item.id, version: item.version },
                  { session },
                );
            if (audit)
              await this.db!.collection("audit").insertOne(audit, { session });
          });
        } finally {
          await session.endSession();
        }
        return result;
      }
      const items = await this.list(resource);
      const result = await fn(items);
      const next = { ...this.data, [resource]: items };
      if (audit) next.audit = [...(next.audit ?? []), audit];
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
