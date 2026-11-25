import { ConflictException } from "@nestjs/common";
import pg from "pg";
import type { RecordEntity } from "./types";

/**
 * PostgreSQL storage (STORAGE_DRIVER=postgres, DATABASE_URL). Idea and triggers adapted from the
 * Contract Smart schema (docs/34_CSDL_CONTRACT_SMART.md §6b.4): the database itself refuses to
 * change the audit log or a recorded event, and checks that every audit entry continues the chain.
 *
 * Records keep their shape as JSON documents (one table, keyed by collection and id) so every
 * handler works unchanged; `json`, not `jsonb`, so a document is stored exactly as written. A
 * store lives in its own schema; a demo reset renames the schema aside, chain and all.
 */
export class PostgresStore {
  private pool: pg.Pool;
  constructor(
    url: string,
    private schema = process.env.PG_SCHEMA ?? "codecash",
  ) {
    if (!/^[a-z_][a-z0-9_]{0,40}$/.test(schema))
      throw new Error("PG_SCHEMA must be a plain lower-case identifier");
    this.pool = new pg.Pool({ connectionString: url, max: 5 });
  }
  private get s() {
    return `"${this.schema}"`;
  }

  /** Creates the schema, tables, indexes and guards when missing; safe to run on every start. */
  async init() {
    const s = this.s;
    await this.pool.query(`
      CREATE SCHEMA IF NOT EXISTS ${s};
      CREATE TABLE IF NOT EXISTS ${s}.records (
        collection text NOT NULL,
        id text NOT NULL,
        version integer NOT NULL,
        ord bigserial,
        doc json NOT NULL,
        PRIMARY KEY (collection, id)
      );
      CREATE INDEX IF NOT EXISTS records_order ON ${s}.records (collection, ord);
      CREATE UNIQUE INDEX IF NOT EXISTS records_user_email
        ON ${s}.records ((lower(doc->>'email'))) WHERE collection = 'users';
      CREATE UNIQUE INDEX IF NOT EXISTS records_organization_code
        ON ${s}.records ((doc->>'code')) WHERE collection = 'organizations';
      CREATE UNIQUE INDEX IF NOT EXISTS records_draft_code
        ON ${s}.records ((doc->>'code')) WHERE collection = 'contract-drafts';
      CREATE TABLE IF NOT EXISTS ${s}.audit_log (
        seq bigint PRIMARY KEY,
        id text NOT NULL UNIQUE,
        hash text NOT NULL,
        prev_hash text NOT NULL,
        recorded_at timestamptz NOT NULL DEFAULT now(),
        doc json NOT NULL,
        CONSTRAINT audit_doc_matches CHECK (
          doc->>'hash' = hash AND
          doc->>'prevHash' = prev_hash AND
          (doc->>'seq')::bigint = seq AND
          doc->>'id' = id
        )
      );

      -- Each entry continues the chain: next number, linked to the hash of the entry before it.
      CREATE OR REPLACE FUNCTION ${s}.audit_link() RETURNS trigger
      LANGUAGE plpgsql AS $$
      DECLARE last record;
      BEGIN
        EXECUTE format('SELECT seq, hash FROM %I.%I ORDER BY seq DESC LIMIT 1',
          TG_TABLE_SCHEMA, TG_TABLE_NAME) INTO last;
        IF last IS NULL THEN
          IF NEW.seq <> 1 THEN RAISE EXCEPTION 'AUDIT_SEQUENCE_GAP'; END IF;
        ELSIF NEW.seq <> last.seq + 1 THEN
          RAISE EXCEPTION 'AUDIT_SEQUENCE_GAP';
        ELSIF NEW.prev_hash <> last.hash THEN
          RAISE EXCEPTION 'AUDIT_LINK_BROKEN';
        END IF;
        NEW.recorded_at := now();
        RETURN NEW;
      END $$;
      CREATE OR REPLACE TRIGGER audit_log_link BEFORE INSERT ON ${s}.audit_log
        FOR EACH ROW EXECUTE FUNCTION ${s}.audit_link();

      -- Nobody edits or removes the audit log, not even the database owner through the app role.
      CREATE OR REPLACE FUNCTION ${s}.append_only() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        -- Nested: PL/pgSQL does not stop at the first false operand of AND, and only a row of
        -- the records table has a collection.
        IF TG_OP <> 'TRUNCATE' AND TG_TABLE_NAME = 'records' THEN
          IF OLD.collection <> 'events' THEN
            RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
          END IF;
        END IF;
        RAISE EXCEPTION 'APPEND_ONLY_RESOURCE';
      END $$;
      CREATE OR REPLACE TRIGGER audit_log_guard BEFORE UPDATE OR DELETE ON ${s}.audit_log
        FOR EACH ROW EXECUTE FUNCTION ${s}.append_only();
      CREATE OR REPLACE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON ${s}.audit_log
        FOR EACH STATEMENT EXECUTE FUNCTION ${s}.append_only();
      -- A recorded business event is kept as recorded (a wrong one goes through an exception).
      CREATE OR REPLACE TRIGGER events_guard BEFORE UPDATE OR DELETE ON ${s}.records
        FOR EACH ROW EXECUTE FUNCTION ${s}.append_only();
      CREATE OR REPLACE TRIGGER records_no_truncate BEFORE TRUNCATE ON ${s}.records
        FOR EACH STATEMENT EXECUTE FUNCTION ${s}.append_only();
    `);
  }

