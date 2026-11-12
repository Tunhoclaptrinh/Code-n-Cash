import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Repository } from "../../apps/api/dist/common/repository.js";
import { NotificationsController } from "../../apps/api/dist/notifications.js";

let dir, repo, controller;
const actor = {
  id: "u-owner",
  email: "owner@example.test",
  displayName: "Owner",
  role: "CONTRACT_OWNER",
  organizationId: "org-one",
  permissions: [],
};
const req = (user = actor) => ({ user });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "codecash-notify-"));
  process.env.DATA_DIR = dir;
  process.env.STORAGE_DRIVER = "file";
  process.env.REPO_ROOT = process.cwd();
  repo = new Repository();
  await repo.init();
  controller = new NotificationsController(repo);
});
afterEach(async () => {
  await repo.onModuleDestroy();
  await rm(dir, { recursive: true, force: true });
});

test("the read marker belongs to the caller, only moves forward and is audited", async () => {
  assert.deepEqual(await controller.cursor(req()), { seenAt: null });
  for (const bad of [
    {},
    { seenAt: 5 },
    { seenAt: "soon" },
    { seenAt: "2026-13-45T99:99" },
    { seenAt: "2026-11-10" },
  ])
    await assert.rejects(controller.markSeen(req(), bad), /INVALID_SEEN_AT/);

  // Stored as the activity log writes times; a Data Pack event may be dated after today.
  const first = await controller.markSeen(req(), {
    seenAt: "2026-11-10T08:00:00",
  });
  assert.equal(first.seenAt, "2026-11-10T08:00:00");
  // An older tab marking read keeps the newer marker.
  const older = await controller.markSeen(req(), {
    seenAt: "2026-11-01T00:00:00",
  });
  assert.equal(older.seenAt, "2026-11-10T08:00:00");
  await controller.markSeen(req(), { seenAt: "2026-12-19T09:30:00" });
  assert.deepEqual(await controller.cursor(req()), {
    seenAt: "2026-12-19T09:30:00",
  });
  // Another user has their own marker.
  assert.deepEqual(await controller.cursor(req({ ...actor, id: "u-other" })), {
    seenAt: null,
  });

  const marks = (await repo.list("audit")).filter(
    (e) => e.action === "MARK_NOTIFICATIONS_READ",
  );
  assert.equal(
    marks.length,
    2,
    "one audit entry per forward move, none for the ignored one",
  );
  assert.ok(marks.every((e) => e.actorId === actor.id && e.hash));
});

test("the change stream names touched collections only, coalesced, and stops on close", async () => {
  const written = [];
  const res = {
    status() {},
    setHeader() {},
    flushHeaders() {},
    write: (chunk) => written.push(chunk),
  };
  const request = new EventEmitter();
  controller.stream(request, res);
  assert.equal(written[0], "retry: 5000\n\n");
  assert.equal(written[1], "event: ready\ndata: {}\n\n");

  await controller.markSeen(req(), { seenAt: "2026-11-10T08:00:00Z" });
  await controller.markSeen(req(), { seenAt: "2026-11-10T09:00:00Z" });
  await pause(450);
  const events = written.filter((c) => c.startsWith("event: change"));
  assert.equal(
    events.length,
    1,
    "two writes within the window reach the client once",
  );
  const data = JSON.parse(events[0].split("data: ")[1]);
  assert.deepEqual(data, { resources: ["notification-cursors"] });
  assert.ok(
    !events[0].includes("u-owner"),
    "no record content travels on the stream",
  );

  request.emit("close");
  await controller.markSeen(req(), { seenAt: "2026-11-10T10:00:00Z" });
  await pause(450);
  assert.equal(written.filter((c) => c.startsWith("event: change")).length, 1);
});
