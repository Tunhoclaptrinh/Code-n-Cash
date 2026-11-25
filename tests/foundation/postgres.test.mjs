// PostgreSQL storage (STORAGE_DRIVER=postgres). Runs when DATABASE_URL points at a disposable
// database (CI starts one); each run uses its own schema and drops it afterwards.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const url = process.env.DATABASE_URL;
const skip = url ? false : "DATABASE_URL is not set";
const schema = `codecash_test_${process.pid}`;
const pg = createRequire(join(process.cwd(), "apps/api/package.json"))("pg");
let repo, dir, client;

before(async () => {
  if (skip) return;
  dir = await mkdtemp(join(tmpdir(), "codecash-pg-"));
  Object.assign(process.env, {
    REPO_ROOT: process.cwd(),
    DATA_DIR: dir,
    STORAGE_DRIVER: "postgres",
    PG_SCHEMA: schema,
  });
  const { Repository } =
    await import("../../apps/api/dist/common/repository.js");
  repo = new Repository();
  await repo.init();
  client = new pg.Client({ connectionString: url });
  await client.connect();
});
after(async () => {
  if (skip) return;
  await repo.onModuleDestroy();
  await client.query(`DROP SCHEMA "${schema}" CASCADE`);
  await client.end();
  await rm(dir, { recursive: true, force: true });
});

const row = (id, fields = {}) => ({
  id,
  version: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...fields,
});
const audit = (action) => [
  row(`a-${action}-${Math.random()}`, { action, actorId: "test" }),
];
const refused = async (sql, code) =>
  assert.rejects(client.query(sql), new RegExp(code), sql);

test(
  "records keep their order and shape, writes check versions and unique keys",
  { skip },
  async () => {
    await repo.transact(
      ["users"],
      (t) => {
        t.users.push(
          row("u2", { email: "b@x.vn", nested: { z: 1, a: [2, 1] } }),
        );
        t.users.push(row("u1", { email: "a@x.vn" }));
      },
      audit("CREATE"),
    );
    const users = await repo.list("users");
    assert.deepEqual(
      users.map((u) => u.id),
      ["u2", "u1"],
    );
    assert.deepEqual(users[0].nested, { z: 1, a: [2, 1] });
    await repo.transact(["users"], (t) => {
      t.users[0].email = "b2@x.vn";
      t.users[0].version = 2;
      t.users.splice(1, 1);
    });
    assert.deepEqual(
      (await repo.list("users")).map((u) => [u.id, u.email, u.version]),
      [["u2", "b2@x.vn", 2]],
    );
    // Same e-mail in another case: the unique index answers DUPLICATE_RECORD.
    await assert.rejects(
      repo.transact(["users"], (t) => {
        t.users.push(row("u3", { email: "B2@x.vn" }));
      }),
      /DUPLICATE_RECORD/,
    );
    // A row another writer changes after this write read it is not overwritten: the update only
    // applies to the version that was read.
    await assert.rejects(
      repo.transact(["users"], async (t) => {
        await client.query(
          `UPDATE "${schema}".records SET version = 3 WHERE collection = 'users' AND id = 'u2'`,
        );
        t.users[0].email = "lost@x.vn";
      }),
      /VERSION_CONFLICT/,
    );
    assert.equal((await repo.list("users"))[0].email, "b2@x.vn");
  },
);

test(
  "the database keeps the audit chain and recorded events as written",
  { skip },
  async () => {
    await repo.transact(
      ["events"],
      (t) => {
        t.events.push(row("EV1", { event_type: "DELIVERY" }));
      },
      audit("RECORD"),
    );
    const chain = await repo.list("audit");
    assert.ok(chain.length >= 2);
    assert.deepEqual(
      chain.map((entry) => Number(entry.seq)),
      chain.map((_, i) => i + 1),
    );
    const s = `"${schema}"`;
    await refused(
      `UPDATE ${s}.audit_log SET doc = doc`,
      "APPEND_ONLY_RESOURCE",
    );
    await refused(`DELETE FROM ${s}.audit_log`, "APPEND_ONLY_RESOURCE");
    await refused(`TRUNCATE ${s}.audit_log`, "APPEND_ONLY_RESOURCE");
    await refused(
      `UPDATE ${s}.records SET version = 2 WHERE collection = 'events'`,
      "APPEND_ONLY_RESOURCE",
    );
    await refused(
      `DELETE FROM ${s}.records WHERE collection = 'events'`,
      "APPEND_ONLY_RESOURCE",
    );
    const head = chain.at(-1);
    const forged = (seq, prev) =>
      `INSERT INTO ${s}.audit_log (seq, id, hash, prev_hash, doc) VALUES (${seq}, 'f${seq}', 'h', '${prev}',
      json_build_object('seq', ${seq}, 'id', 'f${seq}', 'hash', 'h', 'prevHash', '${prev}'))`;
    await refused(
      forged(Number(head.seq) + 2, head.hash),
      "AUDIT_SEQUENCE_GAP",
    );
    await refused(
      forged(Number(head.seq) + 1, "0".repeat(64)),
      "AUDIT_LINK_BROKEN",
    );
    // The application cannot edit or remove an entry either.
    await assert.rejects(
      repo.transact(["audit"], (t) => {
        t.audit[0].action = "EDITED";
      }),
      /APPEND_ONLY_RESOURCE/,
    );
    // Other records change normally.
    await repo.transact(["users"], (t) => {
      t.users.push(row("u9", { email: "c@x.vn" }));
    });
    const { verifyChain } =
      await import("../../apps/api/dist/common/audit-chain.js");
    assert.equal(verifyChain(await repo.list("audit")).ok, true);
  },
);

test(
  "a demo reset keeps the old store, chain included, under an archive schema",
  { skip },
  async () => {
    const before = await repo.list("audit");
    const archived = await repo.archiveAndReset();
    assert.equal(archived.entries, before.length);
    assert.equal(archived.head.hash, before.at(-1).hash);
    assert.deepEqual(await repo.list("users"), []);
    const name = archived.archive.toLowerCase().replace(/[^a-z0-9_]/g, "_");
    const { rows } = await client.query(
      `SELECT count(*)::int AS n FROM "${name}".audit_log`,
    );
    assert.equal(rows[0].n, before.length);
    await client.query(`DROP SCHEMA "${name}" CASCADE`);
  },
);