  async list(resource: string, client: pg.PoolClient | pg.Pool = this.pool) {
    if (resource === "audit")
      return (
        await client.query(`SELECT doc FROM ${this.s}.audit_log ORDER BY seq`)
      ).rows.map((row) => row.doc as RecordEntity);
    return (
      await client.query(
        `SELECT doc FROM ${this.s}.records WHERE collection = $1 ORDER BY ord`,
        [resource],
      )
    ).rows.map((row) => row.doc as RecordEntity);
  }

  /** The last sealed entry, the one a new entry links to. */
  async head(client: pg.PoolClient | pg.Pool = this.pool) {
    const { rows } = await client.query(
      `SELECT doc FROM ${this.s}.audit_log ORDER BY seq DESC LIMIT 1`,
    );
    return rows[0]?.doc as RecordEntity | undefined;
  }

  /**
   * One transaction for a whole write. The advisory lock makes writers of every API instance take
   * turns, so the chain gets one entry per position and a handler sees the previous write.
   */
  async transaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `codecash:${this.schema}`,
      ]);
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  /** Writes the difference between `before` and `after` of one collection, checking versions. */
  async apply(
    client: pg.PoolClient,
    collection: string,
    before: RecordEntity[],
    after: RecordEntity[],
  ) {
    const old = new Map(before.map((row) => [row.id, row]));
    const kept = new Set(after.map((row) => row.id));
    const inserts: unknown[] = [];
    const updates: unknown[] = [];
    for (const row of after) {
      const previous = old.get(row.id);
      if (!previous)
        inserts.push({
          id: row.id,
          version: Number(row.version ?? 0),
          doc: row,
        });
      else if (JSON.stringify(previous) !== JSON.stringify(row))
        updates.push({
          id: row.id,
          prev: Number(previous.version ?? 0),
          version: Number(row.version ?? 0),
          doc: row,
        });
    }
    const deletes = before
      .filter((row) => !kept.has(row.id))
      .map((row) => ({ id: row.id, prev: Number(row.version ?? 0) }));
    const s = this.s;
    if (deletes.length) {
      const { rowCount } = await client.query(
        `DELETE FROM ${s}.records r USING json_to_recordset($2::json) AS x(id text, prev integer)
         WHERE r.collection = $1 AND r.id = x.id AND r.version = x.prev`,
        [collection, JSON.stringify(deletes)],
      );
      if (rowCount !== deletes.length)
        throw new ConflictException("VERSION_CONFLICT");
    }
    if (updates.length) {
      const { rowCount } = await client.query(
        `UPDATE ${s}.records r SET version = x.version, doc = x.doc
         FROM json_to_recordset($2::json) AS x(id text, prev integer, version integer, doc json)
         WHERE r.collection = $1 AND r.id = x.id AND r.version = x.prev`,
        [collection, JSON.stringify(updates)],
      );
      if (rowCount !== updates.length)
        throw new ConflictException("VERSION_CONFLICT");
    }
    // In list order: `ord` keeps the order the handler added the rows in.
    if (inserts.length)
      await client.query(
        `INSERT INTO ${s}.records (collection, id, version, doc)
         SELECT $1, x.id, x.version, x.doc
         FROM ROWS FROM (json_to_recordset($2::json) AS (id text, version integer, doc json))
           WITH ORDINALITY AS x(id, version, doc, n)
         ORDER BY x.n`,
        [collection, JSON.stringify(inserts)],
      );
  }

  /** Appends sealed audit entries; the database checks they continue the chain. */
  async append(client: pg.PoolClient, entries: RecordEntity[]) {
    if (!entries.length) return;
    await client.query(
      `INSERT INTO ${this.s}.audit_log (seq, id, hash, prev_hash, doc)
       SELECT x.seq, x.id, x.hash, x.prev_hash, x.doc
       FROM json_to_recordset($1::json) AS x(seq bigint, id text, hash text, prev_hash text, doc json)
       ORDER BY x.seq`,
      [
        JSON.stringify(
          entries.map((entry) => ({
            seq: Number(entry.seq),
            id: String(entry.id),
            hash: String(entry.hash),
            prev_hash: String(entry.prevHash),
            doc: entry,
          })),
        ),
      ],
    );
  }

  /** Demo reset: the whole schema, chain included, is kept under the archive name. */
  async archive(name: string) {
    const archive = name.toLowerCase().replace(/[^a-z0-9_]/g, "_");
    await this.pool.query(`ALTER SCHEMA ${this.s} RENAME TO "${archive}"`);
    await this.init();
  }

  close() {
    return this.pool.end();
  }
}
