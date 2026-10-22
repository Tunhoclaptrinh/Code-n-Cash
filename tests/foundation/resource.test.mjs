import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Repository } from "../../apps/api/dist/common/repository.js";
import { BaseService } from "../../apps/api/dist/common/services/base.service.js";
import { AuthService } from "../../apps/api/dist/auth.js";
import { parseFilters } from "../../apps/api/dist/common/utils/query-builder.js";
let repo, service, dir;
const actor = {
  id: "owner",
  email: "owner@example.test",
  displayName: "Owner",
  role: "CONTRACT_OWNER",
  organizationId: "org-one",
  roleChipOrganization: "One",
  permissions: [],
};
const admin = { ...actor, id: "admin", role: "ADMIN_AUDITOR" };
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "codecash-test-"));
  process.env.DATA_DIR = dir;
  process.env.STORAGE_DRIVER = "file";
  process.env.REPO_ROOT = process.cwd();
  repo = new Repository();
  await repo.init();
  service = new BaseService(repo);
  // Drafts reference their supplier; the fixture supplier must exist (no audit entry).
  await repo.mutate("organizations", (items) =>
    items.push({
      id: "supplier",
      name: "Supplier Co",
      code: "SUP",
      kind: "SUPPLIER",
      organizationId: "org-one",
      version: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }),
  );
});
afterEach(async () => {
  await repo.onModuleDestroy();
  await rm(dir, { recursive: true, force: true });
});
const draft = (code) => ({
  code,
  title: code,
  supplierId: "supplier",
  contractType: "GOODS_SUPPLY",
});
test("tenant scope cannot be overridden through filters or direct IDs", async () => {
  const item = await service.create("contract-drafts", draft("ONE"), actor);
  await assert.rejects(
    service.get("contract-drafts", item.id, {
      ...actor,
      organizationId: "org-two",
    }),
  );
  const result = await service.list(
    "contract-drafts",
    { filters: JSON.stringify({ supplierId: "supplier" }) },
    { ...actor, organizationId: "org-two" },
  );
  assert.equal(result.total, 0);
  assert.throws(() => parseFilters('{"$or":[]}', ["title"]));
  assert.throws(() => parseFilters('{"organizationId":"org-one"}', ["title"]));
});
test("optimistic versions reject stale writes and updates are audited atomically", async () => {
  const item = await service.create("contract-drafts", draft("ONE"), actor);
  const updated = await service.update(
    "contract-drafts",
    item.id,
    { title: "new", version: 1 },
    actor,
  );
  assert.equal(updated.version, 2);
  await assert.rejects(
    service.update(
      "contract-drafts",
      item.id,
      { title: "stale", version: 1 },
      actor,
    ),
  );
  const log = await repo.list("audit");
  assert.deepEqual(
    log.map((x) => x.action),
    ["CREATE", "UPDATE"],
  );
});
test("pagination, sorting and search are applied to the whole filtered dataset", async () => {
  for (const code of ["A", "B", "C"])
    await service.create("contract-drafts", draft(code), actor);
  const page = await service.list(
    "contract-drafts",
    { page: 2, limit: 1, sortBy: "code", sortOrder: "asc" },
    actor,
  );
  assert.equal(page.total, 3);
  assert.equal(page.items[0].code, "B");
  assert.equal(
    (await service.list("contract-drafts", { search: "C" }, actor)).total,
    1,
  );
  await assert.rejects(service.list("contract-drafts", { limit: 1000 }, actor));
});
test("read-only audit, forbidden fields and unauthorized writes are rejected", async () => {
  await assert.rejects(service.create("audit", { action: "FAKE" }, admin));
  await assert.rejects(
    service.create(
      "contract-drafts",
      { ...draft("ONE"), organizationId: "org-two" },
      actor,
    ),
  );
  await assert.rejects(
    service.create(
      "organizations",
      { name: "X", code: "X", kind: "BUYER" },
      actor,
    ),
  );
});
test("persistent storage survives reinitialization and concurrent creates", async () => {
  await Promise.all(
    ["A", "B", "C"].map((code) =>
      service.create("contract-drafts", draft(code), actor),
    ),
  );
  const restored = new Repository();
  await restored.init();
  assert.equal((await restored.list("contract-drafts")).length, 3);
  assert.equal((await restored.list("audit")).length, 3);
  await restored.onModuleDestroy();
});
test("password hashes are never returned and disabled accounts invalidate tokens", async () => {
  const auth = new AuthService(repo);
  await auth.seed();
  const session = await auth.login({
    email: "owner@novaan.vn",
    password: "Passw0rd!",
  });
  assert.equal((await auth.authenticate(session.token)).id, "u-owner");
  const listed = await service.list("users", {}, admin);
  assert.equal("passwordHash" in listed.items[0], false);
  await repo.mutate("users", (items) => {
    items.find((x) => x.id === "u-owner").active = false;
  });
  await assert.rejects(auth.authenticate(session.token));
  await assert.rejects(
    auth.login({ email: "owner@novaan.vn", password: "wrong" }),
  );
});
test("bulk import is all-or-nothing and bulk delete remains tenant-scoped", async () => {
  await assert.rejects(
    service.import(
      "contract-drafts",
      { items: [draft("A"), draft("A")] },
      actor,
    ),
  );
  assert.equal((await repo.list("contract-drafts")).length, 0);
  assert.equal((await repo.list("audit")).length, 0);
  await service.import(
    "contract-drafts",
    { items: [draft("A"), draft("B")] },
    actor,
  );
  const items = await repo.list("contract-drafts");
  await assert.rejects(
    service.bulkDelete(
      "contract-drafts",
      { ids: [items[0].id] },
      { ...actor, organizationId: "other" },
    ),
  );
  assert.equal((await repo.list("contract-drafts")).length, 2);
  await service.bulkDelete(
    "contract-drafts",
    { ids: items.map((x) => x.id) },
    actor,
  );
  assert.equal((await repo.list("contract-drafts")).length, 0);
});

