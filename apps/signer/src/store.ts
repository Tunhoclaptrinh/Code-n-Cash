import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Store } from "./types";

/**
 * The provider's own data (its database): never shared with the relying party. One JSON file,
 * written atomically; calls are queued so each change sees the previous one.
 */
export class JsonStore {
  private data: Store;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private path: string) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    try {
      this.data = JSON.parse(readFileSync(path, "utf8")) as Store;
    } catch {
      this.data = { credentials: [], transactions: [] };
    }
  }
  read<T>(fn: (data: Store) => T): T {
    return fn(structuredClone(this.data));
  }
  change<T>(fn: (data: Store) => T): Promise<T> {
    const task = this.queue.then(() => {
      const draft = structuredClone(this.data);
      const result = fn(draft);
      writeFileSync(this.path + ".tmp", JSON.stringify(draft), { mode: 0o600 });
      renameSync(this.path + ".tmp", this.path);
      this.data = draft;
      return result;
    });
    this.queue = task.catch(() => {});
    return task;
  }
}

export const dataPath = (dir: string, name: string) => resolve(dir, name);
