import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// BR-21, acceptance review window, through the workflow API on the demo contract CT0103 (window of 5 days):
// the supplier asks for acceptance, the buyer's officer may return the request with a reason inside the
// window, and a buyer document issued after the window counts at its end.
let dir, repo, service, auth, users, EVIDENCE;
const actor = (id) => auth.actor(users.find((u) => u.id === id));
const call = (id, module, action, ...args) =>
  service.call(module, action, { args }, actor(id));
const detail = (id, sequence = 3, contract = "CT0103") =>
  call(id, "contracts", "getMilestoneDetail", contract, sequence);
const ref = { contractId: "CT0103", sequence: 3 };
/** Business time (Vietnam) `days` ago, in the event timestamp format. */
const daysAgo = (days) =>
  new Date(Date.now() + 7 * 3_600_000 - days * 86_400_000)
    .toISOString()
    .slice(0, 19);
const addDays = (timestamp, days) =>
  new Date(Date.parse(`${timestamp}Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 19);

before(async () => {
  dir = await mkdtemp(join(tmpdir(), "codecash-acceptance-"));
  process.env.REPO_ROOT = process.cwd();
  process.env.DATA_DIR = dir;
  process.env.TRUST_DIR = join(dir, "trust");
  EVIDENCE = (
    await (
      await import("../../apps/api/dist/evidence-store.js")
    ).storeEvidence(Buffer.from("%PDF-1.4\n% acceptance test\n"), "x.pdf")
  ).sha256;
  process.env.STORAGE_DRIVER = "file";
  const { Repository } =
    await import("../../apps/api/dist/common/repository.js");
  const { BaseService } =
    await import("../../apps/api/dist/common/services/base.service.js");
  const { AuthService } = await import("../../apps/api/dist/auth.js");
  const { DomainService } =
    await import("../../apps/api/dist/domain/service.js");
  const { WorkflowService } =
    await import("../../apps/api/dist/workflow.controller.js");
  repo = new Repository();
  await repo.init();
  const domain = new DomainService(repo, new BaseService(repo));
  await domain.bootstrap();
  auth = new AuthService(repo);
  await auth.seed();
  users = await repo.list("users");
  service = new WorkflowService(domain);
});
after(async () => {
  await repo.onModuleDestroy();
  await rm(dir, { recursive: true, force: true });
});

test("the window is a contract term: demo contracts set 5 days, Data Pack contracts none", async () => {
  const overview = await call(
    "u-owner",
    "contracts",
    "getContractOverview",
    "CT0103",
  );
  assert.equal(overview.acceptanceReviewDays, 5);
  // A Data Pack contract of the same buyer: the organiser's terms have no window.
  const buyer = users.find((u) => u.id === "u-owner").organizationId;
  const datapack = (await repo.list("contracts")).find(
    (c) => c.origin === "DATA_PACK" && c.buyer_id === buyer,
  ).contract_id;
  const official = await call(
    "u-owner",
    "contracts",
    "getContractOverview",
    datapack,
  );
  assert.equal(official.acceptanceReviewDays, null);
  for (const m of official.milestones)
    assert.equal(
      (await detail("u-owner", m.sequence, datapack)).acceptanceReview,
      null,
    );
  // Milestone 2 needs only supplier documents: nothing for the buyer to accept.
  assert.equal((await detail("u-supplier", 2)).acceptanceReview, null);
  // New drafts start from the ACCEPTANCE_REVIEW_DAYS setting.
  const draft = await call("u-legal", "drafts", "getContractDraft", null, true);
  assert.equal(draft.acceptanceReviewDays, 5);
  const settings = await repo.list("settings");
  assert.equal(
    settings.find((s) => s.name === "ACCEPTANCE_REVIEW_DAYS")?.value,
    "5",
  );
});

test("the supplier requests, the buyer returns with a reason, the supplier requests again", async () => {
  const start = (await detail("u-supplier")).acceptanceReview;
  assert.equal(start.state, "NOT_REQUESTED");
  assert.equal(start.days, 5);
  assert.equal(start.canRequest, true);
  assert.equal((await detail("u-legal")).acceptanceReview.canRequest, false);
  // Only the supplier may ask; only the buyer's officer may return.
  await assert.rejects(
    call("u-legal", "acceptance", "requestAcceptance", ref),
    /ACTION_FORBIDDEN/,
  );
  await assert.rejects(
    call("u-legal", "acceptance", "returnAcceptanceRequest", {
      ...ref,
      note: "x",
    }),
    /NO_ACCEPTANCE_REQUEST/,
  );

  await call("u-supplier", "acceptance", "requestAcceptance", {
    ...ref,
    note: "Đã lắp đặt xong, đề nghị nghiệm thu.",
  });
  const asked = (await detail("u-legal")).acceptanceReview;
  assert.equal(asked.state, "IN_REVIEW");
  assert.equal(asked.request.note, "Đã lắp đặt xong, đề nghị nghiệm thu.");
  assert.equal(asked.deadline, addDays(asked.request.at, 5));
  assert.equal(asked.daysLeft, 5);
  assert.equal(asked.canReturn, true);
  await assert.rejects(
    call("u-supplier", "acceptance", "requestAcceptance", ref),
    /ACCEPTANCE_ALREADY_REQUESTED/,
  );
  await assert.rejects(
    call("u-supplier", "acceptance", "returnAcceptanceRequest", {
      ...ref,
      note: "x",
    }),
    /ACTION_FORBIDDEN/,
  );
  await assert.rejects(
    call("u-legal", "acceptance", "returnAcceptanceRequest", {
      ...ref,
      note: " ",
    }),
    /NOTE_REQUIRED/,
  );
  await call("u-legal", "acceptance", "returnAcceptanceRequest", {
    ...ref,
    note: "Thiếu hồ sơ hoàn công.",
  });
  const returned = (await detail("u-supplier")).acceptanceReview;
  assert.equal(returned.state, "NOT_REQUESTED");
  assert.equal(returned.returns.length, 1);
  assert.equal(returned.returns[0].reason, "Thiếu hồ sơ hoàn công.");
  assert.equal(returned.canRequest, true);
  const events = (await detail("u-supplier")).events;
  assert.deepEqual(
    events
      .filter((e) => e.type.startsWith("ACCEPTANCE_"))
      .map((e) => [e.type, e.classification]),
    [
      ["ACCEPTANCE_REQUESTED", "ACCEPTANCE_REQUEST_RETURNED"],
      ["ACCEPTANCE_RETURNED", "ACCEPTANCE_RETURN"],
    ],
  );
  await call("u-supplier", "acceptance", "requestAcceptance", ref);
  assert.equal((await detail("u-legal")).acceptanceReview.state, "IN_REVIEW");
});

test("a buyer acceptance after the window counts at the window's end", async () => {
  // The request in force was made 12 days ago, so the 5-day window closed a week ago.
  const requestId = (await detail("u-legal")).acceptanceReview.request.eventId;
  const askedAt = daysAgo(12);
  await repo.transact(["events"], (tables) => {
    tables.events.find((e) => e.event_id === requestId).event_timestamp =
      askedAt;
  });
  await call("u-legal", "evidence", "attachEvidenceFile", {
    ...ref,
    eventType: "ACCEPTANCE",
    fileName: "bien-ban-nghiem-thu.pdf",
    sha256: EVIDENCE,
  });
  await call("u-legal", "evidence", "submitEvidence", ref);
  const done = await detail("u-legal");
  const review = done.acceptanceReview;
  const deadline = addDays(askedAt, 5);
  assert.equal(review.state, "ACCEPTED_AFTER_DEADLINE");
  assert.equal(review.deadline, deadline);
  assert.deepEqual(
    review.documents.map((d) => [d.eventType, d.deemed, d.countedAt]),
    [["ACCEPTANCE", true, deadline]],
  );
  assert.ok(review.documents[0].issuedAt > deadline);
  assert.equal(done.evaluation.completedAt, deadline);
  assert.deepEqual(done.evaluation.reviewWindow.deemedTypes, ["ACCEPTANCE"]);
  // Lateness is measured to the window's end, not to the day the buyer signed.
  const due = Date.parse(`${done.money.deadline}T00:00:00Z`);
  const counted = Date.parse(`${deadline.slice(0, 10)}T00:00:00Z`);
  assert.equal(
    done.evaluation.daysLate,
    Math.max(0, Math.round((counted - due) / 86_400_000)),
  );
  assert.equal(review.canRequest || review.canReturn, false);
  await assert.rejects(
    call("u-supplier", "acceptance", "requestAcceptance", ref),
    /ALREADY_ACCEPTED/,
  );
});