test("PDF upload records a content hash and download enforces organization scope", async () => {
  const { DocumentsController } =
    await import("../../apps/api/dist/documents.js");
  const controller = new DocumentsController(repo, service);
  const draftRecord = await service.create(
    "contract-drafts",
    draft("PDF"),
    actor,
  );
  const bytes = Buffer.from("%PDF-1.4\nfixture");
  const req = { user: actor, requestId: "test" };
  const saved = await controller.upload(
    draftRecord.id,
    { buffer: bytes, originalname: "contract.pdf", size: bytes.length },
    req,
  );
  assert.match(saved.sha256, /^[a-f0-9]{64}$/);
  assert.equal((await repo.list("audit")).at(-1).action, "UPLOAD");
  let downloaded;
  const headers = new Map();
  await controller.download(saved.id, req, {
    setHeader: (key, value) => headers.set(key, value),
    send: (value) => (downloaded = value),
  });
  assert.deepEqual(downloaded, bytes);
  assert.equal(headers.get("X-Content-Type-Options"), "nosniff");
  await assert.rejects(
    controller.download(
      saved.id,
      { user: { ...actor, organizationId: "other" }, requestId: "test" },
      { setHeader() {}, send() {} },
    ),
  );
  await assert.rejects(
    controller.upload(
      draftRecord.id,
      { buffer: Buffer.from("not a PDF"), originalname: "bad.pdf", size: 9 },
      req,
    ),
  );
});
test("reset password and logout invalidate prior tokens without exposing secrets in audit", async () => {
  const auth = new AuthService(repo);
  await auth.seed();
  const original = await auth.login({
    email: "owner@novaan.vn",
    password: "Passw0rd!",
  });
  await auth.resetPassword("u-owner", "ChangedPassword123!", admin);
  await assert.rejects(auth.authenticate(original.token));
  const next = await auth.login({
    email: "owner@novaan.vn",
    password: "ChangedPassword123!",
  });
  await auth.logout(next.user);
  await assert.rejects(auth.authenticate(next.token));
  const audit = (await repo.list("audit")).at(-1);
  assert.equal(audit.action, "RESET_PASSWORD");
  assert.equal(JSON.stringify(audit).includes("ChangedPassword123!"), false);
});

test("the permission matrix decides every resource operation", async () => {
  const supplier = { ...actor, id: "s", role: "SUPPLIER" };
  const legal = { ...actor, id: "l", role: "LEGAL_REVIEWER" };
  await assert.rejects(service.list("users", {}, supplier), /PERMISSION/);
  await assert.rejects(service.list("audit", {}, legal), /PERMISSION/);
  await assert.rejects(
    service.list("contract-drafts", {}, supplier),
    /PERMISSION/,
  );
  await assert.rejects(
    service.create(
      "organizations",
      { name: "X", code: "X", kind: "BUYER" },
      legal,
    ),
    /PERMISSION/,
  );
  await assert.rejects(
    service.create(
      "contract-drafts",
      { ...draft("R"), supplierId: "ghost" },
      actor,
    ),
    /INVALID_REFERENCE/,
  );
  assert.equal((await service.list("contract-drafts", {}, legal)).total, 0);
});

test("import is validated row by row before anything is written", async () => {
  await service.create("contract-drafts", draft("TAKEN"), actor);
  const report = await service.validateImport(
    "contract-drafts",
    {
      items: [
        draft("NEW"),
        draft("TAKEN"),
        { ...draft("BAD"), contractType: "NOPE", supplierId: "ghost" },
        draft("NEW"),
      ],
    },
    actor,
  );
  assert.deepEqual(report.summary, { total: 4, valid: 1, error: 3 });
  assert.deepEqual(report.results[1].errors, ["DUPLICATE_RECORD"]);
  assert.deepEqual(report.results[2].errors, [
    "INVALID_OPTION:contractType",
    "INVALID_REFERENCE:supplierId",
  ]);
  assert.equal((await repo.list("contract-drafts")).length, 1);
});

test("export streams the filtered set with populated names, template lists the columns", async () => {
  await service.create("contract-drafts", draft("A1"), actor);
  await service.create("contract-drafts", draft("B2"), actor);
  const csv = await service.export(
    "contract-drafts",
    { search: "A1", columns: "code,supplierId" },
    actor,
  );
  assert.equal(csv.contentType.startsWith("text/csv"), true);
  const lines = csv.body.replace("\uFEFF", "").trim().split("\r\n");
  assert.deepEqual(lines, [
    "code,supplierId,supplierId_name",
    "A1,supplier,Supplier Co",
  ]);
  await assert.rejects(
    service.export("contract-drafts", { columns: "passwordHash" }, actor),
    /INVALID_COLUMN/,
  );
  const template = await service.template("contract-drafts", actor);
  assert.equal(
    template.split("\r\n")[0].replace("\uFEFF", ""),
    "code,title,supplierId,contractType",
  );
  assert.equal((await repo.list("audit")).at(-1).action, "EXPORT");
});
