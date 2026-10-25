import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Workflow over the organiser's Data Pack: every decision comes from the Python evaluator, every
// action is an event in the Data Pack schema, and access follows the authenticated actor.
let dir, repo, domain, service, auth, users;
const actor = (id) => auth.actor(users.find((u) => u.id === id));
const call = (id, module, action, ...args) =>
  service.call(module, action, { args }, actor(id));
const evaluationOf = async (milestoneId) =>
  (await repo.list("evaluations")).find((e) => e.milestoneId === milestoneId);

before(async () => {
  dir = await mkdtemp(join(tmpdir(), "codecash-workflow-"));
  process.env.REPO_ROOT = process.cwd();
  process.env.DATA_DIR = dir;
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
  domain = new DomainService(repo, new BaseService(repo));
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

async function placeActualSignatures(code) {
  const config = await call("u-legal", "signing", "getSigningConfig", code);
  const slots = await call(
    "u-legal",
    "signing",
    "getDefaultSignatureSlots",
    code,
  );
  assert.ok(
    Object.values(slots).every(Boolean),
    JSON.stringify({ slots, pages: config.previewPages }),
  );
  await call("u-legal", "signing", "saveSignatureSlots", code, slots, {
    documentSha256: config.documentSha256,
    version: config.layoutVersion,
  });
}

test("the Data Pack is imported as tables and evaluated by the specification engine", async () => {
  const contracts = await repo.list("contracts");
  const milestones = await repo.list("milestones");
  const events = await repo.list("events");
  const official = (rows) => rows.filter((r) => r.origin === "DATA_PACK");
  assert.equal(official(contracts).length, 100);
  assert.equal(official(milestones).length, 405);
  assert.equal(official(events).length, 1134);
  assert.equal((await repo.list("parties")).length, 65);
  assert.equal((await repo.list("payment-rules")).length, 128);
  const ids = new Set(official(milestones).map((m) => m.milestone_id));
  const counts = {};
  for (const e of await repo.list("evaluations"))
    if (ids.has(e.milestoneId))
      counts[e.decision] = (counts[e.decision] ?? 0) + 1;
  assert.deepEqual(counts, { RELEASE: 348, PENALTY: 15, HOLD: 36, REJECT: 6 });
  // Seed rows are marked, and every account is linked to a Data Pack party or the internal team.
  assert.ok(contracts.some((c) => c.origin === "SEED"));
  assert.ok(
    users.every(
      (u) => u.origin === "SEED" && (u.partyId || u.organizationId === "OPS"),
    ),
  );
});

test("opening a fresh contract does not resume or overwrite an existing draft", async () => {
  const before = await repo.list("contract-drafts");
  const resumed = await call("u-legal", "drafts", "getContractDraft", "CT0101");
  const fresh = await call(
    "u-legal",
    "drafts",
    "getContractDraft",
    undefined,
    true,
  );
  assert.equal(resumed.code, "CT0101");
  assert.notEqual(fresh.code, resumed.code);
  assert.equal(fresh.origin, "APP");
  assert.equal(fresh.file.name, "");
  assert.deepEqual(await repo.list("contract-drafts"), before);
  await assert.rejects(
    call("u-supplier", "drafts", "getContractDraft", undefined, true),
    /ACTION_FORBIDDEN/,
  );
});

test("each organisation sees only its contracts; direct ids of others are refused", async () => {
  const supplier = await call("u-supplier", "contracts", "getContractList");
  assert.ok(supplier.contracts.length > 0);
  assert.ok(supplier.contracts.every((c) => c.supplier.id === "S015"));
  assert.ok(supplier.contracts.every((c) => c.status !== "DRAFT"));
  const owner = await call("u-owner", "contracts", "getContractList");
  assert.ok(owner.contracts.every((c) => c.buyer.id === "B010"));
  const admin = await call("u-admin", "contracts", "getContractList");
  assert.equal(admin.contracts.length, (await repo.list("contracts")).length);
  await assert.rejects(
    call("u-supplier", "contracts", "getContractOverview", "CT0014"),
  );
  await assert.rejects(
    call("u-owner", "contracts", "getContractOverview", "CT0001"),
  );
  await assert.rejects(
    call("u-supplier", "approvals", "castVote", {
      contractId: "CT0103",
      sequence: 2,
      choice: "APPROVE",
    }),
  );
  await assert.rejects(
    call("u-supplier", "nope", "constructor"),
    /ACTION_NOT_FOUND/,
  );
});

test("tasks come from the engine's reasons and match each role", async () => {
  const kinds = async (id) =>
    (await call(id, "tasks", "getTaskInbox")).map(
      (t) => `${t.kind}:${t.contractId}`,
    );
  assert.ok((await kinds("u-owner")).includes("RESOLVE_DISPUTE:CT0019"));
  assert.ok((await kinds("u-legal")).includes("SUBMIT_EVIDENCE:CT0084"));
  assert.ok((await kinds("u-finance")).includes("APPROVE_PAYMENT:CT0103"));
  assert.ok((await kinds("u-supplier")).includes("SIGN_CONTRACT:CT0102"));
  assert.equal(
    (await kinds("u-admin")).filter((k) => k.startsWith("REVIEW_EXCEPTION"))
      .length,
    6,
  );
});

test("an approval is an APPROVAL event; the engine then decides, with the late penalty", async () => {
  const view = await call(
    "u-finance",
    "approvals",
    "getApprovalView",
    "CT0103",
    2,
  );
  assert.equal(view.canApprove, true);
  assert.equal(view.preview.decision, "PENALTY");
  const before = await evaluationOf(view.milestone.id);
  assert.equal(before.reasonCode, "APPROVAL_QUORUM_NOT_MET");
  const result = await call("u-finance", "approvals", "castVote", {
    contractId: "CT0103",
    sequence: 2,
    choice: "APPROVE",
  });
  assert.equal(result.evaluation.decision, "PENALTY");
  assert.equal(result.evaluation.payableMillion, view.preview.payableMillion);
  const event = (await repo.list("events")).find(
    (e) => e.event_id === result.eventIds[0],
  );
  assert.equal(event.event_type, "APPROVAL");
  assert.equal(event.actor_party_id, "A029");
  assert.equal(event.origin, "APP");
  const history = (await repo.list("status-history")).filter(
    (h) => h.milestoneId === view.milestone.id,
  );
  assert.equal(history.at(-1).to.status, "PAID_WITH_PENALTY");
  assert.equal(history.at(-1).trigger.kind, "EVENTS");
  await assert.rejects(
    call("u-finance", "approvals", "castVote", {
      contractId: "CT0103",
      sequence: 2,
      choice: "APPROVE",
    }),
    /MILESTONE_CLOSED|ALREADY_VOTED/,
  );
  const audit = await repo.list("audit");
  assert.ok(
    audit.some((a) => a.action === "castVote" && a.actorId === "u-finance"),
  );
});

test("users record only the events of their own side (spec 4.2 and 17)", async () => {
  await assert.rejects(
    call("u-legal", "evidence", "attachEvidenceFile", {
      contractId: "CT0104",
      sequence: 2,
      eventType: "INVOICE",
      fileName: "x.pdf",
      sizeMb: 1,
    }),
    /NOT_YOUR_EVENT_TYPE/,
  );
  for (const eventType of ["SERVICE_COMPLETED", "INVOICE"])
    await call("u-supplier", "evidence", "attachEvidenceFile", {
      contractId: "CT0104",
      sequence: 2,
      eventType,
      fileName: `${eventType}.pdf`,
      sizeMb: 1,
    });
  const workspace = await call(
    "u-supplier",
    "evidence",
    "getEvidenceWorkspace",
    "CT0104",
    2,
  );
  assert.equal(workspace.canSubmit, true);
  assert.equal(workspace.preview.reasonCode, "APPROVAL_QUORUM_NOT_MET");
  const result = await call("u-supplier", "evidence", "submitEvidence", {
    contractId: "CT0104",
    sequence: 2,
  });
  assert.equal(result.eventIds.length, 2);
  assert.equal(result.evaluation.status, "WAITING_APPROVAL");
  assert.ok(
    (await call("u-owner", "tasks", "getTaskInbox")).some(
      (t) => t.kind === "APPROVE_PAYMENT" && t.contractId === "CT0104",
    ),
  );
});

test("a dispute is closed only by a buyer-side DISPUTE_RESOLVED that references it", async () => {
  await assert.rejects(
    call("u-supplier", "disputes", "resolveDispute", {
      contractId: "CT0019",
      sequence: 3,
      option: "RESOLVE",
      note: "x",
    }),
  );
  const view = await call("u-owner", "disputes", "getDispute", "CT0019", 3);
  assert.equal(view.canResolve, true);
  assert.ok(view.preview);
  // While a dispute is open nobody can open another one on the same milestone.
  assert.equal(view.canOpen, false);
  await assert.rejects(
    call("u-supplier", "disputes", "openDispute", {
      contractId: "CT0019",
      sequence: 3,
      note: "Thêm một tranh chấp",
    }),
    /DISPUTE_ALREADY_OPEN/,
  );
  const result = await call("u-owner", "disputes", "resolveDispute", {
    contractId: "CT0019",
    sequence: 3,
    option: "RESOLVE",
    note: "Đã thống nhất",
  });
  assert.notEqual(result.evaluation.reasonCode, "OPEN_DISPUTE");
  assert.equal(result.evaluation.decision, view.preview.decision);
  const resolution = (await repo.list("events")).find(
    (e) => e.event_id === result.eventIds[0],
  );
  assert.equal(resolution.event_type, "DISPUTE_RESOLVED");
  assert.equal(resolution.reference_event_id, view.disputes[0].opened.id);
  const closed = await call("u-owner", "disputes", "getDispute", "CT0019", 3);
  assert.equal(closed.canOpen, true);
});

test("BR-19 voids an unauthorised event only with two different controllers", async () => {
  const [row] = await call("u-admin", "exceptions", "listExceptionQueue");
  const eventId = row.candidates[0].id;
  const ref = { contractId: row.contract.id, sequence: row.milestone.sequence };
  await assert.rejects(
    call("u-owner", "exceptions", "proposeException", {
      ...ref,
      eventId,
      reason: "x",
    }),
  );
  const { id } = await call("u-admin", "exceptions", "proposeException", {
    ...ref,
    eventId,
    reason: "Nhập nhầm kênh",
  });
  await assert.rejects(
    call("u-admin", "exceptions", "decideException", {
      exceptionId: id,
      approve: true,
    }),
    /SECOND_CONTROLLER_REQUIRED/,
  );
  const decided = await call("u-controller", "exceptions", "decideException", {
    exceptionId: id,
    approve: true,
  });
  assert.equal(decided.status, "APPROVED");
  assert.ok(decided.evaluation.voided.includes(eventId));
  assert.notEqual(decided.evaluation.reasonCode, "UNAUTHORIZED_EVENT");
});

test("a payment is transferred once per decision, then the milestone is final", async () => {
  const detail = await call(
    "u-finance",
    "contracts",
    "getMilestoneDetail",
    "CT0103",
    1,
  );
  assert.equal(detail.actions.transfer, true);
  await call("u-finance", "payments", "transferToAccounting", {
    contractId: "CT0103",
    sequence: 1,
  });
  await assert.rejects(
    call("u-finance", "payments", "transferToAccounting", {
      contractId: "CT0103",
      sequence: 1,
    }),
    /ALREADY_TRANSFERRED/,
  );
  const after = await call(
    "u-finance",
    "contracts",
    "getMilestoneDetail",
    "CT0103",
    1,
  );
  assert.equal(after.milestone.status, "COMPLETED");
  assert.ok(after.payment.id.startsWith("PAY-"));
});

test("signers sign in order; the last signature records the buyer's CONTRACT_SIGNED", async () => {
  await assert.rejects(
    call(
      "u-secondary",
      "signing",
      "sendSigningRequest",
      "CT0102",
      3,
      "VNPT_SMARTCA",
    ),
    /NOT_YOUR_TURN/,
  );
  for (const [user, step] of [
    ["u-supplier", 2],
    ["u-secondary", 3],
  ]) {
    await call(
      user,
      "signing",
      "sendSigningRequest",
      "CT0102",
      step,
      "VNPT_SMARTCA",
    );
    await call(user, "signing", "confirmSigningRequest", "CT0102", step);
  }
  const contract = (await repo.list("contracts")).find(
    (c) => c.contract_id === "CT0102",
  );
  assert.equal(contract.lifecycle, "ACTIVE");
  const signed = (await repo.list("events")).filter(
    (e) => e.contract_id === "CT0102" && e.event_type === "CONTRACT_SIGNED",
  );
  assert.equal(signed.length, 1);
  assert.equal(signed[0].actor_party_id, "B010");
  const verification = await call(
    "u-owner",
    "signing",
    "getVerification",
    "CT0102",
  );
  assert.equal(verification.signatures.length, 3);
  assert.ok(verification.effectiveAt);
});

test("a new contract is cut into Data Pack milestones and evaluated by the same rules", async () => {
  const draft = await call("u-legal", "drafts", "getContractDraft");
  const options = await call("u-legal", "drafts", "getUploadFormOptions");
  const supplier = options.suppliers.find((s) => s.id === "S015");
  const saved = await call("u-legal", "drafts", "saveContractDraft", {
    ...(draft.code === "CT0101" ? draft : { ...draft }),
    title: draft.title || "Hợp đồng kiểm thử",
    supplierId: supplier.id,
    type: "SERVICES",
    approvalPolicy: "FINANCE_PLUS_OWNER",
    graceDays: 9,
    penaltyRatePct: "0.23",
    maxPenaltyPct: "6.50",
    signers: [
      { party: "SUPPLIER", userId: options.supplierSigners.S015[0].userId },
      { party: "BUYER", userId: "u-finance" },
      { party: "BUYER", userId: "u-owner" },
    ],
    file: draft.file.name
      ? draft.file
      : { name: "HopDong.pdf", sizeBytes: 1000, kind: "PDF", pages: 14 },
  });
  const { SampleDocumentsController } =
    await import("../../apps/api/dist/sample-documents.js");
  const { DocumentsController } =
    await import("../../apps/api/dist/documents.js");
  const { BaseService } =
    await import("../../apps/api/dist/common/services/base.service.js");
  const { ExtractionService } =
    await import("../../apps/api/dist/trust/extraction-service.js");
  const generated = await new SampleDocumentsController(domain).create(
    { draft: saved, language: "en" },
    { user: actor("u-legal") },
  );
  const buffer = Buffer.from(generated.base64, "base64");
  await new DocumentsController(repo, new BaseService(repo)).upload(
    saved.code,
    { buffer, size: buffer.length, originalname: generated.fileName },
    { user: actor("u-legal") },
  );
  const extractor = new ExtractionService(repo, domain);
  const proposal = await extractor.extract(saved.code, actor("u-legal"));
  await extractor.confirm(
    saved.code,
    proposal.id,
    Object.fromEntries(
      proposal.fields.map((field) => [field.path, field.value]),
    ),
    actor("u-legal"),
  );
  const digitized = await call(
    "u-legal",
    "drafts",
    "getDigitization",
    saved.code,
  );
  assert.deepEqual(
    digitized.milestones.map((m) => m.type),
    ["KICKOFF", "INTERIM_DELIVERY", "FINAL_ACCEPTANCE", "WARRANTY_CLOSE"],
  );
  await placeActualSignatures(saved.code);
  await call("u-legal", "drafts", "confirmDigitization", saved.code, {
    dueDate: "2027-12-31",
  });
  const overview = await call(
    "u-owner",
    "contracts",
    "getContractOverview",
    saved.code,
  );
  assert.equal(overview.contract.status, "AWAITING_SIGNATURE");
  assert.equal(overview.milestones.length, 4);
  assert.ok(
    overview.milestones.every((m) =>
      m.releaseRuleCode.startsWith("R_SERVICE_STD:"),
    ),
  );
  assert.equal(overview.signing.total, 3);
  // Terms entered in the draft must reach the persisted dataset consumed by Python.
  const created = (await repo.list("milestones")).filter(
    (m) => m.contract_id === saved.code,
  );
  assert.equal(created.length, 4);
  for (const milestone of created) {
    assert.equal(milestone.grace_period_days, "9");
    const penalized = milestone.late_penalty_applicable === "TRUE";
    assert.equal(
      milestone.penalty_rate_pct_per_day,
      penalized ? "0.23" : "0.00",
    );
    assert.equal(milestone.max_penalty_pct, penalized ? "6.50" : "0.00");
    assert.equal(milestone.required_approval_quorum, "2");
    assert.deepEqual(milestone.required_approval_roles.split(";").sort(), [
      "CONTRACT_OWNER",
      "FINANCE_APPROVER",
    ]);
    assert.ok(await evaluationOf(milestone.milestone_id));
  }
  assert.equal(
    created.find((m) => m.milestone_type === "WARRANTY_CLOSE").due_date,
    "2027-12-31",
  );
  const unchanged = (await repo.list("milestones")).find(
    (m) => m.milestone_id === "MS0412",
  );
  assert.equal(unchanged.penalty_rate_pct_per_day, "0.15");
  assert.equal(unchanged.grace_period_days, "2");
});

test("the timeline replays a milestone after each of its events (as-of, BR-16)", async () => {
  const points = await call(
    "u-owner",
    "contracts",
    "getMilestoneTimeline",
    "CT0103",
    2,
  );
  assert.ok(points.length >= 2);
  assert.deepEqual(
    points.map((p) => p.at),
    points.map((p) => p.at).sort(),
  );
  assert.ok(points.every((p) => p.events.length > 0));
  assert.equal(points.at(-1).decision, (await evaluationOf("MS0412")).decision);
  await assert.rejects(
    call("u-supplier", "contracts", "getMilestoneTimeline", "CT0014", 2),
    /CONTRACT_ACCESS_DENIED/,
  );
});

test("the integrity check finds an edited audit entry, event or stored decision", async () => {
  const check = (anchor) =>
    call("u-controller", "integrity", "verifyIntegrity", anchor);
  const clean = await check();
  assert.equal(clean.chain.ok, true);
  assert.ok(clean.chain.sealed > 0);
  assert.ok(clean.evidence.sealed > 0);
  assert.deepEqual(clean.evidence.problems, []);
  assert.equal(clean.decisions.matched, clean.decisions.checked);
  assert.deepEqual(
    clean.dataPack.tables.map((x) => [x.name, x.ok]),
    [
      ["contracts", true],
      ["parties", true],
      ["milestones", true],
      ["events", true],
      ["payment-rules", true],
    ],
  );
  const { seq, hash } = clean.chain.head;
  assert.equal((await check(`${seq}:${hash}`)).chain.anchor, "MATCH");
  assert.equal(
    (await check(`${seq}:${"0".repeat(64)}`)).chain.anchor,
    "MISMATCH",
  );
  assert.equal(
    (await check(`${seq + 1000}:${hash}`)).chain.anchor,
    "NOT_FOUND",
  );
  await assert.rejects(check("nope"), /INVALID_ANCHOR/);
  await assert.rejects(call("u-supplier", "integrity", "verifyIntegrity"));
  // The log is append-only even for code that writes the table directly.
  await assert.rejects(
    repo.mutate("audit", (items) => {
      items[0].action = "EDITED";
    }),
    /APPEND_ONLY_RESOURCE/,
  );
  // Someone edits the stored data behind the application's back.
  const backup = structuredClone(repo.data);
  repo.data.audit.find((e) => e.hash && e.seq === 2).actorId = "someone-else";
  const sealedEvent = Object.keys(
    repo.data.audit.find(
      (e) => e.eventHashes && Object.keys(e.eventHashes).length,
    ).eventHashes,
  )[0];
  repo.data.events.find((e) => e.event_id === sealedEvent).event_timestamp =
    "2026-01-01T00:00:00";
  repo.data.evaluations.find((e) => e.milestoneId === "MS0001").decision =
    "REJECT";
  repo.data.events.find((e) => e.event_id === "EV00001").event_note = "edited";
  const tampered = await check();
  repo.data = backup;
  assert.deepEqual(tampered.chain.firstBroken, {
    seq: 2,
    id: tampered.chain.firstBroken.id,
    problem: "CONTENT_CHANGED",
  });
  assert.deepEqual(
    tampered.evidence.problems.map((p) => [p.eventId, p.problem]),
    [[sealedEvent, "CHANGED"]],
  );
  assert.ok(
    tampered.decisions.mismatches.some(
      (m) => m.milestoneId === "MS0001" && m.stored.decision === "REJECT",
    ),
  );
  assert.deepEqual(
    tampered.dataPack.tables.filter((x) => !x.ok).map((x) => x.name),
    ["events"],
  );
});

test("generic CRUD cannot change Data Pack or workflow records; its drafts stay outside the workflow", async () => {
  const { BaseService } =
    await import("../../apps/api/dist/common/services/base.service.js");
  const crud = new BaseService(repo);
  const legal = actor("u-legal");
  const workflowDraft = (await repo.list("contract-drafts")).find(
    (d) => d.code === "CT0101",
  );
  await assert.rejects(
    crud.update(
      "contract-drafts",
      workflowDraft.id,
      { supplierId: "S001", version: workflowDraft.version },
      legal,
    ),
    /MANAGED_RECORD/,
  );
  await assert.rejects(
    crud.remove("contract-drafts", workflowDraft.id, legal),
    /MANAGED_RECORD/,
  );
  const buyer = (await repo.list("organizations")).find((o) => o.id === "B010");
  await assert.rejects(
    crud.update(
      "organizations",
      buyer.id,
      { name: "Renamed", version: buyer.version },
      actor("u-sysadmin"),
    ),
    /MANAGED_RECORD/,
  );
  const added = await crud.create(
    "contract-drafts",
    {
      code: "CT0999",
      title: "CRUD row",
      supplierId: "S015",
      contractType: "GOODS_SUPPLY",
    },
    legal,
  );
  await assert.rejects(
    call("u-legal", "drafts", "getContractDraft", "CT0999"),
    /DRAFT_NOT_FOUND/,
  );
  assert.notEqual(
    (await call("u-legal", "drafts", "getContractDraft")).code,
    "CT0999",
  );
  await crud.remove("contract-drafts", added.id, legal);
});

test("internal roles are separated (SoD-1): controller, administrator, auditor", async () => {
  const { BaseService } =
    await import("../../apps/api/dist/common/services/base.service.js");
  const crud = new BaseService(repo);
  // The controller handles exceptions but manages no account or configuration.
  await assert.rejects(
    crud.list("users", {}, actor("u-admin")),
    /PERMISSION_DENIED/,
  );
  // The administrator manages accounts, sees no contract and decides nothing.
  assert.ok((await crud.list("users", {}, actor("u-sysadmin"))).total >= 69);
  await assert.rejects(
    call("u-sysadmin", "contracts", "getContractList"),
    /ACTION_FORBIDDEN/,
  );
  await assert.rejects(
    call("u-sysadmin", "exceptions", "listExceptionQueue"),
    /ACTION_FORBIDDEN/,
  );
  // The auditor reads every contract, the queue and the integrity check, and changes nothing.
  assert.equal(
    (await call("u-auditor", "contracts", "getContractList")).contracts.length,
    (await call("u-admin", "contracts", "getContractList")).contracts.length,
  );
  assert.ok(
    (await call("u-auditor", "exceptions", "listExceptionQueue")).length > 0,
  );
  assert.equal(
    (await call("u-auditor", "integrity", "verifyIntegrity")).chain.ok,
    true,
  );
  await assert.rejects(
    call("u-auditor", "exceptions", "proposeException", {
      contractId: "CT0017",
      sequence: 3,
      eventId: "x",
      reason: "x",
    }),
    /ACTION_FORBIDDEN/,
  );
  const owner = (await repo.list("users")).find((u) => u.id === "u-owner");
  await assert.rejects(
    crud.update(
      "users",
      owner.id,
      { title: "x", version: owner.version },
      actor("u-auditor"),
    ),
    /PERMISSION_DENIED/,
  );
});

test("workflow lists are read page by page with search, filters and sort on the server", async () => {
  const contracts = (query) =>
    call("u-owner", "contracts", "listContracts", query);
  const first = await contracts({ page: 1, limit: 5 });
  assert.equal(first.items.length, 5);
  assert.equal(first.total, 16);
  assert.equal(first.totalPages, 4);
  assert.ok(first.items.every((c) => c.buyer.id === "B010"));
  // Accents are optional: "thiet bi" finds "thiết bị".
  const found = await contracts({ search: "thiet bi" });
  assert.ok(found.items.some((c) => c.id === "CT0101"));
  assert.ok(found.items.every((c) => /thiết bị/i.test(c.title)));
  const drafts = await contracts({ filters: { status: ["DRAFT"] } });
  assert.ok(drafts.items.every((c) => c.status === "DRAFT"));
  // Facets cover the scope whatever the filters, so the menus keep every option.
  assert.equal(
    drafts.facets.status.reduce((sum, f) => sum + f.count, 0),
    16,
  );
  const sorted = await contracts({ sortBy: "valueMillion", sortOrder: "desc" });
  const values = sorted.items.map((c) => Number(c.valueMillion));
  assert.deepEqual(
    values,
    [...values].sort((a, b) => b - a),
  );
  await assert.rejects(
    contracts({ filters: { secret: ["x"] } }),
    /INVALID_FILTER/,
  );
  await assert.rejects(contracts({ limit: 1000 }), /INVALID_PAGINATION/);
  // Same scope as the unpaged view, for every role.
  assert.equal(
    (await call("u-supplier", "contracts", "listContracts", {})).total,
    (await call("u-supplier", "contracts", "getContractList")).contracts.length,
  );
  assert.equal(
    (await call("u-legal", "tasks", "listTasks", {})).total,
    (await call("u-legal", "tasks", "getTaskInbox")).length,
  );
  const queue = await call("u-admin", "exceptions", "listExceptions", {
    limit: 2,
  });
  assert.equal(queue.items.length, 2);
  assert.ok(queue.total >= queue.items.length);
  const activity = await call("u-owner", "activity", "listActivity", {
    filters: { contractCode: ["CT0103"], from: ["2026-08-01"] },
    limit: 100,
  });
  assert.ok(activity.total > 0);
  assert.ok(
    activity.items.every(
      (e) => e.contractCode === "CT0103" && e.at.slice(0, 10) >= "2026-08-01",
    ),
  );
  const times = activity.items.map((e) => e.at);
  assert.deepEqual(times, [...times].sort().reverse());
});

test("the state survives a restart of the service", async () => {
  const { WorkflowService } =
    await import("../../apps/api/dist/workflow.controller.js");
  const restarted = new WorkflowService(domain);
  const view = await restarted.call(
    "contracts",
    "getMilestoneDetail",
    { args: ["CT0103", 2] },
    actor("u-owner"),
  );
  assert.equal(view.evaluation.decision, "PENALTY");
  const activity = await restarted.call(
    "activity",
    "listActivityEntries",
    { args: [] },
    actor("u-owner"),
  );
  assert.ok(
    activity.some(
      (e) => e.action.kind === "DECISION" && e.contractCode === "CT0103",
    ),
  );
});

test("administrators manage persistent templates; drafts pin a version and survive template deletion", async () => {
  const { BaseService } =
    await import("../../apps/api/dist/common/services/base.service.js");
  const base = new BaseService(repo);
  const template = {
    code: "SERVICE_CUSTOM",
    name: "Dịch vụ theo yêu cầu",
    description: "Reusable terms",
    contractType: "SERVICES",
    approvalPolicy: "FINANCE_PLUS_OWNER",
    valueMillion: "1200.50",
    graceDays: 7,
    penaltyRatePct: "0.25",
    maxPenaltyPct: "7.00",
    signerRoles: "CONTRACT_OWNER",
    documentBody: "Deliver {{title}} to {{buyer}}",
    active: true,
  };
  for (const id of ["u-owner", "u-legal", "u-admin", "u-auditor"])
    await assert.rejects(
      base.create("contract-templates", template, actor(id)),
      /PERMISSION_DENIED/,
    );
  await assert.rejects(
    base.create(
      "contract-templates",
      { ...template, signerRoles: "CONTRACT_OWNER;LEGAL_REVIEWER" },
      actor("u-sysadmin"),
    ),
    /CONTRACT_TEMPLATE_INVALID/,
  );
  await assert.rejects(
    base.create(
      "contract-templates",
      { ...template, valueMillion: "0.00" },
      actor("u-sysadmin"),
    ),
    /CONTRACT_TEMPLATE_INVALID/,
  );
  const created = await base.create(
    "contract-templates",
    template,
    actor("u-sysadmin"),
  );
  const options = await call("u-legal", "drafts", "getUploadFormOptions");
  const preset = options.presets.find((row) => row.id === created.id);
  assert.equal(preset.defaults.valueMillion, "1200.50");
  assert.equal(preset.signers.length, 1);
  const input = {
    ...(await call("u-legal", "drafts", "getContractDraft")),
    ...preset.defaults,
    title: "Pinned template contract",
    supplierId: "S015",
    reviewerId: "u-legal",
    templateId: created.id,
    templateVersion: created.version,
    signers: preset.signers,
    documentBody: "Custom contract-specific terms",
    file: { name: "not-uploaded.pdf", kind: "PDF", sizeBytes: 100 },
  };
  const saved = await call("u-legal", "drafts", "saveContractDraft", input);
  assert.equal(saved.templateSnapshot.documentBody, template.documentBody);
  assert.equal(saved.documentBody, "Custom contract-specific terms");
  await assert.rejects(
    call("u-legal", "drafts", "confirmDigitization", saved.code, {
      dueDate: "2028-12-31",
    }),
    /DOCUMENT_REQUIRED/,
  );
  const updated = await base.update(
    "contract-templates",
    created.id,
    {
      version: created.version,
      name: "Version two",
      documentBody: "Changed defaults",
    },
    actor("u-sysadmin"),
  );
  await assert.rejects(
    base.update(
      "contract-templates",
      created.id,
      { version: created.version, name: "stale edit" },
      actor("u-sysadmin"),
    ),
    /VERSION_CONFLICT/,
  );
  const pinned = await call("u-legal", "drafts", "saveContractDraft", saved);
  assert.equal(pinned.templateSnapshot.version, 1);
  assert.equal(pinned.templateSnapshot.name, template.name);
  const refreshed = await call("u-legal", "drafts", "saveContractDraft", {
    ...pinned,
    templateVersion: updated.version,
    documentBody: updated.documentBody,
  });
  assert.equal(refreshed.templateSnapshot.version, 2);
  await base.remove("contract-templates", created.id, actor("u-sysadmin"));
  await domain.bootstrap();
  assert.ok(
    !(await repo.list("contract-templates")).some(
      (row) => row.id === created.id,
    ),
  );
  assert.ok(
    !(await call("u-legal", "drafts", "getUploadFormOptions")).presets.some(
      (row) => row.id === created.id,
    ),
  );
  assert.equal(
    (await call("u-legal", "drafts", "saveContractDraft", refreshed))
      .templateSnapshot.version,
    2,
  );
  await assert.rejects(
    call("u-legal", "drafts", "saveContractDraft", {
      ...refreshed,
      templateVersion: 99,
    }),
    /CONTRACT_TEMPLATE_UNAVAILABLE/,
  );
  const audit = await repo.list("audit");
  assert.deepEqual(
    audit
      .filter(
        (row) =>
          row.resource === "contract-templates" && row.recordId === created.id,
      )
      .map((row) => row.action),
    ["CREATE", "UPDATE", "DELETE"],
  );
});

test("live workflow rolls back business changes and success audit when engine invariants fail", async () => {
  const { readFile } = await import("node:fs/promises");
  const { outcome } = await import("../../apps/api/dist/domain/actions.js");
  const before = await readFile(repo.path, "utf8");
  await assert.rejects(
    domain.write(actor("u-admin"), "test-invalid-engine-result", (ctx) => {
      for (const rule of ctx.t["payment-rules"])
        if (rule.priority === "70") rule.payable_amount_formula = "0";
      return outcome(ctx, {}, { evaluate: true });
    }),
    /ENGINE_INVARIANT_VIOLATION/,
  );
  assert.equal(await readFile(repo.path, "utf8"), before);
});

test("an invalid rule result rolls back workflow changes and cannot enter a live or hypothetical payment decision", async () => {
  const original = structuredClone(
    (await repo.list("payment-rules")).find((row) => row.rule_id === "PR0007"),
  );
  const names = [
    "notes",
    "evaluations",
    "status-history",
    "engine-runs",
    "audit",
  ];
  try {
    await repo.mutate("payment-rules", (rows) => {
      rows.find((row) => row.rule_id === "PR0007").payable_amount_formula =
        "planned_payment_vnd_mn + 1";
    });
    // Fixture setup itself appends SYSTEM_WRITE; snapshot after that legitimate audit entry.
    const before = Object.fromEntries(
      await Promise.all(
        names.map(async (name) => [
          name,
          JSON.stringify(await repo.list(name)),
        ]),
      ),
    );
    await assert.rejects(
      domain.write(actor("u-owner"), "INVALID_RULE_TEST", (ctx) => {
        ctx.t.notes.push({
          id: "must-rollback",
          version: 1,
          text: "Never persist invalid pricing",
        });
        return {
          result: {},
          evaluate: true,
          trigger: { kind: "EVENT" },
          audit: [],
        };
      }),
      /ENGINE_INVARIANT_VIOLATION/,
    );
    await assert.rejects(
      domain.read(actor("u-owner"), (_, dryRun) => dryRun([])),
      /ENGINE_INVARIANT_VIOLATION/,
    );
    for (const name of names)
      assert.equal(JSON.stringify(await repo.list(name)), before[name], name);
  } finally {
    await repo.mutate("payment-rules", (rows) => {
      Object.assign(
        rows.find((row) => row.rule_id === "PR0007"),
        original,
      );
    });
  }
});

test("organiser contracts get a deterministic simulated original that leaves signatures alone", async () => {
  const { mockInput, mockOriginal, mockRendering, needsMockOriginal } =
    await import("../../apps/api/dist/mock-originals.js");
  const verificationBefore = await call(
    "u-owner",
    "signing",
    "getVerification",
    "CT0084",
  );
  const input = await domain.read(actor("u-owner"), (ctx) => {
    assert.equal(needsMockOriginal(ctx, "CT0084"), true);
    return mockInput(ctx, "CT0084");
  });
  // The document is rebuilt from the contract's own data: its signers and milestones.
  assert.deepEqual(
    input.signers.map((s) => s.name),
    verificationBefore.signatures.map((s) => s.signerName),
  );
  assert.equal(input.stages.length, 4);
  const first = await mockOriginal(input);
  const again = await mockOriginal(structuredClone(input));
  assert.equal(first.sha256, again.sha256);
  assert.equal(first.docx.subarray(0, 2).toString(), "PK");
  // Rendering finds one signing area per signer on the real PDF pages.
  const rendering = await mockRendering(input);
  const anchors = rendering.pages.flatMap((page) => page.anchors ?? []);
  assert.deepEqual(
    anchors.map((anchor) => anchor.stepNo),
    input.signers.map((_, index) => index + 1),
  );
  // Viewing never changes what the signatures are bound to.
  assert.deepEqual(
    await call("u-owner", "signing", "getVerification", "CT0084"),
    verificationBefore,
  );
});

// Runs last: it replaces the data every other test works on.
test("the demo reset archives the data and its audit chain instead of deleting them", async () => {
  const { readFile, readdir } = await import("node:fs/promises");
  const { can } = await import("../../apps/api/dist/common/permissions.js");
  const { verifyChain } =
    await import("../../apps/api/dist/common/audit-chain.js");
  assert.equal(can("SYSTEM_ADMIN", "demo:reset"), true);
  for (const role of ["ADMIN_AUDITOR", "AUDITOR", "CONTRACT_OWNER", "SUPPLIER"])
    assert.equal(can(role, "demo:reset"), false, role);
  await call("u-owner", "signing", "getVerification", "CT0084");
  const before = await repo.list("audit");
  assert.ok(before.length > 1);

  const { archive } = await domain.resetDemo(actor("u-sysadmin"));
  const archived = JSON.parse(
    await readFile(join(dir, `records.${archive}.json`), "utf8"),
  );
  assert.deepEqual(archived.audit, before);
  assert.ok((await readdir(dir)).includes("records.json"));

  const audit = await repo.list("audit");
  assert.equal(verifyChain(audit).ok, true);
  assert.ok(audit.some((entry) => entry.action === "IMPORT_DATA_PACK"));
  const reset = audit.find((entry) => entry.action === "RESET_DEMO_DATA");
  assert.equal(reset.actorId, "u-sysadmin");
  assert.equal(reset.recordId, archive);
  assert.equal(reset.archivedEntries, before.length);
  assert.equal(reset.archivedHeadHash, before.at(-1).hash);
  // The initial data is back.
  const official = (await repo.list("events")).filter(
    (e) => e.origin !== "APP",
  );
  assert.equal((await repo.list("events")).length, official.length);
});
