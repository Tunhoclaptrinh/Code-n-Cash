import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

/*
 * Business-rule guard matrix: for every write action of the workflow API, who may do it, in which
 * state, and what happens when it is repeated or done out of order. Expectations come from the
 * business sources, not from the implementation:
 *   [PDF]   BangD-Case4/DeThi2026_BangD_SmartContractWorkflow.pdf (brief)
 *   [04]    docs/04_DAC_TA_NGHIEP_VU.md (BR-xx rules, sections 4.2, 8, 9, 17)
 *   [15]    docs/15_XAC_NHAN_BTC_VA_GIA_DINH.md (organiser clarifications)
 *   [09]    docs/09_HUONG_DAN_TINH_NANG_VA_VAI_TRO.md (role guide, error codes)
 *   [10]    docs/10_RULES_AI_KY_SO_VA_NIEM_PHONG.md and the signing guide (apps/web/src/guide/en/signing.md)
 * A test marked { todo: "BUG: ..." } documents a rule the product does not enforce yet; it stays
 * in the suite so the gap is visible and so it turns into a normal test once fixed.
 */

const ROOT = process.cwd();
const execFileAsync = promisify(execFile);
const DATA_PACK = join(
  ROOT,
  "BangD-Case4/DataPack-CASE4_SmartContractWorkflow/01_data",
);

/* ---------------------------------- fixtures --------------------------------- */

// Nova An (buyer B010) and Phú Minh (supplier S015) are the demo organisations.
const U = {
  OWNER: "u-owner",
  FINANCE: "u-finance",
  SECONDARY: "u-secondary",
  LEGAL: "u-legal",
  SUPPLIER: "u-supplier",
  // Each party's own internal controller: it checks, it never proposes or records anything.
  CONTROLLER: "u-novaan-controller",
  SUPPLIER_CONTROLLER: "u-phuminh-controller",
  SYSADMIN: "u-sysadmin",
  AUDITOR: "u-auditor",
};
const ROLE_USER = {
  CONTRACT_OWNER: U.OWNER,
  FINANCE_APPROVER: U.FINANCE,
  SECONDARY_APPROVER: U.SECONDARY,
  LEGAL_REVIEWER: U.LEGAL,
  SUPPLIER: U.SUPPLIER,
  ADMIN_AUDITOR: U.CONTROLLER,
  SYSTEM_ADMIN: U.SYSADMIN,
  AUDITOR: U.AUDITOR,
};
const ROLES = Object.keys(ROLE_USER);

let base, goldenRecords, users, imports;

before(async () => {
  base = await mkdtemp(join(tmpdir(), "codecash-rules-"));
  process.env.REPO_ROOT = ROOT;
  process.env.STORAGE_DRIVER = "file";
  process.env.TRUST_DIR = join(base, "trust");
  const golden = join(base, "golden");
  await mkdir(golden);
  process.env.DATA_DIR = golden;
  const load = (path) => import(`../../apps/api/dist/${path}`);
  imports = {
    Repository: (await load("common/repository.js")).Repository,
    BaseService: (await load("common/services/base.service.js")).BaseService,
    AuthService: (await load("auth.js")).AuthService,
    DomainService: (await load("domain/service.js")).DomainService,
    WorkflowService: (await load("workflow.controller.js")).WorkflowService,
    load,
  };
  const { Repository, BaseService, AuthService, DomainService } = imports;
  const repo = new Repository();
  await repo.init();
  const domain = new DomainService(repo, new BaseService(repo));
  await domain.bootstrap();
  const auth = new AuthService(repo);
  await auth.seed();
  users = await repo.list("users");
  imports.auth = auth;
  await repo.onModuleDestroy();
  goldenRecords = join(golden, "records.json");
});
after(async () => {
  await rm(base, { recursive: true, force: true });
});

/** A fresh copy of the seeded database (Data Pack + demo seed + accounts), with its own service. */
async function world() {
  const { Repository, BaseService, DomainService, WorkflowService, auth } =
    imports;
  const dir = await mkdtemp(join(base, "w-"));
  await copyFile(goldenRecords, join(dir, "records.json"));
  process.env.DATA_DIR = dir;
  const repo = new Repository();
  await repo.init();
  const domain = new DomainService(repo, new BaseService(repo));
  const service = new WorkflowService(domain);
  const actor = (id) => {
    const user = users.find((u) => u.id === id);
    assert.ok(user, `unknown test user ${id}`);
    return auth.actor(user);
  };
  const w = {
    repo,
    domain,
    service,
    dir,
    actor,
    call: (id, module, action, ...args) =>
      service.call(module, action, { args }, actor(id)),
    tbl: (name) => repo.data[name] ?? [],
    // The repository replaces its data object on every stored write and never otherwise, so an
    // unchanged reference plus unchanged table sizes and audit head proves a call stored nothing.
    snap: () => ({
      ref: repo.data,
      sizes: Object.entries(repo.data)
        .map(([name, rows]) => `${name}:${rows.length}`)
        .join(","),
      head: repo.data.audit?.at(-1)?.hash,
    }),
  };
  w.milestone = (contractId, sequence) =>
    w
      .tbl("milestones")
      .find(
        (m) =>
          m.contract_id === contractId &&
          Number(m.milestone_sequence) === sequence,
      );
  w.evaluation = (milestoneId) =>
    w.tbl("evaluations").find((e) => e.milestoneId === milestoneId);
  w.events = (milestoneId) =>
    w.tbl("events").filter((e) => e.milestone_id === milestoneId);
  w.contract = (id) => w.tbl("contracts").find((c) => c.contract_id === id);
  w.ref = (contractId, sequence) => ({ contractId, sequence });
  return w;
}

const userOf = (org, role) => {
  const user = users.find((u) => u.organizationId === org && u.role === role);
  assert.ok(user, `no ${role} in ${org}`);
  return user.id;
};

/* ---------------------------------- assertions --------------------------------- */

const messageOf = (error) =>
  error instanceof Error ? error.message : String(error);

/** The call must fail with exactly this error code (or match the pattern). */
async function expectCode(promise, code) {
  let failure;
  try {
    await promise;
  } catch (error) {
    failure = error;
  }
  assert.ok(failure, `expected ${code} but the call succeeded`);
  const got = messageOf(failure);
  const hit = code instanceof RegExp ? code.test(got) : got === code;
  assert.ok(hit, `expected ${code} but got ${got}`);
  return got;
}

function assertUnchanged(w, before, label) {
  const now = w.snap();
  assert.ok(now.ref === before.ref, `${label} but stored data was rewritten`);
  assert.equal(now.sizes, before.sizes, `${label} but a table changed size`);
  assert.equal(now.head, before.head, `${label} but the audit log grew`);
}

/** A rejected write must leave every table, including the audit log, byte-for-byte unchanged. */
async function denied(w, user, module, action, args, code) {
  const before = w.snap();
  await expectCode(w.call(user, module, action, ...args), code);
  assertUnchanged(w, before, `${action} by ${user} was rejected`);
}

/** A successful write must append sealed audit entries naming the action and the signed-in actor. */
async function ok(w, user, module, action, ...args) {
  const before = w.tbl("audit").length;
  const result = await w.call(user, module, action, ...args);
  const added = w.tbl("audit").slice(before);
  assert.ok(added.length >= 1, `${action} left no audit entry`);
  assert.ok(
    added.every((entry) => entry.hash && entry.prevHash && entry.seq),
    `${action} wrote an unsealed audit entry`,
  );
  assert.ok(
    added.some(
      (entry) =>
        entry.action === action &&
        entry.actorId === user &&
        entry.resource === "workflow",
    ),
    `${action} audit entry does not name ${user}`,
  );
  return result;
}

const cents = (value) => {
  const [whole, fraction = ""] = String(value).split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0").slice(0, 2));
};
const money = (value) => {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  return `${negative ? "-" : ""}${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`;
};

/* ------------------------------ 0. fixtures are what the suite assumes ------------------------------ */

test("fixtures: the milestones the rule tests rely on are in the states the Data Pack and demo seed define", async () => {
  const w = await world();
  const expectations = [
    // [contract, sequence, status, reason]
    ["CT0019", 3, "ON_HOLD", "OPEN_DISPUTE"],
    ["CT0002", 3, "REJECTED", "REJECTION_PRESENT"],
    ["CT0017", 3, "ON_HOLD", "UNAUTHORIZED_EVENT"],
    ["CT0008", 1, "ELIGIBLE_FOR_PAYMENT", "ALL_CONDITIONS_MET"],
    ["CT0005", 3, "PAID_WITH_PENALTY", "LATE_COMPLETION"],
    ["CT0103", 2, "WAITING_APPROVAL", "APPROVAL_QUORUM_NOT_MET"],
    ["CT0103", 3, "WAITING_EVIDENCE", "MISSING_REQUIRED_EVENT"],
    ["CT0104", 2, "WAITING_EVIDENCE", "MISSING_REQUIRED_EVENT"],
    ["CT0013", 3, "PAID_WITH_PENALTY", "LATE_COMPLETION"],
    ["CT0025", 2, "WAITING_EVIDENCE", "MISSING_REQUIRED_EVENT"],
  ];
  for (const [contract, sequence, status, reason] of expectations) {
    const evaluation = w.evaluation(
      w.milestone(contract, sequence).milestone_id,
    );
    assert.equal(evaluation.status, status, `${contract}#${sequence}`);
    assert.equal(evaluation.reasonCode, reason, `${contract}#${sequence}`);
  }
  assert.equal(w.contract("CT0101").lifecycle, "DRAFT");
  assert.equal(w.contract("CT0102").lifecycle, "SIGNING");
  assert.equal(w.contract("CT0103").lifecycle, "ACTIVE");
  assert.equal(w.tbl("payments").length, 0);
  assert.equal(w.tbl("exceptions").length, 0);
});

/* ------------------------------ 1. who: role x action matrix (spec 17) ------------------------------ */

const BUYER_EDITORS = ["CONTRACT_OWNER", "LEGAL_REVIEWER"];
const APPROVERS = ["CONTRACT_OWNER", "FINANCE_APPROVER", "SECONDARY_APPROVER"];
const ANY_PARTY = [...APPROVERS, "LEGAL_REVIEWER", "SUPPLIER"];
const at = (sequence, extra = {}) => ({
  contractId: "CT0104",
  sequence,
  ...extra,
});

// Roles that may call each write action, from spec 17 and the role guide [09] section 8. Every role
// outside the list must be refused before anything is read or changed (SoD-1, SoD-3).
const WRITE_ACTIONS = [
  {
    name: "attachEvidenceFile",
    module: "evidence",
    allowed: ["LEGAL_REVIEWER", "SUPPLIER"],
    args: [at(99, { eventType: "INVOICE", fileName: "x.pdf", sizeMb: 1 })],
    reaches: "MILESTONE_NOT_FOUND",
  },
  {
    name: "removeEvidenceFile",
    module: "evidence",
    allowed: ["LEGAL_REVIEWER", "SUPPLIER"],
    args: [at(99, { attachmentId: "ATT-00001" })],
    reaches: "MILESTONE_NOT_FOUND",
  },
  {
    name: "submitEvidence",
    module: "evidence",
    allowed: ["LEGAL_REVIEWER", "SUPPLIER"],
    args: [at(99)],
    reaches: "MILESTONE_NOT_FOUND",
  },
  {
    name: "castVote",
    module: "approvals",
    allowed: APPROVERS,
    args: [at(99, { choice: "APPROVE" })],
    reaches: "MILESTONE_NOT_FOUND",
  },
  {
    name: "openDispute",
    module: "disputes",
    allowed: ["CONTRACT_OWNER", "LEGAL_REVIEWER", "SUPPLIER"],
    args: [at(99, { note: "x" })],
    reaches: "MILESTONE_NOT_FOUND",
  },
  {
    name: "resolveDispute",
    module: "disputes",
    allowed: BUYER_EDITORS,
    args: [at(99, { option: "RESOLVE", note: "x" })],
    reaches: "MILESTONE_NOT_FOUND",
  },
  {
    name: "transferToAccounting",
    module: "payments",
    allowed: ["FINANCE_APPROVER"],
    args: [at(99)],
    reaches: "MILESTONE_NOT_FOUND",
  },
  {
    name: "proposeException",
    module: "exceptions",
    allowed: ["CONTRACT_OWNER"],
    args: [at(99, { eventId: "EV00001", reason: "x" })],
    reaches: "MILESTONE_NOT_FOUND",
  },
  {
    name: "decideException",
    module: "exceptions",
    allowed: ["ADMIN_AUDITOR"],
    args: [{ exceptionId: "EXC-9999", approve: true }],
    reaches: "EXCEPTION_NOT_FOUND",
  },
  {
    name: "saveSignatureSlots",
    module: "signing",
    allowed: BUYER_EDITORS,
    args: ["CT9999", {}],
    reaches: "CONTRACT_NOT_FOUND",
  },
  ...[
    "sendSigningRequest",
    "confirmSigningRequest",
    "rejectSigningRequest",
    "cancelSigningRequest",
  ].map((name) => ({
    name,
    module: "signing",
    allowed: ANY_PARTY,
    args:
      name === "sendSigningRequest"
        ? ["CT0104", 99, "USB_TOKEN"]
        : ["CT0104", 99],
    reaches: "STEP_NOT_FOUND",
  })),
  {
    name: "cancelSigning",
    module: "signing",
    allowed: BUYER_EDITORS,
    args: ["CT9999"],
    reaches: "CONTRACT_NOT_FOUND",
  },
  {
    name: "saveContractDraft",
    module: "drafts",
    allowed: BUYER_EDITORS,
    args: [{}],
    reaches: "TITLE_REQUIRED",
  },
  {
    name: "confirmDigitization",
    module: "drafts",
    allowed: BUYER_EDITORS,
    args: ["CT9999", { dueDate: null }],
    reaches: "CONTRACT_NOT_FOUND",
  },
];

test("who: only the roles of spec 17 reach each write action; every other role is refused and nothing is stored", async () => {
  const w = await world();
  // A write action added to the controller without a row here would escape this matrix.
  const source = await readFile(
    join(ROOT, "apps/api/src/workflow.controller.ts"),
    "utf8",
  );
  const registered = [
    ...source.matchAll(/write\(\s*"[\w:-]+",\s*"(\w+)"/g),
  ].map((match) => match[1]);
  assert.deepEqual(
    registered.filter((name) => name !== "getSigningRequest").sort(),
    WRITE_ACTIONS.map((row) => row.name).sort(),
    "every write action of workflow.controller.ts is covered by the matrix",
  );
  assert.equal(WRITE_ACTIONS.length, 17);
  for (const row of WRITE_ACTIONS)
    for (const role of ROLES) {
      const code = row.allowed.includes(role)
        ? row.reaches
        : "ACTION_FORBIDDEN";
      await denied(w, ROLE_USER[role], row.module, row.name, row.args, code);
    }
});

test("who: SoD-1 and read-only roles can never write (system administrator, integrity checker, controllers outside their check)", async () => {
  const w = await world();
  for (const row of WRITE_ACTIONS) {
    for (const user of [U.SYSADMIN, U.AUDITOR])
      await denied(w, user, row.module, row.name, row.args, "ACTION_FORBIDDEN");
    // A controller of either party only checks the owner's proposal; it records nothing.
    if (row.name !== "decideException")
      for (const user of [U.CONTROLLER, U.SUPPLIER_CONTROLLER])
        await denied(
          w,
          user,
          row.module,
          row.name,
          row.args,
          "ACTION_FORBIDDEN",
        );
  }
});

test("who: identity comes from the session; a role, actor or organisation sent in the request is never used", async () => {
  const w = await world();
  const supplier = w.actor(U.SUPPLIER);
  const before = w.snap();
  // Claims placed next to the arguments and inside them are ignored.
  const claims = {
    role: "FINANCE_APPROVER",
    actorId: "u-finance",
    organizationId: "B010",
    actor: { ...w.actor(U.FINANCE) },
  };
  await expectCode(
    w.service.call(
      "payments",
      "transferToAccounting",
      { args: [{ ...at(2), ...claims }], ...claims },
      supplier,
    ),
    "ACTION_FORBIDDEN",
  );
  await expectCode(
    w.service.call(
      "exceptions",
      "decideException",
      { args: [{ exceptionId: "EXC-1", approve: true, ...claims }], ...claims },
      supplier,
    ),
    "ACTION_FORBIDDEN",
  );
  await expectCode(
    w.service.call(
      "disputes",
      "resolveDispute",
      {
        args: [{ ...at(2), option: "RESOLVE", note: "x", ...claims }],
        ...claims,
      },
      supplier,
    ),
    "ACTION_FORBIDDEN",
  );
  assertUnchanged(w, before, "rejected requests");
});

test("who: malformed requests are refused without touching data (module, arguments, input shape)", async () => {
  const w = await world();
  const before = w.snap();
  for (const [module, action] of [
    ["nope", "castVote"],
    ["approvals", "nope"],
    ["__proto__", "toString"],
    ["constructor", "constructor"],
  ])
    await expectCode(w.call(U.OWNER, module, action), "ACTION_NOT_FOUND");
  await expectCode(
    w.service.call("approvals", "castVote", { args: "x" }, w.actor(U.OWNER)),
    "INVALID_ARGUMENTS",
  );
  await expectCode(
    w.service.call(
      "approvals",
      "castVote",
      { args: Array(7).fill({}) },
      w.actor(U.OWNER),
    ),
    "INVALID_ARGUMENTS",
  );
  const inputActions = WRITE_ACTIONS.filter(
    (row) => typeof row.args[0] === "object",
  );
  for (const row of inputActions)
    for (const bad of [null, undefined, "x", 7, [], [{}]])
      await expectCode(
        w.call(ROLE_USER[row.allowed[0]], row.module, row.name, bad),
        /INVALID_INPUT/,
      );
  assertUnchanged(w, before, "rejected requests");
});

/* ------------------------------ 2. who: other organisations (spec 17, R13) ------------------------------ */

test("who: an actor of another organisation is refused on every write action of a contract that is not theirs", async () => {
  const w = await world();
  const otherBuyerLegal = userOf("B009", "LEGAL_REVIEWER");
  const otherBuyerOwner = userOf("B009", "CONTRACT_OWNER");
  const otherBuyerFinance = userOf("B009", "FINANCE_APPROVER");
  const otherSupplier = userOf("S024", "SUPPLIER");
  const accept = at(3, {
    eventType: "ACCEPTANCE",
    fileName: "x.pdf",
    sizeMb: 1,
  });
  const cases = [
    [otherBuyerLegal, "evidence", "attachEvidenceFile", [accept]],
    [
      otherSupplier,
      "evidence",
      "attachEvidenceFile",
      [at(2, { eventType: "INVOICE", fileName: "x.pdf", sizeMb: 1 })],
    ],
    [
      otherBuyerLegal,
      "evidence",
      "removeEvidenceFile",
      [at(2, { attachmentId: "ATT-00001" })],
    ],
    [
      otherSupplier,
      "evidence",
      "removeEvidenceFile",
      [at(2, { attachmentId: "ATT-00001" })],
    ],
    [otherBuyerLegal, "evidence", "submitEvidence", [at(3)]],
    [otherSupplier, "evidence", "submitEvidence", [at(2)]],
    [otherBuyerOwner, "approvals", "castVote", [at(3, { choice: "APPROVE" })]],
    [
      otherBuyerOwner,
      "approvals",
      "castVote",
      [at(3, { choice: "REJECT", note: "x" })],
    ],
    [otherBuyerOwner, "disputes", "openDispute", [at(2, { note: "x" })]],
    [otherBuyerLegal, "disputes", "openDispute", [at(2, { note: "x" })]],
    [otherSupplier, "disputes", "openDispute", [at(2, { note: "x" })]],
    [
      otherBuyerOwner,
      "disputes",
      "resolveDispute",
      [at(2, { option: "RESOLVE", note: "x" })],
    ],
    [
      otherBuyerLegal,
      "disputes",
      "resolveDispute",
      [at(2, { option: "RESOLVE", note: "x" })],
    ],
    [otherBuyerFinance, "payments", "transferToAccounting", [at(1)]],
    [otherBuyerLegal, "signing", "saveSignatureSlots", ["CT0104", {}]],
    [otherBuyerLegal, "signing", "cancelSigning", ["CT0104"]],
    [
      otherBuyerLegal,
      "drafts",
      "confirmDigitization",
      ["CT0101", { dueDate: null }],
    ],
    [
      otherBuyerOwner,
      "signing",
      "sendSigningRequest",
      ["CT0104", 1, "USB_TOKEN"],
    ],
    [otherBuyerOwner, "signing", "confirmSigningRequest", ["CT0104", 1]],
    [otherBuyerOwner, "signing", "rejectSigningRequest", ["CT0104", 1]],
    [otherBuyerOwner, "signing", "cancelSigningRequest", ["CT0104", 1]],
    [
      otherSupplier,
      "signing",
      "sendSigningRequest",
      ["CT0104", 2, "USB_TOKEN"],
    ],
    [otherSupplier, "signing", "confirmSigningRequest", ["CT0104", 2]],
    [otherSupplier, "signing", "getSigningRequest", ["CT0104", 2]],
  ];
  for (const [user, module, action, args] of cases)
    await denied(w, user, module, action, args, "CONTRACT_ACCESS_DENIED");
  // A draft belongs to its buyer only; its own supplier does not see it before signing.
  for (const [module, action, args] of [
    [
      "evidence",
      "attachEvidenceFile",
      [
        {
          contractId: "CT0101",
          sequence: 1,
          eventType: "INVOICE",
          fileName: "x.pdf",
          sizeMb: 1,
        },
      ],
    ],
    [
      "disputes",
      "openDispute",
      [{ contractId: "CT0101", sequence: 1, note: "x" }],
    ],
    ["signing", "sendSigningRequest", ["CT0101", 2, "USB_TOKEN"]],
  ])
    await denied(w, U.SUPPLIER, module, action, args, "CONTRACT_ACCESS_DENIED");
  // Another buyer cannot take over a draft by saving under its code.
  const draft = await w.call(U.LEGAL, "drafts", "getContractDraft", "CT0101");
  await denied(
    w,
    otherBuyerLegal,
    "drafts",
    "saveContractDraft",
    [draft],
    "DRAFT_LOCKED",
  );
  await denied(
    w,
    otherBuyerLegal,
    "drafts",
    "getContractDraft",
    ["CT0101"],
    "DRAFT_NOT_FOUND",
  );
});

/* ------------------------------ shared scenario helpers ------------------------------ */

/** The finance approver of the contract's buyer. */
const financeOf = (w, contractId) =>
  userOf(w.contract(contractId).buyer_id, "FINANCE_APPROVER");
const ownerOf = (w, contractId) =>
  userOf(w.contract(contractId).buyer_id, "CONTRACT_OWNER");
const legalOf = (w, contractId) =>
  userOf(w.contract(contractId).buyer_id, "LEGAL_REVIEWER");
const supplierOf = (w, contractId) =>
  userOf(w.contract(contractId).supplier_id, "SUPPLIER");

/** Pays a RELEASE/PENALTY milestone out so it is COMPLETED (spec 9.4 closed state). */
async function pay(w, contractId, sequence) {
  return ok(
    w,
    financeOf(w, contractId),
    "payments",
    "transferToAccounting",
    w.ref(contractId, sequence),
  );
}

const file = (extra) => ({ fileName: "chung-tu.pdf", sizeMb: 1, ...extra });

/* ------------------------------ 3. evidence: attach / remove / submit ------------------------------ */

// Spec 4.2: which side may create each required event. Written from the spec table, not from the code.
const SPEC_AUTHORITY = {
  CONTRACT_SIGNED: "BUYER",
  KICKOFF_CONFIRMED: "BUYER",
  REQUIREMENTS_APPROVED: "BUYER",
  UAT_PASSED: "BUYER",
  ACCEPTANCE: "BUYER",
  DELIVERY: "SUPPLIER",
  INVOICE: "SUPPLIER",
  GO_LIVE: "SUPPLIER",
  SERVICE_ACTIVATED: "SUPPLIER",
  SERVICE_COMPLETED: "SUPPLIER",
  WARRANTY_COMPLETED: "SUPPLIER",
};

test("evidence: each of the 11 required event types can be attached only by the side the authority matrix names (spec 4.2)", async () => {
  const w = await world();
  for (const [eventType, side] of Object.entries(SPEC_AUTHORITY)) {
    // An open milestone of a signed contract that requires this type.
    const milestone = w
      .tbl("milestones")
      .find(
        (m) =>
          m.required_event_types.split(";").includes(eventType) &&
          w.contract(m.contract_id).lifecycle === "ACTIVE" &&
          !["REJECTED", "COMPLETED"].includes(
            w.evaluation(m.milestone_id).status,
          ),
      );
    assert.ok(milestone, `no open milestone requires ${eventType}`);
    const ref = w.ref(
      milestone.contract_id,
      Number(milestone.milestone_sequence),
    );
    const supplier = supplierOf(w, milestone.contract_id);
    const buyerOfficer = legalOf(w, milestone.contract_id);
    const [right, wrong] =
      side === "BUYER" ? [buyerOfficer, supplier] : [supplier, buyerOfficer];
    await denied(
      w,
      wrong,
      "evidence",
      "attachEvidenceFile",
      [{ ...ref, ...file({ eventType }) }],
      "NOT_YOUR_EVENT_TYPE",
    );
    // The buyer's contract-signed event is written by the signing flow itself (guide 09, 6.4).
    if (eventType === "CONTRACT_SIGNED") continue;
    const { id } = await ok(w, right, "evidence", "attachEvidenceFile", {
      ...ref,
      ...file({ eventType }),
    });
    const row = w.tbl("attachments").find((a) => a.id === id);
    assert.equal(row.side, side);
    assert.equal(row.eventType, eventType);
    assert.equal(row.milestoneId, milestone.milestone_id);
    assert.equal(
      row.organizationId,
      users.find((u) => u.id === right).organizationId,
    );
  }
});

test("evidence: other roles of the buyer (owner, finance, secondary approver) and the internal team record no events", async () => {
  const w = await world();
  const ref = w.ref("CT0103", 3);
  for (const user of [
    U.OWNER,
    U.FINANCE,
    U.SECONDARY,
    U.CONTROLLER,
    U.SYSADMIN,
    U.AUDITOR,
  ])
    for (const [action, input] of [
      ["attachEvidenceFile", { ...ref, ...file({ eventType: "ACCEPTANCE" }) }],
      ["removeEvidenceFile", { ...ref, attachmentId: "ATT-00001" }],
      ["submitEvidence", ref],
    ])
      await denied(w, user, "evidence", action, [input], "ACTION_FORBIDDEN");
});

test("evidence: only a required type or OTHER can be attached; approvals, disputes and unknown types are not evidence", async () => {
  const w = await world();
  const ref = w.ref("CT0104", 2); // requires SERVICE_COMPLETED and INVOICE
  for (const eventType of [
    "DELIVERY", // a supplier type, but not required by this milestone
    "APPROVAL",
    "REJECTION",
    "DISPUTE_OPENED",
    "DISPUTE_RESOLVED",
    "NOPE",
    "__proto__",
    "toString",
    "",
    undefined,
    7,
  ])
    await denied(
      w,
      U.SUPPLIER,
      "evidence",
      "attachEvidenceFile",
      [{ ...ref, ...file({ eventType }) }],
      "NOT_A_REQUIRED_EVENT",
    );
  // Supporting documents are accepted several times.
  await ok(w, U.SUPPLIER, "evidence", "attachEvidenceFile", {
    ...ref,
    ...file({ eventType: "OTHER" }),
  });
  await ok(w, U.SUPPLIER, "evidence", "attachEvidenceFile", {
    ...ref,
    ...file({ eventType: "OTHER", fileName: "phu-luc.pdf" }),
  });
  assert.equal(
    w.tbl("attachments").filter((a) => a.eventType === "OTHER").length,
    2,
  );
});

test("evidence: the same document type cannot be attached twice (duplicates are excluded, BR-03)", async () => {
  const w = await world();
  const ref = w.ref("CT0104", 2);
  await ok(w, U.SUPPLIER, "evidence", "attachEvidenceFile", {
    ...ref,
    ...file({ eventType: "INVOICE" }),
  });
  await denied(
    w,
    U.SUPPLIER,
    "evidence",
    "attachEvidenceFile",
    [{ ...ref, ...file({ eventType: "INVOICE", fileName: "khac.pdf" }) }],
    "EVIDENCE_ALREADY_ATTACHED",
  );
  assert.equal(w.tbl("attachments").length, 1);
});

test("evidence: the file must be named and at most 20 MB", async () => {
  const w = await world();
  const ref = w.ref("CT0104", 2);
  for (const bad of [
    { fileName: "" },
    { fileName: "   " },
    { fileName: { x: 1 } },
    { sizeMb: 20.5 },
    { sizeMb: -1 },
    { sizeMb: "big" },
    { sizeMb: NaN },
    { sizeMb: undefined },
  ])
    await denied(
      w,
      U.SUPPLIER,
      "evidence",
      "attachEvidenceFile",
      [{ ...ref, eventType: "INVOICE", ...file(), ...bad }],
      "INVALID_FILE",
    );
});

test("evidence: nothing is attached, submitted or removed once the milestone is paid, rejected or the contract is unsigned", async () => {
  const w = await world();
  // Paid (COMPLETED): CT0008 milestone 2 needs DELIVERY and INVOICE from S012.
  await pay(w, "CT0008", 2);
  const paidSupplier = supplierOf(w, "CT0008");
  const paid = w.ref("CT0008", 2);
  await denied(
    w,
    paidSupplier,
    "evidence",
    "attachEvidenceFile",
    [{ ...paid, ...file({ eventType: "INVOICE" }) }],
    "MILESTONE_CLOSED",
  );
  await denied(
    w,
    paidSupplier,
    "evidence",
    "submitEvidence",
    [paid],
    "MILESTONE_CLOSED",
  );
  // Rejected: CT0047 milestone 3 (S025 supplier, UAT_PASSED + INVOICE).
  const rejected = w.ref("CT0047", 3);
  await denied(
    w,
    supplierOf(w, "CT0047"),
    "evidence",
    "attachEvidenceFile",
    [{ ...rejected, ...file({ eventType: "INVOICE" }) }],
    "MILESTONE_CLOSED",
  );
  await denied(
    w,
    supplierOf(w, "CT0047"),
    "evidence",
    "submitEvidence",
    [rejected],
    "MILESTONE_CLOSED",
  );
  await denied(
    w,
    legalOf(w, "CT0047"),
    "evidence",
    "attachEvidenceFile",
    [{ ...rejected, ...file({ eventType: "UAT_PASSED" }) }],
    "MILESTONE_CLOSED",
  );
  // Unsigned (CT0102 is still being signed): the milestones exist but no event may be recorded.
  const unsigned = w.ref("CT0102", 3);
  await denied(
    w,
    U.SUPPLIER,
    "evidence",
    "attachEvidenceFile",
    [{ ...unsigned, ...file({ eventType: "INVOICE" }) }],
    "CONTRACT_NOT_SIGNED",
  );
  await denied(
    w,
    U.LEGAL,
    "evidence",
    "attachEvidenceFile",
    [{ ...unsigned, ...file({ eventType: "UAT_PASSED" }) }],
    "CONTRACT_NOT_SIGNED",
  );
  await denied(
    w,
    U.LEGAL,
    "evidence",
    "submitEvidence",
    [unsigned],
    "CONTRACT_NOT_SIGNED",
  );
  // A draft has no milestones at all.
  await denied(
    w,
    U.LEGAL,
    "evidence",
    "attachEvidenceFile",
    [
      {
        contractId: "CT0101",
        sequence: 1,
        ...file({ eventType: "CONTRACT_SIGNED" }),
      },
    ],
    "MILESTONE_NOT_FOUND",
  );
});

test("evidence: a held milestone still takes documents (spec 9.4: events reach every non-final state)", async () => {
  const w = await world();
  const held = w.ref("CT0019", 3); // open dispute, ACCEPTANCE is the required type
  assert.equal(
    w.evaluation(w.milestone("CT0019", 3).milestone_id).status,
    "ON_HOLD",
  );
  await ok(w, U.LEGAL, "evidence", "attachEvidenceFile", {
    ...held,
    ...file({ eventType: "ACCEPTANCE" }),
  });
});

test("evidence: ids, organisation, side and actor sent in the request are ignored; the session decides", async () => {
  const w = await world();
  const { id } = await ok(w, U.SUPPLIER, "evidence", "attachEvidenceFile", {
    ...w.ref("CT0104", 2),
    ...file({ eventType: "INVOICE" }),
    id: "ATT-HACKED",
    side: "BUYER",
    organizationId: "B001",
    addedBy: "Someone else",
    role: "LEGAL_REVIEWER",
    actorId: "u-legal",
    version: 99,
  });
  const row = w.tbl("attachments").find((a) => a.id === id);
  assert.notEqual(id, "ATT-HACKED");
  assert.equal(row.side, "SUPPLIER");
  assert.equal(row.organizationId, "S015");
  assert.equal(row.addedBy, w.actor(U.SUPPLIER).displayName);
  assert.equal(row.version, 1);
  // The recorded event names the contract's own supplier even if the request names another party.
  await ok(w, U.SUPPLIER, "evidence", "attachEvidenceFile", {
    ...w.ref("CT0104", 2),
    ...file({ eventType: "SERVICE_COMPLETED" }),
  });
  const result = await ok(w, U.SUPPLIER, "evidence", "submitEvidence", {
    ...w.ref("CT0104", 2),
    actorPartyId: "S001",
    eventType: "ACCEPTANCE",
    organizationId: "B001",
    status: "APPROVED",
  });
  const events = w
    .tbl("events")
    .filter((e) => result.eventIds.includes(e.event_id));
  assert.deepEqual(events.map((e) => e.event_type).sort(), [
    "INVOICE",
    "SERVICE_COMPLETED",
  ]);
  for (const event of events) {
    assert.equal(event.actor_party_id, "S015");
    assert.equal(event.origin, "APP");
    assert.equal(event.event_status, "CONFIRMED");
    assert.equal(event.recordedByUserId, U.SUPPLIER);
  }
});

test("evidence: a document can be removed only by its own side, once, and only before it is submitted", async () => {
  const w = await world();
  const ref = w.ref("CT0103", 3); // ACCEPTANCE (buyer) is missing
  const { id } = await ok(w, U.LEGAL, "evidence", "attachEvidenceFile", {
    ...ref,
    ...file({ eventType: "ACCEPTANCE" }),
  });
  // Another side, another organisation, an unknown id and an event id cannot remove it.
  await denied(
    w,
    U.SUPPLIER,
    "evidence",
    "removeEvidenceFile",
    [{ ...ref, attachmentId: id }],
    "EVIDENCE_NOT_FOUND",
  );
  await denied(
    w,
    U.LEGAL,
    "evidence",
    "removeEvidenceFile",
    [{ ...ref, attachmentId: "ATT-99999" }],
    "EVIDENCE_NOT_FOUND",
  );
  await denied(
    w,
    U.LEGAL,
    "evidence",
    "removeEvidenceFile",
    [
      {
        ...ref,
        attachmentId:
          w.events(w.milestone("CT0103", 3).milestone_id)[0]?.event_id ??
          "EV-none",
      },
    ],
    "EVIDENCE_NOT_FOUND",
  );
  await denied(
    w,
    userOf("B009", "LEGAL_REVIEWER"),
    "evidence",
    "removeEvidenceFile",
    [{ ...ref, attachmentId: id }],
    "CONTRACT_ACCESS_DENIED",
  );
  // The attachment on one milestone is not reachable through another milestone's reference.
  await denied(
    w,
    U.LEGAL,
    "evidence",
    "removeEvidenceFile",
    [{ ...w.ref("CT0103", 4), attachmentId: id }],
    "EVIDENCE_NOT_FOUND",
  );
  await ok(w, U.LEGAL, "evidence", "removeEvidenceFile", {
    ...ref,
    attachmentId: id,
  });
  assert.equal(w.tbl("attachments").length, 0);
  await denied(
    w,
    U.LEGAL,
    "evidence",
    "removeEvidenceFile",
    [{ ...ref, attachmentId: id }],
    "EVIDENCE_NOT_FOUND",
  );
});

test("evidence: once submitted, a document is an immutable event and can no longer be removed", async () => {
  const w = await world();
  const ref = w.ref("CT0103", 3);
  const { id } = await ok(w, U.LEGAL, "evidence", "attachEvidenceFile", {
    ...ref,
    ...file({ eventType: "ACCEPTANCE" }),
  });
  const result = await ok(w, U.LEGAL, "evidence", "submitEvidence", ref);
  const [eventId] = result.eventIds;
  const stored = structuredClone(
    w.tbl("events").find((e) => e.event_id === eventId),
  );
  assert.equal(stored.event_type, "ACCEPTANCE");
  assert.equal(stored.actor_party_id, "B010");
  for (const attachmentId of [id, eventId])
    await denied(
      w,
      U.LEGAL,
      "evidence",
      "removeEvidenceFile",
      [{ ...ref, attachmentId }],
      "EVIDENCE_NOT_FOUND",
    );
  assert.deepEqual(
    w.tbl("events").find((e) => e.event_id === eventId),
    stored,
  );
  // Submitting again has nothing left to submit and cannot duplicate the event.
  const count = w.tbl("events").length;
  await denied(
    w,
    U.LEGAL,
    "evidence",
    "submitEvidence",
    [ref],
    "NOTHING_TO_SUBMIT",
  );
  assert.equal(w.tbl("events").length, count);
});

test("evidence: submit needs every missing type of the actor's own side and records one event per type", async () => {
  const w = await world();
  const ref = w.ref("CT0104", 2); // SERVICE_COMPLETED and INVOICE are both missing
  const open = w.milestone("CT0104", 2).milestone_id;
  const events = w.events(open).length;
  await denied(
    w,
    U.SUPPLIER,
    "evidence",
    "submitEvidence",
    [ref],
    "EVIDENCE_INCOMPLETE",
  );
  await ok(w, U.SUPPLIER, "evidence", "attachEvidenceFile", {
    ...ref,
    ...file({ eventType: "SERVICE_COMPLETED" }),
  });
  await denied(
    w,
    U.SUPPLIER,
    "evidence",
    "submitEvidence",
    [ref],
    "EVIDENCE_INCOMPLETE",
  );
  // The other side has nothing to submit on this milestone.
  await denied(
    w,
    U.LEGAL,
    "evidence",
    "submitEvidence",
    [ref],
    "NOTHING_TO_SUBMIT",
  );
  await ok(w, U.SUPPLIER, "evidence", "attachEvidenceFile", {
    ...ref,
    ...file({ eventType: "INVOICE" }),
  });
  const result = await ok(w, U.SUPPLIER, "evidence", "submitEvidence", ref);
  assert.equal(result.eventIds.length, 2);
  assert.equal(w.events(open).length, events + 2);
  assert.equal(result.evaluation.reasonCode, "APPROVAL_QUORUM_NOT_MET");
  assert.equal(
    w.tbl("attachments").length,
    0,
    "submitted attachments are consumed",
  );
  const invoice = w
    .tbl("events")
    .find(
      (e) => result.eventIds.includes(e.event_id) && e.event_type === "INVOICE",
    );
  assert.equal(
    invoice.amount_vnd_mn,
    w.milestone("CT0104", 2).planned_payment_vnd_mn,
  );
  await denied(
    w,
    U.SUPPLIER,
    "evidence",
    "submitEvidence",
    [ref],
    "NOTHING_TO_SUBMIT",
  );
});

test("evidence: a type that is already valid is not recorded again, so a re-sent document cannot create a duplicate event", async () => {
  const w = await world();
  const ref = w.ref("CT0025", 2); // SERVICE_COMPLETED is valid, INVOICE is missing
  const milestone = w.milestone("CT0025", 2).milestone_id;
  const supplier = supplierOf(w, "CT0025");
  const before = w
    .events(milestone)
    .filter((e) => e.event_type === "SERVICE_COMPLETED").length;
  await ok(w, supplier, "evidence", "attachEvidenceFile", {
    ...ref,
    ...file({ eventType: "SERVICE_COMPLETED" }),
  });
  await ok(w, supplier, "evidence", "attachEvidenceFile", {
    ...ref,
    ...file({ eventType: "INVOICE" }),
  });
  const result = await ok(w, supplier, "evidence", "submitEvidence", ref);
  assert.equal(result.eventIds.length, 1);
  assert.equal(
    w.tbl("events").find((e) => e.event_id === result.eventIds[0]).event_type,
    "INVOICE",
  );
  assert.equal(
    w.events(milestone).filter((e) => e.event_type === "SERVICE_COMPLETED")
      .length,
    before,
  );
  assert.equal(w.tbl("attachments").length, 0);
});

test("evidence: a replacement for an unauthorised event does not lift the hold by itself (BR-07)", async () => {
  const w = await world();
  const ref = w.ref("CT0017", 3); // UAT_PASSED was recorded by the supplier: unauthorised
  const buyerOfficer = legalOf(w, "CT0017");
  await ok(w, buyerOfficer, "evidence", "attachEvidenceFile", {
    ...ref,
    ...file({ eventType: "UAT_PASSED" }),
  });
  const result = await ok(w, buyerOfficer, "evidence", "submitEvidence", ref);
  assert.equal(result.evaluation.decision, "HOLD");
  assert.equal(result.evaluation.reasonCode, "UNAUTHORIZED_EVENT");
  assert.equal(result.evaluation.payableMillion, "0.00");
});

/* ------------------------------ 4. approvals and rejections ------------------------------ */

/** Late penalty of spec BR-12/BR-13 with exact integer arithmetic: min(days x rate x P, cap x P), HALF_UP. */
function penaltyOracle({ planned, ratePct, capPct, daysLate }) {
  const ratio = (text) => {
    const [whole, fraction = ""] = String(text).split(".");
    return { n: BigInt(whole + fraction), d: 10n ** BigInt(fraction.length) };
  };
  const p = cents(planned);
  const rate = ratio(ratePct);
  const cap = ratio(capPct);
  // Both amounts as fractions of a cent: P x days x rate / 100 and P x cap / 100.
  const perDay = { n: p * BigInt(daysLate) * rate.n, d: rate.d * 100n };
  const ceiling = { n: p * cap.n, d: cap.d * 100n };
  const chosen =
    perDay.n * ceiling.d <= ceiling.n * perDay.d ? perDay : ceiling;
  const penalty = (2n * chosen.n + chosen.d) / (2n * chosen.d);
  return {
    penalty: money(penalty),
    payable: money(p > penalty ? p - penalty : 0n),
  };
}

test("approvals: only a role of the milestone's approval policy counts, once per person, never when no approval is needed", async () => {
  const w = await world();
  const ref = w.ref("CT0103", 2); // policy FINANCE_PLUS_OWNER: the owner approved, finance is missing
  const approve = { ...ref, choice: "APPROVE" };
  // The secondary approver is not in this policy; the owner has already voted.
  await denied(
    w,
    U.SECONDARY,
    "approvals",
    "castVote",
    [approve],
    "NOT_A_REQUIRED_APPROVER",
  );
  await denied(w, U.OWNER, "approvals", "castVote", [approve], "ALREADY_VOTED");
  // Claiming the missing role in the request does not give it to the secondary approver.
  await denied(
    w,
    U.SECONDARY,
    "approvals",
    "castVote",
    [
      {
        ...approve,
        role: "FINANCE_APPROVER",
        actorPartyId: "A029",
        partyId: "A029",
      },
    ],
    "NOT_A_REQUIRED_APPROVER",
  );
  // An approver of another buyer, a supplier and the buyer's legal officer cannot vote (spec 17).
  await denied(
    w,
    userOf("B009", "FINANCE_APPROVER"),
    "approvals",
    "castVote",
    [approve],
    "CONTRACT_ACCESS_DENIED",
  );
  await denied(
    w,
    U.LEGAL,
    "approvals",
    "castVote",
    [approve],
    "ACTION_FORBIDDEN",
  );
  await denied(
    w,
    U.SUPPLIER,
    "approvals",
    "castVote",
    [approve],
    "ACTION_FORBIDDEN",
  );
  // CT0013 milestone 3 needs no approval at all (AUTO_IF_ALL_CONDITIONS).
  for (const role of APPROVERS)
    await denied(
      w,
      userOf("B001", role),
      "approvals",
      "castVote",
      [{ ...w.ref("CT0013", 3), choice: "APPROVE" }],
      "APPROVAL_NOT_REQUIRED",
    );
});

test("approvals: choices are validated; rejecting and asking for information need a reason", async () => {
  const w = await world();
  const ref = w.ref("CT0103", 2);
  for (const choice of ["REJECT", "REQUEST_INFO"])
    for (const note of [undefined, "", "   "])
      await denied(
        w,
        U.FINANCE,
        "approvals",
        "castVote",
        [{ ...ref, choice, note }],
        "NOTE_REQUIRED",
      );
  for (const choice of ["FORCE_RELEASE", "approve", "", undefined, 1])
    await denied(
      w,
      U.FINANCE,
      "approvals",
      "castVote",
      [{ ...ref, choice, note: "x" }],
      "INVALID_VOTE",
    );
});

test("approvals: the last approval releases with the late penalty and does not move the completion date (BR-10, BR-11, [15] section 1)", async () => {
  const w = await world();
  const ms = w.milestone("CT0103", 2);
  const before = w.evaluation(ms.milestone_id);
  assert.equal(
    before.completedAt,
    "2026-10-16T15:10:00",
    "the invoice completes the evidence",
  );
  const result = await ok(w, U.FINANCE, "approvals", "castVote", {
    ...w.ref("CT0103", 2),
    choice: "APPROVE",
    // Values the client cannot choose.
    amount: "1.00",
    actorPartyId: "A028",
    status: "REJECTED",
  });
  const evaluation = result.evaluation;
  assert.equal(
    evaluation.completedAt,
    before.completedAt,
    "an approval after the evidence never becomes the completion date",
  );
  assert.equal(evaluation.validApprovalCount, 2);
  // Due 12 Oct + 2 days grace = 14 Oct; completed 16 Oct -> 2 days late.
  assert.equal(evaluation.daysLate, 2);
  assert.equal(evaluation.decision, "PENALTY");
  assert.equal(evaluation.reasonCode, "LATE_COMPLETION");
  const expected = penaltyOracle({
    planned: ms.planned_payment_vnd_mn,
    ratePct: ms.penalty_rate_pct_per_day,
    capPct: ms.max_penalty_pct,
    daysLate: 2,
  });
  assert.equal(evaluation.penaltyMillion, expected.penalty);
  assert.equal(evaluation.payableMillion, expected.payable);
  assert.equal(expected.penalty, "2.22");
  const [event] = w
    .tbl("events")
    .filter((e) => e.event_id === result.eventIds[0]);
  assert.equal(event.event_type, "APPROVAL");
  assert.equal(event.event_status, "APPROVED");
  assert.equal(
    event.actor_party_id,
    "A029",
    "the approver's own party, whatever the request says",
  );
  assert.equal(event.amount_vnd_mn, ms.planned_payment_vnd_mn);
  // Approved is not paid: nothing is transferred, and the same person cannot vote twice.
  assert.equal(w.tbl("payments").length, 0);
  await denied(
    w,
    U.FINANCE,
    "approvals",
    "castVote",
    [{ ...w.ref("CT0103", 2), choice: "APPROVE" }],
    "ALREADY_VOTED",
  );
  await denied(
    w,
    U.OWNER,
    "approvals",
    "castVote",
    [{ ...w.ref("CT0103", 2), choice: "APPROVE" }],
    "ALREADY_VOTED",
  );
});

test("approvals: a vote does not release anything while evidence is missing; quorum is counted by distinct roles (BR-10)", async () => {
  const w = await world();
  const ref = w.ref("CT0103", 3); // ACCEPTANCE missing, policy owner + finance
  const first = await ok(w, U.FINANCE, "approvals", "castVote", {
    ...ref,
    choice: "APPROVE",
  });
  assert.equal(first.evaluation.validApprovalCount, 1);
  assert.equal(first.evaluation.decision, "HOLD");
  assert.equal(first.evaluation.reasonCode, "MISSING_REQUIRED_EVENT");
  await denied(
    w,
    U.FINANCE,
    "approvals",
    "castVote",
    [{ ...ref, choice: "APPROVE" }],
    "ALREADY_VOTED",
  );
  const second = await ok(w, U.OWNER, "approvals", "castVote", {
    ...ref,
    choice: "APPROVE",
  });
  assert.equal(second.evaluation.validApprovalCount, 2);
  assert.equal(
    second.evaluation.decision,
    "HOLD",
    "both roles approved but the acceptance is still missing",
  );
  assert.equal(second.evaluation.payableMillion, "0.00");
  // The evidence arrives last: the milestone is then decided and the completion date is that evidence.
  await ok(w, U.LEGAL, "evidence", "attachEvidenceFile", {
    ...ref,
    ...file({ eventType: "ACCEPTANCE" }),
  });
  const done = await ok(w, U.LEGAL, "evidence", "submitEvidence", ref);
  assert.ok(["RELEASE", "PENALTY"].includes(done.evaluation.decision));
  const acceptance = w
    .tbl("events")
    .find((e) => e.event_id === done.eventIds[0]);
  assert.equal(done.evaluation.completedAt, acceptance.event_timestamp);
});

test("approvals: a request for information is a note only; it records no approval and changes no decision", async () => {
  const w = await world();
  const ref = w.ref("CT0103", 2);
  const ms = w.milestone("CT0103", 2).milestone_id;
  const evaluation = structuredClone(w.evaluation(ms));
  const events = w.tbl("events").length;
  const result = await ok(w, U.FINANCE, "approvals", "castVote", {
    ...ref,
    choice: "REQUEST_INFO",
    note: "Cần biên bản bổ sung",
  });
  assert.deepEqual(result, { noted: true });
  assert.equal(w.tbl("events").length, events);
  assert.deepEqual(w.evaluation(ms), evaluation);
  assert.equal(w.tbl("notes").length, 1);
  assert.equal(w.tbl("notes")[0].kind, "REQUEST_INFO");
});

test("rejection: a valid REJECTION makes the milestone REJECT; later approvals, votes, evidence, disputes and payment cannot undo it", async () => {
  const w = await world();
  const ref = w.ref("CT0103", 2);
  const ms = w.milestone("CT0103", 2).milestone_id;
  // The finance approver may reject; the vote is not limited to a milestone's approval roles (BR-09).
  const result = await ok(w, U.FINANCE, "approvals", "castVote", {
    ...ref,
    choice: "REJECT",
    note: "Hàng không đạt",
  });
  assert.equal(result.evaluation.decision, "REJECT");
  assert.equal(result.evaluation.reasonCode, "REJECTION_PRESENT");
  assert.equal(result.evaluation.status, "REJECTED");
  assert.equal(result.evaluation.payableMillion, "0.00");
  assert.equal(result.evaluation.penaltyMillion, "0.00");
  const event = w.tbl("events").find((e) => e.event_id === result.eventIds[0]);
  assert.equal(event.event_type, "REJECTION");
  assert.equal(event.event_status, "REJECTED");
  const frozen = structuredClone(w.evaluation(ms));
  // Nobody can approve, vote again, add evidence, dispute, resolve or pay the rejected milestone.
  for (const [user, choice] of [
    [U.OWNER, "APPROVE"],
    [U.FINANCE, "APPROVE"],
    [U.FINANCE, "REJECT"],
    [U.OWNER, "REJECT"],
    [U.SECONDARY, "APPROVE"],
    [U.OWNER, "REQUEST_INFO"],
  ])
    await denied(
      w,
      user,
      "approvals",
      "castVote",
      [{ ...ref, choice, note: "x" }],
      "MILESTONE_CLOSED",
    );
  await denied(
    w,
    U.SUPPLIER,
    "evidence",
    "attachEvidenceFile",
    [{ ...ref, ...file({ eventType: "INVOICE" }) }],
    "MILESTONE_CLOSED",
  );
  await denied(
    w,
    U.SUPPLIER,
    "evidence",
    "submitEvidence",
    [ref],
    "MILESTONE_CLOSED",
  );
  for (const user of [U.OWNER, U.LEGAL, U.SUPPLIER])
    await denied(
      w,
      user,
      "disputes",
      "openDispute",
      [{ ...ref, note: "x" }],
      "MILESTONE_CLOSED",
    );
  for (const user of [U.OWNER, U.LEGAL])
    await denied(
      w,
      user,
      "disputes",
      "resolveDispute",
      [{ ...ref, option: "RESOLVE", note: "x" }],
      "MILESTONE_CLOSED",
    );
  await denied(
    w,
    U.FINANCE,
    "payments",
    "transferToAccounting",
    [ref],
    "NOT_PAYABLE",
  );
  // A valid rejection is not an event the owner can propose to void (BR-19, T41).
  await denied(
    w,
    ownerOf(w, ref.contractId),
    "exceptions",
    "proposeException",
    [{ ...ref, eventId: event.event_id, reason: "Rút lại" }],
    "EVENT_NOT_VOIDABLE",
  );
  assert.deepEqual(w.evaluation(ms), frozen);
  assert.equal(w.tbl("payments").length, 0);
});

test("rejection: only the buyer's own approvers reject; a rejection under an open dispute waits behind it and wins once the dispute is closed (rule priority 10 before 20)", async () => {
  const w = await world();
  const ref = w.ref("CT0019", 3); // open dispute EV00204
  const ms = w.milestone("CT0019", 3).milestone_id;
  const reject = { ...ref, choice: "REJECT", note: "Không nghiệm thu" };
  await denied(
    w,
    U.LEGAL,
    "approvals",
    "castVote",
    [reject],
    "ACTION_FORBIDDEN",
  );
  await denied(
    w,
    U.SUPPLIER,
    "approvals",
    "castVote",
    [reject],
    "ACTION_FORBIDDEN",
  );
  await denied(
    w,
    userOf("B009", "CONTRACT_OWNER"),
    "approvals",
    "castVote",
    [reject],
    "CONTRACT_ACCESS_DENIED",
  );
  const held = await ok(w, U.OWNER, "approvals", "castVote", reject);
  assert.equal(held.evaluation.decision, "HOLD");
  assert.equal(held.evaluation.reasonCode, "OPEN_DISPUTE");
  assert.equal(held.evaluation.validRejectionCount, 1);
  assert.equal(held.evaluation.payableMillion, "0.00");
  await denied(w, U.OWNER, "approvals", "castVote", [reject], "ALREADY_VOTED");
  const resolved = await ok(w, U.OWNER, "disputes", "resolveDispute", {
    ...ref,
    option: "RESOLVE",
    note: "Đóng tranh chấp",
  });
  assert.equal(resolved.evaluation.decision, "REJECT");
  assert.equal(w.evaluation(ms).status, "REJECTED");
  await denied(
    w,
    U.SECONDARY,
    "approvals",
    "castVote",
    [{ ...ref, choice: "APPROVE" }],
    "MILESTONE_CLOSED",
  );
});

test("payment: after the transfer the milestone is closed to approvals, votes, evidence and disputes", async () => {
  const w = await world();
  const ref = w.ref("CT0103", 2);
  await ok(w, U.FINANCE, "approvals", "castVote", {
    ...ref,
    choice: "APPROVE",
  });
  await pay(w, "CT0103", 2);
  const ms = w.milestone("CT0103", 2).milestone_id;
  const frozen = structuredClone(w.evaluation(ms));
  for (const [user, choice] of [
    [U.OWNER, "APPROVE"],
    [U.FINANCE, "APPROVE"],
    [U.OWNER, "REJECT"],
    [U.FINANCE, "REJECT"],
    [U.SECONDARY, "REQUEST_INFO"],
  ])
    await denied(
      w,
      user,
      "approvals",
      "castVote",
      [{ ...ref, choice, note: "x" }],
      "MILESTONE_CLOSED",
    );
  await denied(
    w,
    U.SUPPLIER,
    "evidence",
    "attachEvidenceFile",
    [{ ...ref, ...file({ eventType: "INVOICE" }) }],
    "MILESTONE_CLOSED",
  );
  await denied(
    w,
    U.SUPPLIER,
    "evidence",
    "submitEvidence",
    [ref],
    "MILESTONE_CLOSED",
  );
  await denied(
    w,
    U.OWNER,
    "disputes",
    "openDispute",
    [{ ...ref, note: "x" }],
    "MILESTONE_CLOSED",
  );
  await denied(
    w,
    U.SUPPLIER,
    "disputes",
    "openDispute",
    [{ ...ref, note: "x" }],
    "MILESTONE_CLOSED",
  );
  await denied(
    w,
    U.OWNER,
    "disputes",
    "resolveDispute",
    [{ ...ref, option: "RESOLVE", note: "x" }],
    "MILESTONE_CLOSED",
  );
  assert.deepEqual(
    w.evaluation(ms),
    frozen,
    "the decision of a paid milestone never changes",
  );
});

/* ------------------------------ 5. disputes ------------------------------ */

test("dispute: each side that may open one does so for itself, with a reason, and the milestone is held (BR-08, spec 4.2 and 17)", async () => {
  // [opener, party recorded on the event]: the supplier itself, the buyer itself, or the owner approver.
  const openers = [
    [U.SUPPLIER, "S012"],
    [U.LEGAL, "B010"],
    [U.OWNER, "A028"],
  ];
  for (const [opener, party] of openers) {
    const w = await world();
    const ref = w.ref("CT0008", 1); // a RELEASE milestone of B010 / S012
    const user = opener === U.SUPPLIER ? supplierOf(w, "CT0008") : opener;
    const ms = w.milestone("CT0008", 1).milestone_id;
    assert.equal(w.evaluation(ms).decision, "RELEASE");
    for (const note of [undefined, "", "   ", 5])
      await denied(
        w,
        user,
        "disputes",
        "openDispute",
        [{ ...ref, note }],
        "NOTE_REQUIRED",
      );
    const result = await ok(w, user, "disputes", "openDispute", {
      ...ref,
      note: "Không đồng ý",
      // None of these may change who the dispute is attributed to.
      party: "B001",
      actorPartyId: "A001",
      organizationId: "B001",
      status: "RESOLVED",
    });
    const event = w
      .tbl("events")
      .find((e) => e.event_id === result.eventIds[0]);
    assert.equal(event.event_type, "DISPUTE_OPENED");
    assert.equal(event.event_status, "OPEN");
    assert.equal(event.actor_party_id, party);
    assert.equal(result.evaluation.decision, "HOLD");
    assert.equal(result.evaluation.reasonCode, "OPEN_DISPUTE");
    assert.equal(result.evaluation.status, "ON_HOLD");
    assert.equal(result.evaluation.payableMillion, "0.00");
    // The held milestone cannot be paid even though it was payable a moment ago.
    await denied(
      w,
      financeOf(w, "CT0008"),
      "payments",
      "transferToAccounting",
      [ref],
      "NOT_PAYABLE",
    );
  }
});

test("dispute: one open dispute holds the milestone; nobody opens a second one until it is closed (BR-08)", async () => {
  const w = await world();
  const ref = w.ref("CT0019", 3); // EV00204 is open
  const ms = w.milestone("CT0019", 3).milestone_id;
  const evaluation = structuredClone(w.evaluation(ms));
  for (const user of [U.SUPPLIER, U.LEGAL, U.OWNER])
    await denied(
      w,
      user,
      "disputes",
      "openDispute",
      [{ ...ref, note: "Thêm một tranh chấp" }],
      "DISPUTE_ALREADY_OPEN",
    );
  assert.deepEqual(w.evaluation(ms), evaluation);
  assert.deepEqual(w.evaluation(ms).openDisputeIds, ["EV00204"]);
  // The milestone's own opener cannot stack a second dispute either, new or after a request for information.
  await ok(w, U.OWNER, "disputes", "resolveDispute", {
    ...ref,
    option: "REQUEST_INFO",
    note: "Cần thêm hồ sơ",
  });
  await denied(
    w,
    U.SUPPLIER,
    "disputes",
    "openDispute",
    [{ ...ref, note: "Lại" }],
    "DISPUTE_ALREADY_OPEN",
  );
});

test("dispute: a dispute cannot be opened on a paid or rejected milestone or before the contract is signed", async () => {
  const w = await world();
  await pay(w, "CT0008", 2);
  const paid = w.ref("CT0008", 2);
  for (const user of [U.OWNER, U.LEGAL, supplierOf(w, "CT0008")])
    await denied(
      w,
      user,
      "disputes",
      "openDispute",
      [{ ...paid, note: "x" }],
      "MILESTONE_CLOSED",
    );
  const rejected = w.ref("CT0002", 3);
  for (const user of [
    userOf("B009", "CONTRACT_OWNER"),
    userOf("B009", "LEGAL_REVIEWER"),
    userOf("S011", "SUPPLIER"),
  ])
    await denied(
      w,
      user,
      "disputes",
      "openDispute",
      [{ ...rejected, note: "x" }],
      "MILESTONE_CLOSED",
    );
  for (const user of [U.OWNER, U.LEGAL, U.SUPPLIER])
    await denied(
      w,
      user,
      "disputes",
      "openDispute",
      [{ ...w.ref("CT0102", 2), note: "x" }],
      "CONTRACT_NOT_SIGNED",
    );
});

test("dispute: only the buyer side closes a dispute, with a reason, and the resolution points at the dispute it closes (BR-08, spec 9.5)", async () => {
  for (const [closer, party] of [
    [U.LEGAL, "B010"],
    [U.OWNER, "A028"],
  ]) {
    const w = await world();
    const ref = w.ref("CT0019", 3);
    const ms = w.milestone("CT0019", 3).milestone_id;
    // Not the supplier, not finance or the secondary approver, not the controllers, not another buyer.
    for (const user of [
      U.SUPPLIER,
      U.FINANCE,
      U.SECONDARY,
      U.CONTROLLER,
      U.SUPPLIER_CONTROLLER,
      U.SYSADMIN,
      U.AUDITOR,
    ])
      await denied(
        w,
        user,
        "disputes",
        "resolveDispute",
        [{ ...ref, option: "RESOLVE", note: "x" }],
        "ACTION_FORBIDDEN",
      );
    for (const role of ["CONTRACT_OWNER", "LEGAL_REVIEWER"])
      await denied(
        w,
        userOf("B009", role),
        "disputes",
        "resolveDispute",
        [{ ...ref, option: "RESOLVE", note: "x" }],
        "CONTRACT_ACCESS_DENIED",
      );
    for (const note of [undefined, "", "  "])
      await denied(
        w,
        closer,
        "disputes",
        "resolveDispute",
        [{ ...ref, option: "RESOLVE", note }],
        "NOTE_REQUIRED",
      );
    for (const option of ["APPROVE", "CLOSE", "", undefined])
      await denied(
        w,
        closer,
        "disputes",
        "resolveDispute",
        [{ ...ref, option, note: "x" }],
        "INVALID_RESOLUTION",
      );
    // A request for information records a note but does not close the dispute.
    const events = w.tbl("events").length;
    await ok(w, closer, "disputes", "resolveDispute", {
      ...ref,
      option: "REQUEST_INFO",
      note: "Bổ sung",
    });
    assert.equal(w.tbl("events").length, events);
    assert.deepEqual(w.evaluation(ms).openDisputeIds, ["EV00204"]);
    const result = await ok(w, closer, "disputes", "resolveDispute", {
      ...ref,
      option: "RESOLVE",
      note: "Đã thống nhất",
      reference: "EV00001",
      referenceEventId: "EV00001",
      actorPartyId: "S015",
    });
    assert.equal(result.eventIds.length, 1);
    const event = w
      .tbl("events")
      .find((e) => e.event_id === result.eventIds[0]);
    assert.equal(event.event_type, "DISPUTE_RESOLVED");
    assert.equal(event.event_status, "RESOLVED");
    assert.equal(
      event.reference_event_id,
      "EV00204",
      "it closes exactly the dispute it references",
    );
    assert.equal(event.actor_party_id, party);
    assert.ok(
      event.event_timestamp >=
        w.tbl("events").find((e) => e.event_id === "EV00204").event_timestamp,
    );
    assert.deepEqual(w.evaluation(ms).openDisputeIds, []);
    assert.notEqual(result.evaluation.reasonCode, "OPEN_DISPUTE");
    // Nothing is left to close.
    await denied(
      w,
      closer,
      "disputes",
      "resolveDispute",
      [{ ...ref, option: "RESOLVE", note: "Lại" }],
      "DISPUTE_NOT_OPEN",
    );
  }
});

test("dispute: resolving a milestone with no open dispute is refused for everyone who may resolve", async () => {
  const w = await world();
  for (const user of [U.OWNER, U.LEGAL])
    for (const ref of [
      w.ref("CT0019", 1),
      w.ref("CT0103", 2),
      w.ref("CT0103", 3),
    ])
      await denied(
        w,
        user,
        "disputes",
        "resolveDispute",
        [{ ...ref, option: "RESOLVE", note: "x" }],
        "DISPUTE_NOT_OPEN",
      );
  await denied(
    w,
    U.OWNER,
    "disputes",
    "resolveDispute",
    [{ ...w.ref("CT0102", 2), option: "RESOLVE", note: "x" }],
    "CONTRACT_NOT_SIGNED",
  );
});

test("dispute: every dispute is closed by its own resolution; a later dispute is a new one that needs its own resolution (T16, B07)", async () => {
  const w = await world();
  const ref = w.ref("CT0008", 1);
  const ms = w.milestone("CT0008", 1).milestone_id;
  const supplier = supplierOf(w, "CT0008");
  const first = await ok(w, supplier, "disputes", "openDispute", {
    ...ref,
    note: "Lần một",
  });
  const closedFirst = await ok(w, U.LEGAL, "disputes", "resolveDispute", {
    ...ref,
    option: "RESOLVE",
    note: "Xong lần một",
  });
  assert.equal(
    closedFirst.evaluation.decision,
    "RELEASE",
    "the closed dispute no longer holds the milestone",
  );
  const second = await ok(w, U.OWNER, "disputes", "openDispute", {
    ...ref,
    note: "Lần hai",
  });
  assert.equal(second.evaluation.reasonCode, "OPEN_DISPUTE");
  assert.deepEqual(
    w.evaluation(ms).openDisputeIds,
    [second.eventIds[0]],
    "the first, closed dispute stays closed",
  );
  await ok(w, U.LEGAL, "disputes", "resolveDispute", {
    ...ref,
    option: "RESOLVE",
    note: "Xong lần hai",
  });
  const resolutions = w
    .events(ms)
    .filter((e) => e.event_type === "DISPUTE_RESOLVED");
  assert.deepEqual(
    resolutions.map((e) => e.reference_event_id),
    [first.eventIds[0], second.eventIds[0]],
  );
  assert.equal(w.evaluation(ms).decision, "RELEASE");
});

test("dispute: all ten disputes of the Data Pack can be closed by their buyer's contract owner and then release the hold", async () => {
  const w = await world();
  const open = w
    .tbl("evaluations")
    .filter(
      (e) =>
        e.openDisputeIds.length &&
        w.tbl("milestones").find((m) => m.milestone_id === e.milestoneId)
          .origin === "DATA_PACK",
    );
  assert.equal(open.length, 10);
  for (const evaluation of open) {
    const ms = w
      .tbl("milestones")
      .find((m) => m.milestone_id === evaluation.milestoneId);
    const ref = w.ref(ms.contract_id, Number(ms.milestone_sequence));
    const result = await ok(
      w,
      ownerOf(w, ms.contract_id),
      "disputes",
      "resolveDispute",
      { ...ref, option: "RESOLVE", note: "Đã giải quyết" },
    );
    assert.deepEqual(
      w.evaluation(ms.milestone_id).openDisputeIds,
      [],
      ms.milestone_id,
    );
    assert.notEqual(
      result.evaluation.reasonCode,
      "OPEN_DISPUTE",
      ms.milestone_id,
    );
    const resolution = w
      .tbl("events")
      .find((e) => e.event_id === result.eventIds[0]);
    assert.equal(resolution.reference_event_id, evaluation.openDisputeIds[0]);
  }
});

/* ------------------------------ 6. payment transfer ------------------------------ */

test("payment: only the buyer's finance approver transfers, and only a milestone the engine decided RELEASE or PENALTY", async () => {
  const w = await world();
  const notPayable = [
    ["CT0019", 3, "OPEN_DISPUTE"],
    ["CT0103", 2, "APPROVAL_QUORUM_NOT_MET"],
    ["CT0103", 3, "MISSING_REQUIRED_EVENT"],
    ["CT0017", 3, "UNAUTHORIZED_EVENT"],
    ["CT0002", 3, "REJECTION_PRESENT"],
    ["CT0102", 1, "MISSING_REQUIRED_EVENT"], // the contract is still being signed
  ];
  for (const [contract, sequence, reason] of notPayable) {
    const evaluation = w.evaluation(
      w.milestone(contract, sequence).milestone_id,
    );
    assert.equal(evaluation.reasonCode, reason);
    assert.notEqual(
      evaluation.decision === "RELEASE" || evaluation.decision === "PENALTY",
      true,
    );
    await denied(
      w,
      financeOf(w, contract),
      "payments",
      "transferToAccounting",
      [w.ref(contract, sequence)],
      "NOT_PAYABLE",
    );
  }
  // Payable milestones: nobody else of the buyer, nor any other organisation, can transfer them.
  const ref = w.ref("CT0008", 1);
  for (const user of [
    U.OWNER,
    U.SECONDARY,
    U.LEGAL,
    U.SUPPLIER,
    supplierOf(w, "CT0008"),
    U.CONTROLLER,
    U.SYSADMIN,
    U.AUDITOR,
  ])
    await denied(
      w,
      user,
      "payments",
      "transferToAccounting",
      [ref],
      "ACTION_FORBIDDEN",
    );
  await denied(
    w,
    userOf("B009", "FINANCE_APPROVER"),
    "payments",
    "transferToAccounting",
    [ref],
    "CONTRACT_ACCESS_DENIED",
  );
  assert.equal(w.tbl("payments").length, 0);
});

test("payment: a milestone is paid once, for exactly the amount the engine decided, then it is closed (BR-13, 14.5)", async () => {
  const w = await world();
  const ref = w.ref("CT0008", 1);
  const ms = w.milestone("CT0008", 1);
  const decided = structuredClone(w.evaluation(ms.milestone_id));
  assert.equal(decided.decision, "RELEASE");
  const result = await ok(w, U.FINANCE, "payments", "transferToAccounting", {
    ...ref,
    // The client cannot pick the amount, decision or payment id.
    amountMillion: "1.00",
    amount: 1,
    decision: "PENALTY",
    paymentId: "PAY-FAKE",
    runId: "run-fake",
  });
  const [payment] = w.tbl("payments");
  assert.equal(result.paymentId, payment.id);
  assert.equal(
    payment.id,
    `PAY-${ms.milestone_id}-${decided.runId}`,
    "keyed by milestone and decision run",
  );
  assert.equal(payment.milestoneId, ms.milestone_id);
  assert.equal(payment.decision, "RELEASE");
  assert.equal(payment.amountMillion, decided.payableMillion);
  assert.equal(payment.amountMillion, ms.planned_payment_vnd_mn);
  assert.equal(payment.runId, decided.runId);
  assert.equal(payment.organizationId, "B010");
  const detail = await w.call(
    U.FINANCE,
    "contracts",
    "getMilestoneDetail",
    "CT0008",
    1,
  );
  assert.equal(detail.milestone.status, "COMPLETED");
  assert.equal(
    detail.evaluation.decision,
    "RELEASE",
    "paying does not rewrite the decision",
  );
  assert.equal(detail.actions.transfer, false);
  // Repeating it, by the same person or after the engine ran again, pays nothing more.
  await denied(
    w,
    U.FINANCE,
    "payments",
    "transferToAccounting",
    [ref],
    "ALREADY_TRANSFERRED",
  );
  await ok(w, U.FINANCE, "approvals", "castVote", {
    ...w.ref("CT0103", 2),
    choice: "APPROVE",
  }); // the engine runs again
  await denied(
    w,
    U.FINANCE,
    "payments",
    "transferToAccounting",
    [ref],
    "ALREADY_TRANSFERRED",
  );
  assert.equal(
    w.tbl("payments").filter((p) => p.milestoneId === ms.milestone_id).length,
    1,
  );
  assert.equal(w.evaluation(ms.milestone_id).decision, "RELEASE");
  const history = w
    .tbl("status-history")
    .filter((h) => h.milestoneId === ms.milestone_id);
  assert.equal(history.at(-1).to.status, "COMPLETED");
  assert.equal(history.at(-1).trigger.kind, "PAYMENT");
});

test("payment: a penalty milestone pays the amount after the deduction, once", async () => {
  const w = await world();
  const ms = w.milestone("CT0005", 3);
  const decided = w.evaluation(ms.milestone_id);
  assert.equal(decided.decision, "PENALTY");
  const expected = penaltyOracle({
    planned: ms.planned_payment_vnd_mn,
    ratePct: ms.penalty_rate_pct_per_day,
    capPct: ms.max_penalty_pct,
    daysLate: decided.daysLate,
  });
  await pay(w, "CT0005", 3);
  const [payment] = w.tbl("payments");
  assert.equal(payment.decision, "PENALTY");
  assert.equal(payment.amountMillion, expected.payable);
  assert.equal(payment.amountMillion, "891.90");
  assert.equal(
    cents(payment.amountMillion) + cents(expected.penalty),
    cents(ms.planned_payment_vnd_mn),
  );
  await denied(
    w,
    financeOf(w, "CT0005"),
    "payments",
    "transferToAccounting",
    [w.ref("CT0005", 3)],
    "ALREADY_TRANSFERRED",
  );
});

test("payment: a new dispute on an approved milestone stops the payment until it is closed", async () => {
  const w = await world();
  const ref = w.ref("CT0103", 2);
  const approved = await ok(w, U.FINANCE, "approvals", "castVote", {
    ...ref,
    choice: "APPROVE",
  });
  assert.equal(approved.evaluation.decision, "PENALTY");
  await ok(w, U.SUPPLIER, "disputes", "openDispute", {
    ...ref,
    note: "Phạt không đúng",
  });
  assert.equal(
    w.evaluation(w.milestone("CT0103", 2).milestone_id).status,
    "ON_HOLD",
  );
  await denied(
    w,
    U.FINANCE,
    "payments",
    "transferToAccounting",
    [ref],
    "NOT_PAYABLE",
  );
  await ok(w, U.LEGAL, "disputes", "resolveDispute", {
    ...ref,
    option: "RESOLVE",
    note: "Giữ nguyên phạt",
  });
  await pay(w, "CT0103", 2);
  assert.equal(w.tbl("payments").length, 1);
});

/* ------------------------------ 7. exceptions (BR-19) ------------------------------ */

// CT0017 is bought by B003 from S018: B003's owner proposes, B003's controller checks, S018's
// controller watches.
const controllerOf = (w, contractId) =>
  userOf(w.contract(contractId).buyer_id, "ADMIN_AUDITOR");
const supplierControllerOf = (w, contractId) =>
  userOf(w.contract(contractId).supplier_id, "ADMIN_AUDITOR");

const queueRow = async (w, contractId, sequence) =>
  (
    await w.call(ownerOf(w, contractId), "exceptions", "listExceptionQueue")
  ).find(
    (row) =>
      row.contract.id === contractId && row.milestone.sequence === sequence,
  );

test("BR-19: only the buyer's contract owner proposes; the event must be unauthorised or anomalous, never a valid event, a dispute, an approval or a rejection", async () => {
  const w = await world();
  const ref = w.ref("CT0017", 3);
  const owner = ownerOf(w, "CT0017");
  const row = await queueRow(w, "CT0017", 3);
  const [candidate] = row.candidates;
  assert.equal(candidate.id, "EV00177");
  const events = w.events(w.milestone("CT0017", 3).milestone_id);
  const valid = events.find((e) => e.event_type === "INVOICE");
  const approval = events.find((e) => e.event_type === "APPROVAL");
  const dispute = w.tbl("events").find((e) => e.event_id === "EV00204");
  const rejection = w.tbl("events").find((e) => e.event_type === "REJECTION");
  assert.ok(valid && approval && dispute && rejection);
  // Not the contract owner: the controllers of both parties only check.
  for (const user of [
    U.FINANCE,
    U.LEGAL,
    legalOf(w, "CT0017"),
    U.SUPPLIER,
    controllerOf(w, "CT0017"),
    supplierControllerOf(w, "CT0017"),
    U.SYSADMIN,
    U.AUDITOR,
  ])
    await denied(
      w,
      user,
      "exceptions",
      "proposeException",
      [{ ...ref, eventId: candidate.id, reason: "x" }],
      "ACTION_FORBIDDEN",
    );
  // The owner of another buyer cannot reach the contract.
  await denied(
    w,
    U.OWNER,
    "exceptions",
    "proposeException",
    [{ ...ref, eventId: candidate.id, reason: "x" }],
    "CONTRACT_ACCESS_DENIED",
  );
  // A reason is required.
  for (const reason of [undefined, "", "   "])
    await denied(
      w,
      owner,
      "exceptions",
      "proposeException",
      [{ ...ref, eventId: candidate.id, reason }],
      "NOTE_REQUIRED",
    );
  // Valid events, approvals, disputes, rejections, unknown events and events of other milestones are refused.
  const rejectionContract = rejection.contract_id;
  for (const [target, eventId, user] of [
    [ref, valid.event_id, owner],
    [ref, approval.event_id, owner],
    [ref, "EV-DOES-NOT-EXIST", owner],
    [ref, undefined, owner],
    [w.ref("CT0019", 3), dispute.event_id, ownerOf(w, "CT0019")],
    [
      w.ref(
        rejectionContract,
        Number(
          w
            .tbl("milestones")
            .find((m) => m.milestone_id === rejection.milestone_id)
            .milestone_sequence,
        ),
      ),
      rejection.event_id,
      ownerOf(w, rejectionContract),
    ],
    [w.ref("CT0017", 2), candidate.id, owner], // the unauthorised event belongs to milestone 3
  ])
    await denied(
      w,
      user,
      "exceptions",
      "proposeException",
      [{ ...target, eventId, reason: "Gỡ" }],
      "EVENT_NOT_VOIDABLE",
    );
  assert.equal(w.tbl("exceptions").length, 0);
});

test("BR-19: the buyer's own controller checks the owner's proposal; nobody else decides; nothing is decided twice (SoD-2)", async () => {
  const w = await world();
  const ref = w.ref("CT0017", 3);
  const owner = ownerOf(w, "CT0017");
  const controller = controllerOf(w, "CT0017");
  const { id } = await ok(w, owner, "exceptions", "proposeException", {
    ...ref,
    eventId: "EV00177",
    reason: "Nhập nhầm kênh",
    proposedBy: { userId: controller },
    status: "APPROVED",
  });
  const proposal = w.tbl("exceptions").find((x) => x.id === id);
  assert.equal(proposal.status, "PROPOSED");
  assert.equal(proposal.proposedBy.userId, owner);
  // The same event cannot be proposed again while a proposal is open.
  await denied(
    w,
    owner,
    "exceptions",
    "proposeException",
    [{ ...ref, eventId: "EV00177", reason: "Lại" }],
    "EVENT_NOT_VOIDABLE",
  );
  await denied(
    w,
    controller,
    "exceptions",
    "decideException",
    [{ exceptionId: "EXC-9999", approve: true }],
    "EXCEPTION_NOT_FOUND",
  );
  // The proposer and every non-controller role are refused outright.
  for (const user of [
    owner,
    U.OWNER,
    U.FINANCE,
    U.SUPPLIER,
    U.SYSADMIN,
    U.AUDITOR,
  ])
    await denied(
      w,
      user,
      "exceptions",
      "decideException",
      [{ exceptionId: id, approve: true }],
      "ACTION_FORBIDDEN",
    );
  // Another buyer's controller cannot reach it; the supplier's controller watches but does not decide.
  await denied(
    w,
    U.CONTROLLER,
    "exceptions",
    "decideException",
    [{ exceptionId: id, approve: true }],
    "CONTRACT_ACCESS_DENIED",
  );
  await denied(
    w,
    supplierControllerOf(w, "CT0017"),
    "exceptions",
    "decideException",
    [{ exceptionId: id, approve: true }],
    "BUYER_ONLY",
  );
  const events = structuredClone(w.tbl("events"));
  const decided = await ok(w, controller, "exceptions", "decideException", {
    exceptionId: id,
    approve: true,
    note: "Đồng ý",
    status: "REJECTED",
    decidedBy: { userId: owner },
  });
  assert.equal(decided.status, "APPROVED");
  assert.equal(
    w.tbl("exceptions").find((x) => x.id === id).decidedBy.userId,
    controller,
  );
  assert.ok(decided.evaluation.voided.includes("EV00177"));
  // The original event is never edited or deleted; the milestone is simply evaluated without it (BR-19).
  assert.deepEqual(w.tbl("events"), events);
  // Void does not create evidence: the missing UAT_PASSED still holds the milestone (T40b).
  assert.equal(decided.evaluation.decision, "HOLD");
  assert.equal(decided.evaluation.reasonCode, "MISSING_REQUIRED_EVENT");
  assert.deepEqual(decided.evaluation.unauthorized, []);
  assert.ok(decided.evaluation.missing.includes("UAT_PASSED"));
  assert.ok(!decided.evaluation.evidence.includes("EV00177"));
  // A decision is final.
  for (const approve of [true, false])
    await denied(
      w,
      controller,
      "exceptions",
      "decideException",
      [{ exceptionId: id, approve }],
      "EXCEPTION_ALREADY_DECIDED",
    );
  // The voided event can no longer be proposed.
  await denied(
    w,
    owner,
    "exceptions",
    "proposeException",
    [{ ...ref, eventId: "EV00177", reason: "Lại" }],
    "EVENT_NOT_VOIDABLE",
  );
});

test("BR-19: a rejected proposal leaves the event counted as unauthorised; the buyer's replacement plus a voided original releases the hold (T40)", async () => {
  const w = await world();
  const ref = w.ref("CT0017", 3);
  const ms = w.milestone("CT0017", 3).milestone_id;
  const owner = ownerOf(w, "CT0017");
  const controller = controllerOf(w, "CT0017");
  const first = await ok(w, owner, "exceptions", "proposeException", {
    ...ref,
    eventId: "EV00177",
    reason: "Thử",
  });
  const evaluation = structuredClone(w.evaluation(ms));
  const refused = await ok(w, controller, "exceptions", "decideException", {
    exceptionId: first.id,
    approve: false,
    note: "Không đủ căn cứ",
  });
  assert.equal(refused.status, "REJECTED");
  assert.deepEqual(
    w.evaluation(ms),
    evaluation,
    "a refusal re-evaluates nothing",
  );
  assert.deepEqual(w.evaluation(ms).unauthorized, ["EV00177"]);
  // After a refusal it may be proposed again; this time the buyer first sends the right document.
  const buyerOfficer = legalOf(w, "CT0017");
  await ok(w, buyerOfficer, "evidence", "attachEvidenceFile", {
    ...ref,
    ...file({ eventType: "UAT_PASSED" }),
  });
  await ok(w, buyerOfficer, "evidence", "submitEvidence", ref);
  assert.equal(
    w.evaluation(ms).reasonCode,
    "UNAUTHORIZED_EVENT",
    "the wrong event still blocks (BR-07)",
  );
  const second = await ok(w, owner, "exceptions", "proposeException", {
    ...ref,
    eventId: "EV00177",
    reason: "Đã có bản đúng",
  });
  const approved = await ok(w, controller, "exceptions", "decideException", {
    exceptionId: second.id,
    approve: true,
  });
  assert.equal(approved.status, "APPROVED");
  assert.ok(["RELEASE", "PENALTY"].includes(approved.evaluation.decision));
  assert.equal(approved.evaluation.reasonCode === "UNAUTHORIZED_EVENT", false);
});

/* ------------------------------ 8. signing ------------------------------ */

// CT0102 is being signed: 1 owner (signed), 2 supplier (current), 3 secondary approver (final, waiting).
const record = (w, code) =>
  w.tbl("signing").find((s) => s.contractCode === code);
const stepOf = (w, code, no) =>
  record(w, code).steps.find((s) => s.stepNo === no);
const requestsOf = (w, code, no) =>
  w
    .tbl("signing-requests")
    .filter((r) => r.contractCode === code && r.stepNo === no);
const send = (w, user, code, no, method = "VNPT_SMARTCA") =>
  ok(w, user, "signing", "sendSigningRequest", code, no, method);
const sign = async (w, user, code, no, method) => {
  await send(w, user, code, no, method);
  return ok(w, user, "signing", "confirmSigningRequest", code, no);
};

test("signing: only the assigned signer asks to sign, only when it is their turn, with an allowed method", async () => {
  const w = await world();
  const methods = ["USB_TOKEN", "VNPT_SMARTCA", "VIETTEL_MYSIGN"];
  assert.equal(stepOf(w, "CT0102", 1).status, "SIGNED");
  assert.equal(stepOf(w, "CT0102", 2).status, "CURRENT");
  assert.equal(stepOf(w, "CT0102", 3).status, "WAITING");
  // Not the assigned signer of step 2 (including the buyer's other roles and the owner who signed step 1).
  for (const user of [U.OWNER, U.FINANCE, U.LEGAL, U.SECONDARY])
    await denied(
      w,
      user,
      "signing",
      "sendSigningRequest",
      ["CT0102", 2, "USB_TOKEN"],
      "NOT_ASSIGNED_SIGNER",
    );
  await denied(
    w,
    U.SUPPLIER,
    "signing",
    "sendSigningRequest",
    ["CT0102", 3, "USB_TOKEN"],
    "NOT_ASSIGNED_SIGNER",
  );
  // Assigned, but not their turn: step 3 waits for step 2, step 1 is already signed.
  await denied(
    w,
    U.SECONDARY,
    "signing",
    "sendSigningRequest",
    ["CT0102", 3, "USB_TOKEN"],
    "NOT_YOUR_TURN",
  );
  await denied(
    w,
    U.OWNER,
    "signing",
    "sendSigningRequest",
    ["CT0102", 1, "USB_TOKEN"],
    "NOT_YOUR_TURN",
  );
  for (const step of [0, 4, 99, -1])
    await denied(
      w,
      U.SUPPLIER,
      "signing",
      "sendSigningRequest",
      ["CT0102", step, "USB_TOKEN"],
      "STEP_NOT_FOUND",
    );
  for (const method of ["PAPER", "", undefined, "usb_token", "__proto__"])
    await denied(
      w,
      U.SUPPLIER,
      "signing",
      "sendSigningRequest",
      ["CT0102", 2, method],
      "INVALID_METHOD",
    );
  // A scanned image is not a digital signature (guide: digital signature required).
  await denied(
    w,
    U.SUPPLIER,
    "signing",
    "sendSigningRequest",
    ["CT0102", 2, "IMAGE"],
    "IMAGE_NOT_ALLOWED",
  );
  assert.equal(requestsOf(w, "CT0102", 2).length, 0);
  for (const method of methods) {
    const request = await send(w, U.SUPPLIER, "CT0102", 2, method);
    assert.equal(request.status, "PENDING");
    assert.equal(request.method, method);
    assert.match(request.code, /^\d{4}$/);
    assert.ok(
      Date.parse(request.expiresAt) - Date.parse(request.sentAt) <=
        5 * 60 * 1000,
    );
  }
  // Sending again cancels the older request: exactly one stays pending.
  const all = requestsOf(w, "CT0102", 2);
  assert.deepEqual(
    all.map((r) => r.status),
    ["CANCELLED", "CANCELLED", "PENDING"],
  );
});

test("signing: a request is confirmed, rejected or cancelled only by its signer and only while pending; nothing happens twice", async () => {
  const w = await world();
  // No request yet.
  for (const action of [
    "confirmSigningRequest",
    "rejectSigningRequest",
    "cancelSigningRequest",
  ])
    await denied(
      w,
      U.SUPPLIER,
      "signing",
      action,
      ["CT0102", 2],
      "REQUEST_NOT_PENDING",
    );
  await send(w, U.SUPPLIER, "CT0102", 2);
  // Another person cannot act on somebody else's request, whatever their role.
  for (const user of [U.OWNER, U.FINANCE, U.LEGAL, U.SECONDARY])
    for (const action of [
      "confirmSigningRequest",
      "rejectSigningRequest",
      "cancelSigningRequest",
    ])
      await denied(
        w,
        user,
        "signing",
        action,
        ["CT0102", 2],
        "NOT_ASSIGNED_SIGNER",
      );
  // A refused request cannot be confirmed later; the turn stays with the signer who may ask again.
  await ok(w, U.SUPPLIER, "signing", "rejectSigningRequest", "CT0102", 2);
  assert.equal(requestsOf(w, "CT0102", 2).at(-1).status, "REJECTED");
  for (const action of [
    "confirmSigningRequest",
    "rejectSigningRequest",
    "cancelSigningRequest",
  ])
    await denied(
      w,
      U.SUPPLIER,
      "signing",
      action,
      ["CT0102", 2],
      "REQUEST_NOT_PENDING",
    );
  assert.equal(stepOf(w, "CT0102", 2).status, "CURRENT");
  // The same for a withdrawn request.
  await send(w, U.SUPPLIER, "CT0102", 2);
  await ok(w, U.SUPPLIER, "signing", "cancelSigningRequest", "CT0102", 2);
  for (const action of [
    "confirmSigningRequest",
    "rejectSigningRequest",
    "cancelSigningRequest",
  ])
    await denied(
      w,
      U.SUPPLIER,
      "signing",
      action,
      ["CT0102", 2],
      "REQUEST_NOT_PENDING",
    );
  assert.equal(stepOf(w, "CT0102", 2).signedAt, null);
  // Reading a request is allowed for its signer only, never for the controller; the integrity
  // checker does not read contracts at all.
  for (const user of [U.OWNER, U.CONTROLLER])
    await denied(
      w,
      user,
      "signing",
      "getSigningRequest",
      ["CT0102", 2],
      "NOT_ASSIGNED_SIGNER",
    );
  await denied(
    w,
    U.AUDITOR,
    "signing",
    "getSigningRequest",
    ["CT0102", 2],
    "ACTION_FORBIDDEN",
  );
});

test("signing: an expired request cannot be confirmed (5 minute lifetime) and a request is confirmed only once", async () => {
  const w = await world();
  await send(w, U.SUPPLIER, "CT0102", 2);
  await w.repo.mutate("signing-requests", (rows) => {
    rows.at(-1).expiresAt = new Date(Date.now() - 1000).toISOString();
  });
  await denied(
    w,
    U.SUPPLIER,
    "signing",
    "confirmSigningRequest",
    ["CT0102", 2],
    "REQUEST_EXPIRED",
  );
  assert.equal(stepOf(w, "CT0102", 2).status, "CURRENT");
  // A fresh request works, and confirming it twice signs once.
  await send(w, U.SUPPLIER, "CT0102", 2, "USB_TOKEN");
  const events = w.tbl("events").length;
  await ok(w, U.SUPPLIER, "signing", "confirmSigningRequest", "CT0102", 2);
  assert.equal(stepOf(w, "CT0102", 2).status, "SIGNED");
  assert.equal(stepOf(w, "CT0102", 2).method, "USB_TOKEN");
  assert.equal(stepOf(w, "CT0102", 3).status, "CURRENT");
  const signedAt = stepOf(w, "CT0102", 2).signedAt;
  await denied(
    w,
    U.SUPPLIER,
    "signing",
    "confirmSigningRequest",
    ["CT0102", 2],
    "REQUEST_NOT_PENDING",
  );
  await denied(
    w,
    U.SUPPLIER,
    "signing",
    "sendSigningRequest",
    ["CT0102", 2, "USB_TOKEN"],
    "NOT_YOUR_TURN",
  );
  assert.equal(stepOf(w, "CT0102", 2).signedAt, signedAt);
  assert.equal(
    w.tbl("events").length,
    events,
    "a signature before the last one records no business event",
  );
  assert.equal(w.contract("CT0102").lifecycle, "SIGNING");
});

test("signing: a signature is bound to the document digest; a changed document or contract terms are refused", async () => {
  const w = await world();
  await send(w, U.SUPPLIER, "CT0102", 2);
  const original = w.contract("CT0102").contract_value_vnd_mn;
  await w.repo.mutate("contracts", (rows) => {
    rows.find((c) => c.contract_id === "CT0102").contract_value_vnd_mn =
      "99999.00";
  });
  await denied(
    w,
    U.SUPPLIER,
    "signing",
    "confirmSigningRequest",
    ["CT0102", 2],
    "DOCUMENT_CHANGED",
  );
  assert.equal(stepOf(w, "CT0102", 2).status, "CURRENT");
  // Unchanged terms sign.
  await w.repo.mutate("contracts", (rows) => {
    rows.find((c) => c.contract_id === "CT0102").contract_value_vnd_mn =
      original;
  });
  await ok(w, U.SUPPLIER, "signing", "confirmSigningRequest", "CT0102", 2);
  assert.equal(stepOf(w, "CT0102", 2).status, "SIGNED");
  const proof = stepOf(w, "CT0102", 2).localProof.payload;
  assert.equal(proof.contractCode, "CT0102");
  assert.equal(proof.signerUserId, U.SUPPLIER);
  assert.equal(proof.stepNo, 2);
  assert.equal(proof.basis, "TERMS_SNAPSHOT");
  assert.match(proof.documentDigest, /^[a-f0-9]{64}$/);
});

test("signing: the last signature starts the contract with exactly one buyer CONTRACT_SIGNED event; the final step cannot use an image", async () => {
  const w = await world();
  const signingMilestone = w.milestone("CT0102", 1).milestone_id;
  assert.equal(w.events(signingMilestone).length, 0);
  await sign(w, U.SUPPLIER, "CT0102", 2, "VIETTEL_MYSIGN");
  assert.equal(w.contract("CT0102").lifecycle, "SIGNING");
  // The final signer needs a digital signature, not an image, and cannot sign out of turn.
  await denied(
    w,
    U.SECONDARY,
    "signing",
    "sendSigningRequest",
    ["CT0102", 3, "IMAGE"],
    "IMAGE_NOT_ALLOWED",
  );
  const done = await sign(w, U.SECONDARY, "CT0102", 3, "USB_TOKEN");
  assert.equal(done.status, "COMPLETED");
  const contract = w.contract("CT0102");
  assert.equal(contract.lifecycle, "ACTIVE");
  assert.ok(contract.signing_date);
  const signed = w
    .events(signingMilestone)
    .filter((e) => e.event_type === "CONTRACT_SIGNED");
  assert.equal(signed.length, 1);
  assert.equal(
    signed[0].actor_party_id,
    "B010",
    "the buyer is the party that signs (spec 4.2)",
  );
  assert.equal(signed[0].origin, "APP");
  assert.ok(
    w.evaluation(signingMilestone).evidence.includes(signed[0].event_id),
  );
  // Nothing more can be signed, requested or cancelled.
  const count = w.tbl("events").length;
  for (const [user, step] of [
    [U.OWNER, 1],
    [U.SUPPLIER, 2],
    [U.SECONDARY, 3],
  ]) {
    await denied(
      w,
      user,
      "signing",
      "sendSigningRequest",
      ["CT0102", step, "USB_TOKEN"],
      "NOT_YOUR_TURN",
    );
    await denied(
      w,
      user,
      "signing",
      "confirmSigningRequest",
      ["CT0102", step],
      "REQUEST_NOT_PENDING",
    );
  }
  for (const user of [U.OWNER, U.LEGAL])
    await denied(
      w,
      user,
      "signing",
      "cancelSigning",
      ["CT0102"],
      "SIGNING_ALREADY_STARTED",
    );
  assert.equal(w.tbl("events").length, count);
  // The contract now takes business events, which it refused while it was unsigned.
  await ok(w, U.LEGAL, "evidence", "attachEvidenceFile", {
    ...w.ref("CT0102", 2),
    ...file({ eventType: "REQUIREMENTS_APPROVED" }),
  });
  const verification = await w.call(
    U.OWNER,
    "signing",
    "getVerification",
    "CT0102",
  );
  assert.equal(verification.signatures.length, 3);
  assert.ok(verification.effectiveAt);
  for (const signature of verification.signatures.filter((s) => s.stepNo > 1)) {
    assert.equal(signature.status, "VALID");
    assert.equal(signature.contentIntact, true);
  }
});

test("signing: when no digital signature is required a non-final signer may use an image, the final signer still may not", async () => {
  const w = await world();
  await w.repo.mutate("signing", (rows) => {
    rows.find((s) => s.contractCode === "CT0102").digitalSignatureRequired =
      false;
  });
  await denied(
    w,
    U.SECONDARY,
    "signing",
    "sendSigningRequest",
    ["CT0102", 3, "IMAGE"],
    "NOT_YOUR_TURN",
  );
  const request = await send(w, U.SUPPLIER, "CT0102", 2, "IMAGE");
  assert.equal(request.method, "IMAGE");
  await ok(w, U.SUPPLIER, "signing", "confirmSigningRequest", "CT0102", 2);
  await denied(
    w,
    U.SECONDARY,
    "signing",
    "sendSigningRequest",
    ["CT0102", 3, "IMAGE"],
    "IMAGE_NOT_ALLOWED",
  );
});

test("signing: cancelling the whole sequence is a buyer editor's act, possible only before anyone has signed, and it reopens the draft", async () => {
  const w = await world();
  // Nothing to cancel on a draft, on a sequence someone already signed, or on a running contract.
  for (const code of ["CT0101", "CT0102", "CT0103"])
    await denied(
      w,
      U.LEGAL,
      "signing",
      "cancelSigning",
      [code],
      "SIGNING_ALREADY_STARTED",
    );
  await ok(w, U.LEGAL, "drafts", "confirmDigitization", "CT0101", {
    dueDate: "2027-05-31",
  });
  assert.equal(w.contract("CT0101").lifecycle, "SIGNING");
  assert.equal(stepOf(w, "CT0101", 1).status, "CURRENT");
  const created = w
    .tbl("milestones")
    .filter((m) => m.contract_id === "CT0101")
    .map((m) => m.milestone_id);
  assert.equal(created.length, 4);
  for (const user of [
    U.FINANCE,
    U.SECONDARY,
    U.SUPPLIER,
    U.CONTROLLER,
    U.SYSADMIN,
    U.AUDITOR,
  ])
    await denied(
      w,
      user,
      "signing",
      "cancelSigning",
      ["CT0101"],
      "ACTION_FORBIDDEN",
    );
  await denied(
    w,
    userOf("B009", "LEGAL_REVIEWER"),
    "signing",
    "cancelSigning",
    ["CT0101"],
    "CONTRACT_ACCESS_DENIED",
  );
  await send(w, U.OWNER, "CT0101", 1);
  await ok(w, U.OWNER, "signing", "cancelSigning", "CT0101");
  assert.equal(w.contract("CT0101").lifecycle, "DRAFT");
  assert.equal(
    w.tbl("milestones").filter((m) => m.contract_id === "CT0101").length,
    0,
  );
  assert.equal(requestsOf(w, "CT0101", 1).at(-1).status, "CANCELLED");
  assert.ok(record(w, "CT0101").steps.every((s) => s.status === "WAITING"));
  assert.equal(
    w.tbl("contract-drafts").find((d) => d.code === "CT0101").state,
    "DRAFT",
  );
  // The old request is dead and nobody can sign a cancelled sequence.
  await denied(
    w,
    U.OWNER,
    "signing",
    "confirmSigningRequest",
    ["CT0101", 1],
    "REQUEST_NOT_PENDING",
  );
  await denied(
    w,
    U.OWNER,
    "signing",
    "sendSigningRequest",
    ["CT0101", 1, "USB_TOKEN"],
    "NOT_YOUR_TURN",
  );
  await denied(
    w,
    U.LEGAL,
    "signing",
    "cancelSigning",
    ["CT0101"],
    "SIGNING_ALREADY_STARTED",
  );
  // It can be digitised again and, once somebody signs, it can no longer be cancelled.
  await ok(w, U.LEGAL, "drafts", "confirmDigitization", "CT0101", {
    dueDate: "2027-05-31",
  });
  await sign(w, U.OWNER, "CT0101", 1, "USB_TOKEN");
  await denied(
    w,
    U.LEGAL,
    "signing",
    "cancelSigning",
    ["CT0101"],
    "SIGNING_ALREADY_STARTED",
  );
  assert.equal(w.contract("CT0101").lifecycle, "SIGNING");
});

test("signing: signature positions are the buyer editors' to set, valid, and frozen once anyone has signed", async () => {
  const w = await world();
  const slots = await w.call(
    U.LEGAL,
    "signing",
    "getDefaultSignatureSlots",
    "CT0101",
  );
  assert.ok(Object.values(slots).every(Boolean));
  const version = record(w, "CT0101").version;
  for (const user of [
    U.FINANCE,
    U.SECONDARY,
    U.SUPPLIER,
    U.CONTROLLER,
    U.SYSADMIN,
    U.AUDITOR,
  ])
    await denied(
      w,
      user,
      "signing",
      "saveSignatureSlots",
      ["CT0101", slots],
      "ACTION_FORBIDDEN",
    );
  await denied(
    w,
    userOf("B009", "LEGAL_REVIEWER"),
    "signing",
    "saveSignatureSlots",
    ["CT0101", slots],
    "CONTRACT_ACCESS_DENIED",
  );
  // Malformed positions.
  for (const bad of [null, [], "x", 7])
    await denied(
      w,
      U.LEGAL,
      "signing",
      "saveSignatureSlots",
      ["CT0101", bad],
      "INVALID_INPUT",
    );
  for (const bad of [{ 3: slots[1] }, { x: slots[1] }])
    await denied(
      w,
      U.LEGAL,
      "signing",
      "saveSignatureSlots",
      ["CT0101", bad],
      "INVALID_SLOT",
    );
  for (const patch of [
    { look: "FANCY" },
    { look: undefined },
    { x: Number.NaN },
    { page: "1" },
    { w: null },
  ])
    await denied(
      w,
      U.LEGAL,
      "signing",
      "saveSignatureSlots",
      ["CT0101", { ...slots, 1: { ...slots[1], ...patch } }],
      "INVALID_SLOT",
    );
  // Geometry: outside the page, too small, on another signer's area, on a page that does not exist.
  for (const [patch, code] of [
    [{ x: -5 }, "SLOT_OUT_OF_BOUNDS"],
    [{ w: 10 }, "SLOT_OUT_OF_BOUNDS"],
    [{ page: 99 }, "SLOT_OUT_OF_BOUNDS"],
    [{ x: 5000 }, "SLOT_OUT_OF_BOUNDS"],
  ])
    await denied(
      w,
      U.LEGAL,
      "signing",
      "saveSignatureSlots",
      ["CT0101", { ...slots, 1: { ...slots[1], ...patch } }],
      code,
    );
  await denied(
    w,
    U.LEGAL,
    "signing",
    "saveSignatureSlots",
    ["CT0101", { ...slots, 2: { ...slots[1] } }],
    "SLOT_OVERLAP",
  );
  assert.equal(record(w, "CT0101").version, version);
  const saved = await ok(
    w,
    U.OWNER,
    "signing",
    "saveSignatureSlots",
    "CT0101",
    slots,
  );
  assert.deepEqual(saved, slots);
  assert.equal(record(w, "CT0101").version, version + 1);
  // Frozen after the first signature, and on a running contract.
  await denied(
    w,
    U.LEGAL,
    "signing",
    "saveSignatureSlots",
    [
      "CT0102",
      await w.call(U.LEGAL, "signing", "getDefaultSignatureSlots", "CT0102"),
    ],
    "SIGNING_ALREADY_STARTED",
  );
  await denied(
    w,
    U.LEGAL,
    "signing",
    "saveSignatureSlots",
    [
      "CT0103",
      await w.call(U.LEGAL, "signing", "getDefaultSignatureSlots", "CT0103"),
    ],
    "SIGNING_ALREADY_STARTED",
  );
});

/* ------------------------------ 9. drafts and digitisation ------------------------------ */

/** A complete, valid draft for a new contract of the demo buyer (B010) and supplier (S015). */
async function newDraft(w, patch = {}) {
  const fresh = await w.call(
    U.LEGAL,
    "drafts",
    "getContractDraft",
    undefined,
    true,
  );
  return {
    ...fresh,
    title: "Hợp đồng kiểm thử quy tắc",
    supplierId: "S015",
    type: "SERVICES",
    approvalPolicy: "FINANCE_PLUS_OWNER",
    reviewerId: U.LEGAL,
    graceDays: 4,
    penaltyRatePct: "0.20",
    maxPenaltyPct: "6.00",
    signers: [
      { party: "BUYER", userId: U.OWNER },
      { party: "SUPPLIER", userId: U.SUPPLIER },
    ],
    file: { name: "HopDong.pdf", sizeBytes: 1000, kind: "PDF", pages: 14 },
    ...patch,
  };
}

test("draft: a saved draft belongs to the session's organisation whatever organisation, owner, origin or state the request claims", async () => {
  const w = await world();
  const draft = await newDraft(w, {
    // Claims no client may make.
    buyer_id: "B001",
    organizationId: "B001",
    origin: "DATA_PACK",
    lifecycle: "ACTIVE",
    state: "ACTIVE",
    signing_date: "2020-01-01",
    initial_contract_status: "ACTIVE",
    createdBy: "u-admin",
    id: "hacked",
  });
  const saved = await ok(w, U.OWNER, "drafts", "saveContractDraft", draft);
  assert.equal(saved.code, draft.code);
  assert.equal(saved.state, "DRAFT");
  assert.equal(saved.origin, "APP");
  const contract = w.contract(draft.code);
  assert.equal(contract.buyer_id, "B010");
  assert.equal(contract.supplier_id, "S015");
  assert.equal(contract.lifecycle, "DRAFT");
  assert.equal(contract.origin, "APP");
  assert.equal(contract.signing_date, "");
  assert.equal(contract.initial_contract_status, "DRAFT");
  const row = w.tbl("contract-drafts").find((d) => d.code === draft.code);
  assert.equal(row.organizationId, "B010");
  assert.equal(row.origin, "APP");
  assert.equal(row.state, "DRAFT");
  assert.notEqual(row.id, "hacked");
  assert.equal(
    w.tbl("contracts").filter((c) => c.contract_id === draft.code).length,
    1,
  );
  // Terms are stored as exact decimals and the policy fixes the approval parameters.
  assert.equal(contract.penalty_rate_pct_per_day, "0.20");
  assert.equal(contract.max_penalty_pct, "6.00");
  assert.equal(contract.approval_quorum, "2");
  assert.equal(contract.auto_release_allowed, "FALSE");
  // The supplier does not see it before signing; another buyer cannot read or take it over.
  await denied(
    w,
    U.SUPPLIER,
    "contracts",
    "getContractOverview",
    [draft.code],
    "CONTRACT_ACCESS_DENIED",
  );
  await denied(
    w,
    userOf("B009", "LEGAL_REVIEWER"),
    "drafts",
    "getContractDraft",
    [draft.code],
    "DRAFT_NOT_FOUND",
  );
  await denied(
    w,
    userOf("B009", "LEGAL_REVIEWER"),
    "drafts",
    "saveContractDraft",
    [{ ...draft, title: "Chiếm quyền" }],
    "DRAFT_LOCKED",
  );
  // Saving again updates the same contract, not a second one.
  await ok(w, U.LEGAL, "drafts", "saveContractDraft", {
    ...draft,
    title: "Tiêu đề mới",
  });
  assert.equal(w.contract(draft.code).contract_title, "Tiêu đề mới");
  assert.equal(
    w.tbl("contracts").filter((c) => c.contract_id === draft.code).length,
    1,
  );
});

test("draft: an existing contract of the Data Pack, of another buyer, running or being signed can never be overwritten through a draft", async () => {
  const w = await world();
  const draft = await newDraft(w);
  for (const code of ["CT0001", "CT0019", "CT0103", "CT0102"]) {
    const before = structuredClone(w.contract(code));
    await denied(
      w,
      U.LEGAL,
      "drafts",
      "saveContractDraft",
      [{ ...draft, code }],
      "DRAFT_LOCKED",
    );
    assert.deepEqual(w.contract(code), before);
  }
  await denied(
    w,
    U.LEGAL,
    "drafts",
    "saveContractDraft",
    [{ ...draft, code: "CT9999" }],
    "INVALID_CODE",
  );
  await denied(
    w,
    U.LEGAL,
    "drafts",
    "saveContractDraft",
    [{ ...draft, code: undefined }],
    "INVALID_CODE",
  );
});

test("draft: terms are validated exactly (no floats for money, bounded penalty, real dates) and people must belong to the right side", async () => {
  const w = await world();
  const draft = await newDraft(w);
  const bad = [
    [{ title: "" }, "TITLE_REQUIRED"],
    [{ title: "   " }, "TITLE_REQUIRED"],
    [{ title: "x".repeat(251) }, "INVALID_TITLE"],
    [{ valueMillion: 1000 }, "INVALID_VALUE"], // a number, not an exact decimal string
    [{ valueMillion: "0" }, "INVALID_VALUE"],
    [{ valueMillion: "0.00" }, "INVALID_VALUE"],
    [{ valueMillion: "-5.00" }, "INVALID_VALUE"],
    [{ valueMillion: "1000.456" }, "INVALID_VALUE"],
    [{ valueMillion: "1e3" }, "INVALID_VALUE"],
    [{ valueMillion: "1000001" }, "INVALID_VALUE"],
    [{ startDate: "2026-13-40" }, "INVALID_DATES"],
    [{ startDate: "not a date" }, "INVALID_DATES"],
    [{ endDate: "2026-01-01" }, "INVALID_DATES"],
    [{ graceDays: -1 }, "INVALID_PENALTY"],
    [{ graceDays: 61 }, "INVALID_PENALTY"],
    [{ graceDays: 2.5 }, "INVALID_PENALTY"],
    [{ graceDays: "5" }, "INVALID_PENALTY"],
    [{ penaltyRatePct: "5.01" }, "INVALID_PENALTY"],
    [{ penaltyRatePct: "-0.10" }, "INVALID_PENALTY"],
    [{ penaltyRatePct: 0.1 }, "INVALID_PENALTY"],
    [{ maxPenaltyPct: "100.01" }, "INVALID_PENALTY"],
    [{ maxPenaltyPct: "8.001" }, "INVALID_PENALTY"],
    [{ type: "LEASE" }, "INVALID_TYPE"],
    [{ approvalPolicy: "NO_APPROVAL" }, "INVALID_POLICY"],
    [{ supplierId: "B010" }, "INVALID_SUPPLIER"], // a buyer is not a supplier
    [{ supplierId: "A028" }, "INVALID_SUPPLIER"],
    [{ supplierId: "S999" }, "INVALID_SUPPLIER"],
    [{ supplierId: "" }, "INVALID_SUPPLIER"],
    [{ signers: [] }, "SIGNER_COUNT"],
    [
      {
        signers: [1, 2, 3, 4, 5].map(() => ({
          party: "BUYER",
          userId: U.OWNER,
        })),
      },
      "SIGNER_COUNT",
    ],
    [
      {
        signers: [
          { party: "BUYER", userId: U.OWNER },
          { party: "BUYER", userId: U.FINANCE },
        ],
      },
      "SIGNERS_BOTH_SIDES",
    ],
    [
      {
        signers: [
          { party: "BUYER", userId: U.OWNER },
          { party: "BUYER", userId: U.OWNER },
        ],
      },
      "INVALID_SIGNER",
    ],
    [
      {
        signers: [
          { party: "BUYER", userId: userOf("B009", "CONTRACT_OWNER") },
          { party: "SUPPLIER", userId: U.SUPPLIER },
        ],
      },
      "INVALID_SIGNER",
    ],
    [
      {
        signers: [
          { party: "BUYER", userId: U.OWNER },
          { party: "SUPPLIER", userId: userOf("S024", "SUPPLIER") },
        ],
      },
      "INVALID_SIGNER",
    ],
    [
      {
        signers: [
          { party: "BUYER", userId: U.CONTROLLER },
          { party: "SUPPLIER", userId: U.SUPPLIER },
        ],
      },
      "INVALID_SIGNER",
    ],
    [
      {
        signers: [
          { party: "BUYER", userId: U.SUPPLIER },
          { party: "SUPPLIER", userId: U.SUPPLIER },
        ],
      },
      "INVALID_SIGNER",
    ],
    [
      {
        signers: [
          { party: "BUYER", userId: "u-nobody" },
          { party: "SUPPLIER", userId: U.SUPPLIER },
        ],
      },
      "INVALID_SIGNER",
    ],
    [
      {
        signers: [
          { party: "AUDITOR", userId: U.OWNER },
          { party: "SUPPLIER", userId: U.SUPPLIER },
        ],
      },
      "INVALID_SIGNER",
    ],
    [{ reviewerId: U.OWNER }, "INVALID_REVIEWER"],
    [{ reviewerId: userOf("B009", "LEGAL_REVIEWER") }, "INVALID_REVIEWER"],
    [{ reviewerId: "u-nobody" }, "INVALID_REVIEWER"],
    [{ file: undefined }, "FILE_REQUIRED"],
    [{ file: { name: "", sizeBytes: 1, kind: "PDF" } }, "FILE_REQUIRED"],
    [
      { file: { name: "virus.exe", sizeBytes: 1, kind: "EXE" } },
      "FILE_REQUIRED",
    ],
  ];
  for (const [patch, code] of bad) {
    await denied(
      w,
      U.LEGAL,
      "drafts",
      "saveContractDraft",
      [{ ...draft, ...patch }],
      code,
    );
    assert.ok(!w.contract(draft.code), "a rejected draft creates no contract");
  }
  // The boundaries themselves are valid.
  const edge = await ok(w, U.LEGAL, "drafts", "saveContractDraft", {
    ...draft,
    valueMillion: "0.01",
    graceDays: 60,
    penaltyRatePct: "5.00",
    maxPenaltyPct: "100.00",
  });
  assert.equal(edge.valueMillion, "0.01");
});

test("digitisation: a buyer editor locks the terms once; milestones add up to the contract value, start unpaid and are decided by the engine", async () => {
  const w = await world();
  const contract = w.contract("CT0101");
  assert.equal(contract.contract_value_vnd_mn, "2400.00");
  // Wrong people and wrong contracts.
  for (const user of [
    U.FINANCE,
    U.SECONDARY,
    U.SUPPLIER,
    U.CONTROLLER,
    U.SYSADMIN,
    U.AUDITOR,
  ])
    await denied(
      w,
      user,
      "drafts",
      "confirmDigitization",
      ["CT0101", { dueDate: "2027-05-31" }],
      "ACTION_FORBIDDEN",
    );
  for (const code of ["CT0102", "CT0103", "CT0104"])
    await denied(
      w,
      U.LEGAL,
      "drafts",
      "confirmDigitization",
      [code, { dueDate: "2027-05-31" }],
      "DRAFT_LOCKED",
    );
  await denied(
    w,
    U.LEGAL,
    "drafts",
    "confirmDigitization",
    ["CT0001", { dueDate: "2027-05-31" }],
    "CONTRACT_ACCESS_DENIED",
  );
  // A due date must be a real date.
  for (const dueDate of [
    "2027-02-30",
    "tomorrow",
    "31/12/2027",
    20271231,
    { a: 1 },
  ])
    await denied(
      w,
      U.LEGAL,
      "drafts",
      "confirmDigitization",
      ["CT0101", { dueDate }],
      "INVALID_DATES",
    );
  assert.equal(
    w.tbl("milestones").filter((m) => m.contract_id === "CT0101").length,
    0,
  );
  // The client cannot supply milestones, amounts or another organisation; the workflow decides them.
  await ok(w, U.OWNER, "drafts", "confirmDigitization", "CT0101", {
    dueDate: "2027-05-31",
    organizationId: "B001",
    contractId: "CT0001",
    milestones: [{ sequence: 1, valueMillion: "1.00", type: "SIGNING" }],
    valueMillion: "1.00",
  });
  const milestones = w
    .tbl("milestones")
    .filter((m) => m.contract_id === "CT0101");
  assert.deepEqual(
    milestones.map((m) => m.milestone_type),
    ["SIGNING", "DELIVERY", "ACCEPTANCE", "WARRANTY"],
  );
  assert.equal(
    milestones.reduce((sum, m) => sum + cents(m.planned_payment_vnd_mn), 0n),
    cents(contract.contract_value_vnd_mn),
    "the milestones add up to the contract value exactly",
  );
  assert.equal(
    milestones.reduce((sum, m) => sum + cents(m.payment_percent), 0n),
    10000n,
  );
  assert.equal(w.contract("CT0101").lifecycle, "SIGNING");
  for (const m of milestones) {
    const evaluation = w.evaluation(m.milestone_id);
    assert.ok(evaluation, `${m.milestone_id} is evaluated`);
    assert.equal(
      evaluation.decision,
      "HOLD",
      "no evidence yet: nothing is payable (BR-14)",
    );
    assert.equal(evaluation.payableMillion, "0.00");
    assert.equal(w.events(m.milestone_id).length, 0);
    assert.equal(m.grace_period_days, contract.grace_period_days);
  }
  assert.equal(
    milestones.find((m) => m.milestone_type === "WARRANTY").due_date,
    "2027-05-31",
  );
  // Locked: no second confirmation, no edits, and no payment of an unsigned contract's milestones.
  await denied(
    w,
    U.LEGAL,
    "drafts",
    "confirmDigitization",
    ["CT0101", { dueDate: "2027-05-31" }],
    "DRAFT_LOCKED",
  );
  const draft = await w.call(U.LEGAL, "drafts", "getContractDraft", "CT0101");
  await denied(
    w,
    U.LEGAL,
    "drafts",
    "saveContractDraft",
    [{ ...draft, title: "Sửa sau khoá" }],
    "DRAFT_LOCKED",
  );
  await denied(
    w,
    financeOf(w, "CT0101"),
    "payments",
    "transferToAccounting",
    [w.ref("CT0101", 1)],
    "NOT_PAYABLE",
  );
});

test("digitisation: a due date is a date in the form YYYY-MM-DD, nothing more (spec 5.4)", async () => {
  const w = await world();
  for (const dueDate of [
    "2027-05-31T25:99:99junk",
    "2027-05-31 DROP TABLE",
    "2027-05-31x",
  ])
    await denied(
      w,
      U.LEGAL,
      "drafts",
      "confirmDigitization",
      ["CT0101", { dueDate }],
      "INVALID_DATES",
    );
});

test("digitisation: an unreadable due date is kept as a structural gap and holds that milestone under rule 80 (BR-15)", async () => {
  const w = await world();
  await ok(w, U.LEGAL, "drafts", "confirmDigitization", "CT0101", {
    dueDate: null,
  });
  const warranty = w
    .tbl("milestones")
    .find((m) => m.contract_id === "CT0101" && m.milestone_type === "WARRANTY");
  assert.equal(warranty.due_date, "");
  const evaluation = w.evaluation(warranty.milestone_id);
  assert.equal(evaluation.decision, "HOLD");
  assert.equal(evaluation.reasonCode, "UNRESOLVED_CONDITION");
  assert.equal(evaluation.payableMillion, "0.00");
});

test("digitisation: a draft made in the app needs its uploaded document before it can be locked", async () => {
  const w = await world();
  const draft = await newDraft(w);
  await ok(w, U.LEGAL, "drafts", "saveContractDraft", draft);
  await denied(
    w,
    U.LEGAL,
    "drafts",
    "confirmDigitization",
    [draft.code, { dueDate: "2027-12-31" }],
    "DOCUMENT_REQUIRED",
  );
  assert.equal(w.contract(draft.code).lifecycle, "DRAFT");
  assert.equal(
    w.tbl("milestones").filter((m) => m.contract_id === draft.code).length,
    0,
  );
});

/* ------------------------------ 10. sweeps over every milestone ------------------------------ */

// The handlers run on a throw-away copy of the tables inside `domain.read`; anything a probe adds is
// cut off again, so every probe sees the same state and nothing is stored.
const PROBED_TABLES = [
  "events",
  "attachments",
  "payments",
  "status-history",
  "exceptions",
  "notes",
];
function probe(ctx, fn) {
  const sizes = PROBED_TABLES.map((name) => ctx.t[name].length);
  try {
    fn();
    return "OK";
  } catch (error) {
    return messageOf(error);
  } finally {
    PROBED_TABLES.forEach((name, i) => (ctx.t[name].length = sizes[i]));
  }
}

/** Every user who is a party to some contract: the four roles of each buyer and each supplier. */
const partyUsers = () =>
  users.filter((u) =>
    [
      "CONTRACT_OWNER",
      "FINANCE_APPROVER",
      "SECONDARY_APPROVER",
      "LEGAL_REVIEWER",
      "SUPPLIER",
    ].includes(u.role),
  );

/**
 * A database in which every state of the workflow exists at once: paid milestones, an approved milestone
 * under a new dispute, a rejection waiting behind an open dispute, submitted evidence and an open exception.
 * It is built once and shared, so only tests that merely read it (sweeps, probes that are rolled back) use it.
 */
let busy;
const busyWorld = () => (busy ??= buildBusyWorld());
async function buildBusyWorld() {
  const w = await world();
  for (const [contract, sequence] of [
    ["CT0008", 1],
    ["CT0008", 2],
    ["CT0005", 3],
    ["CT0019", 1],
  ])
    await pay(w, contract, sequence);
  await ok(w, U.OWNER, "approvals", "castVote", {
    ...w.ref("CT0019", 3),
    choice: "REJECT",
    note: "Chờ tranh chấp",
  });
  await ok(w, U.FINANCE, "approvals", "castVote", {
    ...w.ref("CT0103", 2),
    choice: "APPROVE",
  });
  await ok(w, U.SUPPLIER, "disputes", "openDispute", {
    ...w.ref("CT0103", 2),
    note: "Phạt không đúng",
  });
  await ok(w, U.SUPPLIER, "evidence", "attachEvidenceFile", {
    ...w.ref("CT0104", 2),
    ...file({ eventType: "SERVICE_COMPLETED" }),
  });
  await ok(w, ownerOf(w, "CT0017"), "exceptions", "proposeException", {
    ...w.ref("CT0017", 3),
    eventId: "EV00177",
    reason: "Nhập nhầm",
  });
  await ok(w, U.FINANCE, "approvals", "castVote", {
    ...w.ref("CT0103", 3),
    choice: "REJECT",
    note: "Thiếu hồ sơ",
  });
  return w;
}

/** Visits every (user, milestone) pair the user can see. */
async function sweep(w, visit, { only = () => true } = {}) {
  const views = await imports.load("domain/views/index.js");
  const actions = await imports.load("domain/actions/index.js");
  for (const user of partyUsers().filter(only))
    await w.domain.read(w.actor(user.id), (ctx) => {
      for (const contract of ctx.visibleContracts())
        for (const m of ctx.milestonesOf(contract.contract_id)) {
          if (!ctx.hasEvaluation(m.milestone_id)) continue;
          visit({
            ctx,
            user,
            contract,
            m,
            views,
            actions,
            ref: w.ref(contract.contract_id, Number(m.milestone_sequence)),
            label: `${user.id} ${contract.contract_id}#${m.milestone_sequence}`,
          });
        }
    });
}

// One pass over the busy database serves both flag tests below.
let flagPass;
function flagMismatches() {
  flagPass ??= (async () => {
    const w = await busyWorld();
    const mismatches = [];
    let pairs = 0;
    await sweep(w, ({ ctx, m, views, actions, ref, label }) => {
      pairs += 1;
      const offered = views.milestoneDetail(
        ctx,
        ref.contractId,
        ref.sequence,
      ).actions;
      const rejectedBefore = ctx
        .eventsOf(m.milestone_id)
        .some(
          (e) =>
            e.event_type === "REJECTION" &&
            e.actor_party_id === ctx.actor.partyId,
        );
      const accepts = {
        openDispute:
          probe(ctx, () => actions.openDispute(ctx, { ...ref, note: "" })) ===
          "NOTE_REQUIRED",
        resolveDispute:
          probe(ctx, () =>
            actions.resolveDispute(ctx, { ...ref, option: "?", note: "x" }),
          ) === "INVALID_RESOLUTION",
        approve:
          probe(ctx, () =>
            actions.castVote(ctx, { ...ref, choice: "APPROVE" }),
          ) === "OK",
        // A rejection goes through every guard except "has this person already rejected".
        reject:
          probe(ctx, () =>
            actions.castVote(ctx, { ...ref, choice: "?", note: "x" }),
          ) === "INVALID_VOTE" && !rejectedBefore,
        transfer:
          probe(ctx, () => actions.transferToAccounting(ctx, ref)) === "OK",
      };
      // Documents: a missing type of the actor's own side that is not attached yet must be attachable.
      const attached = new Set(
        ctx.t.attachments
          .filter(
            (a) => a.milestoneId === m.milestone_id && a.side === ctx.side(),
          )
          .map((a) => a.eventType),
      );
      const missingMine = ctx
        .evaluation(m.milestone_id)
        .missing.filter((type) => ctx.mayRecord(type));
      const fresh = missingMine.filter((type) => !attached.has(type));
      accepts.submit = fresh.length
        ? probe(ctx, () =>
            actions.attachEvidence(ctx, {
              ...ref,
              eventType: fresh[0],
              fileName: "x.pdf",
              sizeMb: 1,
            }),
          ) === "OK"
        : missingMine.length > 0 && offered.submit;
      for (const [action, accepted] of Object.entries(accepts))
        if (offered[action] !== accepted)
          mismatches.push({
            action,
            text: `${label}: screen offers ${action}=${offered[action]} but the API ${accepted ? "accepts" : "refuses"} it`,
          });
    });
    return { mismatches, pairs };
  })();
  return flagPass;
}

test("sweep: for every milestone and every party, what the screens offer equals what the API accepts (the incident of a second open dispute)", async () => {
  const { mismatches, pairs } = await flagMismatches();
  assert.ok(pairs > 1500, `the sweep visited ${pairs} milestone/party pairs`);
  const found = mismatches
    .filter((x) => x.action !== "reject")
    .map((x) => x.text);
  assert.deepEqual(found.slice(0, 20), [], `${found.length} mismatches`);
});

test("sweep: the milestone screen offers 'reject' only to an approver who has not rejected it already", async () => {
  const { mismatches } = await flagMismatches();
  const found = mismatches
    .filter((x) => x.action === "reject")
    .map((x) => x.text);
  assert.deepEqual(found, []);
});

test("sweep: the controllers of both parties and the integrity checker are offered nothing to record (SoD-1, SoD-3)", async () => {
  const w = await busyWorld();
  const views = await imports.load("domain/views/index.js");
  const actions = await imports.load("domain/actions/index.js");
  const failures = [];
  let checked = 0;
  for (const id of [U.CONTROLLER, U.SUPPLIER_CONTROLLER, U.AUDITOR])
    await w.domain.read(w.actor(id), (ctx) => {
      const visible = new Set(ctx.visibleContracts().map((c) => c.contract_id));
      for (const m of ctx.milestones) {
        if (!ctx.hasEvaluation(m.milestone_id)) continue;
        if (!visible.has(m.contract_id)) continue;
        checked += 1;
        const ref = {
          contractId: m.contract_id,
          sequence: Number(m.milestone_sequence),
        };
        const offered = views.milestoneDetail(
          ctx,
          ref.contractId,
          ref.sequence,
        ).actions;
        const candidate = views.voidCandidates(ctx, m)[0];
        // Only the buyer's contract owner proposes; none of these roles can.
        const canPropose =
          !!candidate &&
          probe(ctx, () =>
            actions.proposeException(ctx, {
              ...ref,
              eventId: candidate.event_id,
              reason: "Gỡ",
            }),
          ) === "OK";
        if (canPropose)
          failures.push(`${id}: proposeException accepted from a controller`);
        const label = `${id} ${ref.contractId}#${ref.sequence}`;
        if (offered.proposeException !== canPropose)
          failures.push(
            `${label}: proposeException offered=${offered.proposeException} accepted=${canPropose}`,
          );
        for (const name of [
          "submit",
          "approve",
          "reject",
          "openDispute",
          "resolveDispute",
          "transfer",
        ])
          if (offered[name]) failures.push(`${label}: ${name} is offered`);
        const tries = {
          attach: () =>
            actions.attachEvidence(ctx, {
              ...ref,
              eventType: m.required_event_types.split(";")[0],
              fileName: "x.pdf",
              sizeMb: 1,
            }),
          approve: () => actions.castVote(ctx, { ...ref, choice: "APPROVE" }),
          reject: () =>
            actions.castVote(ctx, { ...ref, choice: "REJECT", note: "x" }),
          open: () => actions.openDispute(ctx, { ...ref, note: "x" }),
          resolve: () =>
            actions.resolveDispute(ctx, {
              ...ref,
              option: "RESOLVE",
              note: "x",
            }),
          transfer: () => actions.transferToAccounting(ctx, ref),
        };
        for (const [name, fn] of Object.entries(tries))
          if (probe(ctx, fn) === "OK")
            failures.push(
              `${label}: ${name} is accepted from a ${ctx.actor.role}`,
            );
      }
    });
  assert.ok(checked > 0, "the controllers see their own milestones");
  assert.deepEqual(failures.slice(0, 20), [], `${failures.length} failures`);
});

test("sweep: no action records anything on a paid or rejected milestone, an unsigned contract, or with a dispute rule broken", async () => {
  const w = await busyWorld();
  const failures = [];
  const counts = { closed: 0, unsigned: 0, held: 0, free: 0 };
  await sweep(w, ({ ctx, contract, m, actions, ref, label }) => {
    const evaluation = ctx.evaluation(m.milestone_id);
    const status = ctx.status(m);
    const type = m.required_event_types.split(";")[0];
    const attempts = {
      openDispute: () => actions.openDispute(ctx, { ...ref, note: "Phản đối" }),
      resolveDispute: () =>
        actions.resolveDispute(ctx, {
          ...ref,
          option: "RESOLVE",
          note: "Giải quyết",
        }),
      approve: () => actions.castVote(ctx, { ...ref, choice: "APPROVE" }),
      reject: () =>
        actions.castVote(ctx, { ...ref, choice: "REJECT", note: "Từ chối" }),
      requestInfo: () =>
        actions.castVote(ctx, {
          ...ref,
          choice: "REQUEST_INFO",
          note: "Cần thêm",
        }),
      attach: () =>
        actions.attachEvidence(ctx, {
          ...ref,
          eventType: type,
          fileName: "x.pdf",
          sizeMb: 1,
        }),
    };
    const results = Object.fromEntries(
      Object.entries(attempts).map(([name, fn]) => [name, probe(ctx, fn)]),
    );
    const closed = ["REJECTED", "COMPLETED"].includes(status);
    const unsigned = contract.lifecycle !== "ACTIVE";
    if (closed) counts.closed += 1;
    if (unsigned) counts.unsigned += 1;
    if (closed || unsigned)
      for (const [name, result] of Object.entries(results))
        if (result === "OK")
          failures.push(
            `${label}: ${name} was accepted on a ${closed ? status : "unsigned"} milestone`,
          );
    // A dispute is opened only when none is open, and closed only when one is.
    if (evaluation.openDisputeIds.length) {
      counts.held += 1;
      if (results.openDispute === "OK")
        failures.push(`${label}: a second dispute was accepted`);
    } else {
      counts.free += 1;
      if (results.resolveDispute === "OK")
        failures.push(`${label}: a dispute was resolved although none is open`);
    }
  });
  assert.ok(
    counts.closed >= 15 &&
      counts.unsigned > 0 &&
      counts.held >= 10 &&
      counts.free > 1000,
    JSON.stringify(counts),
  );
  assert.deepEqual(failures.slice(0, 20), [], `${failures.length} violations`);
});

test("sweep: on every milestone each party may do exactly what the specification allows (4.2 authority, BR-08, BR-09, BR-10, payment rules)", async () => {
  const w = await busyWorld();
  const buyerSide = { LEGAL_REVIEWER: "BUYER", SUPPLIER: "SUPPLIER" };
  const failures = [];
  let checks = 0;
  const expect = (label, what, expected, actual) => {
    checks += 1;
    if (expected !== actual)
      failures.push(
        `${label}: ${what} should be ${expected ? "accepted" : "refused"} but is ${actual ? "accepted" : "refused"}`,
      );
  };
  await sweep(w, ({ ctx, user, contract, m, actions, ref, label }) => {
    const evaluation = ctx.evaluation(m.milestone_id);
    const events = ctx.eventsOf(m.milestone_id);
    const paid = ctx.t.payments.some((p) => p.milestoneId === m.milestone_id);
    // Final states (spec 9.4): a REJECT decision and a payment. Unsigned contracts take no events.
    const open =
      contract.lifecycle === "ACTIVE" &&
      !paid &&
      evaluation.decision !== "REJECT";
    const role = user.role;
    const inBuyer = contract.buyer_id === user.organizationId;
    const approver =
      ["CONTRACT_OWNER", "FINANCE_APPROVER", "SECONDARY_APPROVER"].includes(
        role,
      ) && inBuyer;
    const required = m.required_event_types.split(";");
    const attached = ctx.t.attachments.filter(
      (a) => a.milestoneId === m.milestone_id && a.side === buyerSide[role],
    );
    // The role gate in front of each handler is checked by the role matrix above; here a handler
    // result counts only for the roles that gate lets through.
    const run = (name, fn) =>
      WRITE_ACTIONS.find((row) => row.name === name).allowed.includes(role) &&
      probe(ctx, fn) === "OK";
    // Documents (spec 4.2): the right side, a required type, once.
    for (const type of Object.keys(SPEC_AUTHORITY))
      expect(
        label,
        `attaching ${type}`,
        open &&
          required.includes(type) &&
          buyerSide[role] === SPEC_AUTHORITY[type] &&
          !attached.some((a) => a.eventType === type),
        run("attachEvidenceFile", () =>
          actions.attachEvidence(ctx, {
            ...ref,
            eventType: type,
            fileName: "x.pdf",
            sizeMb: 1,
          }),
        ),
      );
    expect(
      label,
      "attaching OTHER",
      open && !!buyerSide[role],
      run("attachEvidenceFile", () =>
        actions.attachEvidence(ctx, {
          ...ref,
          eventType: "OTHER",
          fileName: "x.pdf",
          sizeMb: 1,
        }),
      ),
    );
    // Approvals (BR-10): an approver of the buyer, a role of the policy, once.
    const approvedBefore = events.some(
      (e) => e.event_type === "APPROVAL" && e.actor_party_id === user.partyId,
    );
    const rejectedBefore = events.some(
      (e) => e.event_type === "REJECTION" && e.actor_party_id === user.partyId,
    );
    expect(
      label,
      "APPROVE",
      open &&
        approver &&
        m.approval_required === "TRUE" &&
        m.required_approval_roles.split(";").includes(role) &&
        !approvedBefore,
      run("castVote", () =>
        actions.castVote(ctx, { ...ref, choice: "APPROVE" }),
      ),
    );
    expect(
      label,
      "REJECT",
      open && approver && !rejectedBefore,
      run("castVote", () =>
        actions.castVote(ctx, { ...ref, choice: "REJECT", note: "x" }),
      ),
    );
    expect(
      label,
      "REQUEST_INFO",
      open && approver,
      run("castVote", () =>
        actions.castVote(ctx, { ...ref, choice: "REQUEST_INFO", note: "x" }),
      ),
    );
    // Disputes (BR-08, spec 17): supplier, buyer officer or contract owner open one; only the buyer side closes it.
    const mayOpen =
      (role === "SUPPLIER" && contract.supplier_id === user.organizationId) ||
      (inBuyer && ["LEGAL_REVIEWER", "CONTRACT_OWNER"].includes(role));
    const mayClose =
      inBuyer && ["LEGAL_REVIEWER", "CONTRACT_OWNER"].includes(role);
    const hasOpen = evaluation.openDisputeIds.length > 0;
    expect(
      label,
      "opening a dispute",
      open && mayOpen && !hasOpen,
      run("openDispute", () => actions.openDispute(ctx, { ...ref, note: "x" })),
    );
    expect(
      label,
      "closing a dispute",
      open && mayClose && hasOpen,
      run("resolveDispute", () =>
        actions.resolveDispute(ctx, { ...ref, option: "RESOLVE", note: "x" }),
      ),
    );
    // Payment: the buyer's finance approver, a RELEASE or PENALTY decision, once.
    expect(
      label,
      "transfer",
      role === "FINANCE_APPROVER" &&
        inBuyer &&
        !paid &&
        ["RELEASE", "PENALTY"].includes(evaluation.decision),
      run("transferToAccounting", () => actions.transferToAccounting(ctx, ref)),
    );
  });
  assert.ok(checks > 30000, `${checks} checks`);
  assert.deepEqual(
    failures.slice(0, 20),
    [],
    `${failures.length} of ${checks} checks failed`,
  );
});

test("sweep: nobody touches a contract outside their organisation, whatever the action", async () => {
  const w = await busyWorld();
  const views = await imports.load("domain/views/index.js");
  const actions = await imports.load("domain/actions/index.js");
  const signing = await imports.load("domain/signing.js");
  const failures = [];
  let attempts = 0;
  for (const id of [
    U.OWNER,
    U.FINANCE,
    U.SECONDARY,
    U.LEGAL,
    U.SUPPLIER,
    userOf("B009", "FINANCE_APPROVER"),
    userOf("S024", "SUPPLIER"),
  ])
    await w.domain.read(w.actor(id), (ctx) => {
      const visible = new Set(ctx.visibleContracts().map((c) => c.contract_id));
      for (const contract of ctx.contracts) {
        if (visible.has(contract.contract_id)) continue;
        const ref = { contractId: contract.contract_id, sequence: 1 };
        const tries = {
          attach: () =>
            actions.attachEvidence(ctx, {
              ...ref,
              eventType: "OTHER",
              fileName: "x.pdf",
              sizeMb: 1,
            }),
          remove: () =>
            actions.removeEvidence(ctx, { ...ref, attachmentId: "ATT-00001" }),
          submit: () => actions.submitEvidence(ctx, ref),
          approve: () => actions.castVote(ctx, { ...ref, choice: "APPROVE" }),
          reject: () =>
            actions.castVote(ctx, { ...ref, choice: "REJECT", note: "x" }),
          open: () => actions.openDispute(ctx, { ...ref, note: "x" }),
          resolve: () =>
            actions.resolveDispute(ctx, {
              ...ref,
              option: "RESOLVE",
              note: "x",
            }),
          transfer: () => actions.transferToAccounting(ctx, ref),
          detail: () => views.milestoneDetail(ctx, contract.contract_id, 1),
          overview: () => views.contractOverview(ctx, contract.contract_id),
          sign: () =>
            signing.sendRequest(ctx, contract.contract_id, 1, "USB_TOKEN"),
          slots: () => signing.saveSlots(ctx, contract.contract_id, {}),
          cancel: () => signing.cancelSigning(ctx, contract.contract_id),
        };
        for (const [name, fn] of Object.entries(tries)) {
          attempts += 1;
          const result = probe(ctx, () => {
            const value = fn();
            if (value && typeof value.then === "function")
              value.catch(() => {});
          });
          if (
            result !== "CONTRACT_ACCESS_DENIED" &&
            result !== "CONTRACT_NOT_FOUND"
          )
            failures.push(
              `${id} ${name} on ${contract.contract_id}: ${result}`,
            );
        }
      }
    });
  assert.ok(attempts > 4000, `${attempts} attempts`);
  assert.deepEqual(
    failures.slice(0, 20),
    [],
    `${failures.length} of ${attempts} attempts reached a foreign contract`,
  );
});

/* ------------------------------ 11. engine and decision invariants ------------------------------ */

const PYTHON = process.env.PYTHON ?? "python3";
const addDaysIso = (iso, n) =>
  new Date(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) + n * 86_400_000)
    .toISOString()
    .slice(0, 10);
const daysBetween = (from, to) =>
  Math.round(
    (Date.parse(`${to.slice(0, 10)}T00:00:00Z`) -
      Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) /
      86_400_000,
  );

/** Runs apps/engine/cli.py --json on the official Data Pack, or on a copy that `edit` changes first. */
async function engine(edit) {
  const args = ["apps/engine/cli.py", "--json"];
  const tables = {};
  for (const name of [
    "contracts",
    "parties",
    "milestones",
    "events",
    "payment_rules",
  ])
    tables[name] = (await imports.load("domain/csv.js")).readRecords(
      await readFile(join(DATA_PACK, `${name}.csv`), "utf8"),
    );
  if (edit) {
    const dir = await mkdtemp(join(base, "pack-"));
    edit(tables);
    const { writeCsv } = await imports.load("domain/csv.js");
    for (const [name, table] of Object.entries(tables))
      await writeFile(
        join(dir, `${name}.csv`),
        writeCsv(table.columns, table.rows),
      );
    args.push("--workflow", "--data", dir);
  }
  const { stdout } = await execFileAsync(PYTHON, args, {
    cwd: ROOT,
    maxBuffer: 128 * 1024 * 1024,
  });
  const output = JSON.parse(stdout);
  return {
    ...output,
    tables,
    row: (id) => output.rows.find((r) => r.milestone_id === id),
    trace: (id) => output.traces.find((t) => t.id.endsWith(`:${id}`)).result,
  };
}
let officialRun;
const official = () => (officialRun ??= engine());

test("engine: every one of the 405 template rows is decided exactly once, with money as exact decimals that never go negative (BR-13, 14.6)", async () => {
  const run = await official();
  const template = (await imports.load("domain/csv.js")).readRecords(
    await readFile(
      join(
        ROOT,
        "BangD-Case4/DataPack-CASE4_SmartContractWorkflow/04_output_templates/submission_output_template.csv",
      ),
      "utf8",
    ),
  );
  assert.equal(template.rows.length, 405);
  assert.equal(run.rows.length, 405);
  assert.deepEqual(
    run.rows.map((r) => r.milestone_id),
    template.rows.map((r) => r.milestone_id),
    "same milestones, same order, none twice",
  );
  assert.equal(new Set(run.rows.map((r) => r.milestone_id)).size, 405);
  assert.deepEqual(
    Object.keys(run.rows[0]).slice(0, 22),
    template.columns,
    "the 22 official columns",
  );
  const counts = {};
  for (const row of run.rows) {
    const id = row.milestone_id;
    for (const column of template.columns.slice(0, 6))
      assert.equal(
        row[column],
        template.rows.find((t) => t.milestone_id === id)[column],
        `${id}.${column}`,
      );
    counts[row.predicted_decision] = (counts[row.predicted_decision] ?? 0) + 1;
    const planned = cents(row.planned_payment_vnd_mn);
    const payable = row.payable_amount_vnd_mn;
    const penalty = row.penalty_amount_vnd_mn;
    assert.match(
      payable,
      /^\d+\.\d{2}$/,
      `${id} payable is an exact non-negative decimal`,
    );
    assert.match(
      penalty,
      /^\d+\.\d{2}$/,
      `${id} penalty is an exact non-negative decimal`,
    );
    const confidence = Number(row.confidence_score);
    assert.ok(
      confidence >= 0 && confidence <= 1,
      `${id} confidence ${row.confidence_score}`,
    );
    if (row.predicted_decision === "RELEASE") {
      assert.equal(cents(payable), planned, id);
      assert.equal(cents(penalty), 0n, id);
    } else if (row.predicted_decision === "PENALTY") {
      assert.equal(
        cents(payable) + cents(penalty),
        planned,
        `${id}: payable + penalty = planned`,
      );
      assert.ok(cents(penalty) >= 0n);
    } else {
      assert.equal(
        cents(payable),
        0n,
        `${id}: nothing is payable on ${row.predicted_decision}`,
      );
      assert.equal(cents(penalty), 0n, id);
    }
  }
  assert.deepEqual(counts, { RELEASE: 348, PENALTY: 15, HOLD: 36, REJECT: 6 });
  assert.deepEqual(run.summary.invariantViolations, []);
});

test("engine: nothing is payable unless every condition holds; an open dispute holds the milestone whatever the confidence (rule 10, [15] section 3)", async () => {
  const run = await official();
  let held = 0;
  for (const row of run.rows) {
    const t = run.trace(row.milestone_id);
    const paid = ["RELEASE", "PENALTY"].includes(row.predicted_decision);
    if (paid) {
      assert.deepEqual(t.missing, [], row.milestone_id);
      assert.deepEqual(t.unauthorized, [], row.milestone_id);
      assert.equal(t.open_dispute, false, row.milestone_id);
      assert.equal(t.valid_rejection_count, 0, row.milestone_id);
      assert.deepEqual(t.issues, [], row.milestone_id);
      assert.equal(row.missing_conditions, "", row.milestone_id);
      if (t.approval_required)
        assert.ok(
          t.valid_approval_count >= t.quorum,
          `${row.milestone_id} quorum`,
        );
    }
    if (t.open_dispute) {
      held += 1;
      assert.equal(row.predicted_decision, "HOLD", row.milestone_id);
      assert.equal(row.reason_code, "OPEN_DISPUTE", row.milestone_id);
      assert.equal(row.payable_amount_vnd_mn, "0.00");
      assert.ok(
        Number(row.confidence_score) > 0,
        "the confidence is informational and never overrides the hold",
      );
    }
    if (t.valid_rejection_count && !t.open_dispute)
      assert.equal(row.predicted_decision, "REJECT", row.milestone_id);
  }
  assert.equal(held, 10);
});

test("engine: completion is the latest of the earliest valid required events; days late and the penalty follow BR-11 to BR-13 on every milestone", async () => {
  const run = await official();
  const { tables } = run;
  const milestones = new Map(
    tables.milestones.rows.map((m) => [m.milestone_id, m]),
  );
  const events = new Map(tables.events.rows.map((e) => [e.event_id, e]));
  let penalised = 0;
  for (const row of run.rows) {
    const m = milestones.get(row.milestone_id);
    const t = run.trace(row.milestone_id);
    const required = m.required_event_types.split(";");
    // Evidence ids are the earliest valid event of each required type (plus approvals and disputes).
    const stamps = t.evidence
      .map((id) => events.get(id))
      .filter((e) => required.includes(e.event_type))
      .map((e) => e.event_timestamp);
    const complete = t.missing.length === 0;
    assert.equal(
      t.completion_ts || null,
      complete ? stamps.sort().at(-1) : null,
      `${row.milestone_id} completion`,
    );
    const deadline = addDaysIso(m.due_date, Number(m.grace_period_days));
    const late = complete
      ? Math.max(0, daysBetween(deadline, t.completion_ts))
      : 0;
    assert.equal(t.days_late, late, `${row.milestone_id} days late`);
    if (row.predicted_decision === "PENALTY") {
      penalised += 1;
      assert.equal(m.late_penalty_applicable, "TRUE");
      assert.ok(late > 0);
      const expected = penaltyOracle({
        planned: m.planned_payment_vnd_mn,
        ratePct: m.penalty_rate_pct_per_day,
        capPct: m.max_penalty_pct,
        daysLate: late,
      });
      assert.equal(
        row.penalty_amount_vnd_mn,
        expected.penalty,
        `${row.milestone_id} penalty`,
      );
      assert.equal(
        row.payable_amount_vnd_mn,
        expected.payable,
        `${row.milestone_id} payable`,
      );
    } else if (
      row.predicted_decision === "RELEASE" &&
      m.late_penalty_applicable === "TRUE"
    )
      assert.equal(
        late,
        0,
        `${row.milestone_id} was released late without a penalty`,
      );
  }
  assert.equal(penalised, 15);
  // The half-cent case of the specification: 10.605 rounds up to 10.61 (BR-13, T32).
  assert.equal(run.row("MS0396").penalty_amount_vnd_mn, "10.61");
});

test("engine: the late-penalty rules hold on synthetic changes: ceiling, grace boundary, penalty switched off, never a negative payable (BR-12, BR-13, T28-T30)", async () => {
  const base = await official();
  const penalties = base.rows
    .filter(
      (r) => r.predicted_decision === "PENALTY" && r.milestone_id !== "MS0396",
    )
    .map((r) => r.milestone_id);
  const [cap, equal, oneLate, off, huge] = penalties;
  const info = (id) => {
    const m = base.tables.milestones.rows.find((x) => x.milestone_id === id);
    const t = base.trace(id);
    return { m, completion: t.completion_ts.slice(0, 10), days: t.days_late };
  };
  const edits = {
    cap: info(cap),
    equal: info(equal),
    oneLate: info(oneLate),
    off: info(off),
    huge: info(huge),
  };
  const run = await engine(({ milestones }) => {
    const set = (id, patch) =>
      Object.assign(
        milestones.rows.find((m) => m.milestone_id === id),
        patch,
      );
    set(cap, { max_penalty_pct: "0.20" });
    // Completed exactly on due date + grace: not late (the comparison is "greater than").
    set(equal, {
      due_date: addDaysIso(
        edits.equal.completion,
        -Number(edits.equal.m.grace_period_days),
      ),
    });
    // One day after due date + grace: exactly one day late.
    set(oneLate, {
      due_date: addDaysIso(
        edits.oneLate.completion,
        -Number(edits.oneLate.m.grace_period_days) - 1,
      ),
    });
    set(off, { late_penalty_applicable: "FALSE" });
    // A penalty larger than the milestone: the payable amount stops at zero.
    set(huge, {
      penalty_rate_pct_per_day: "5.00",
      max_penalty_pct: "500.00",
      due_date: addDaysIso(
        edits.huge.completion,
        -Number(edits.huge.m.grace_period_days) - 60,
      ),
    });
  });
  assert.deepEqual(run.summary.invariantViolations, []);
  // Ceiling: the penalty is the cap, whatever the number of days.
  const capped = run.row(cap);
  assert.ok(
    edits.cap.days * Number(edits.cap.m.penalty_rate_pct_per_day) > 0.2,
    "the cap really binds in this case",
  );
  const capOracle = penaltyOracle({
    planned: edits.cap.m.planned_payment_vnd_mn,
    ratePct: edits.cap.m.penalty_rate_pct_per_day,
    capPct: "0.20",
    daysLate: edits.cap.days,
  });
  assert.equal(capped.penalty_amount_vnd_mn, capOracle.penalty);
  assert.equal(capped.payable_amount_vnd_mn, capOracle.payable);
  assert.equal(capped.predicted_decision, "PENALTY");
  // Boundary.
  assert.equal(run.row(equal).predicted_decision, "RELEASE");
  assert.equal(run.row(equal).reason_code, "ALL_CONDITIONS_MET");
  assert.equal(run.row(equal).penalty_amount_vnd_mn, "0.00");
  assert.equal(run.trace(equal).days_late, 0);
  const late = run.row(oneLate);
  assert.equal(late.predicted_decision, "PENALTY");
  assert.equal(run.trace(oneLate).days_late, 1);
  const lateOracle = penaltyOracle({
    planned: edits.oneLate.m.planned_payment_vnd_mn,
    ratePct: edits.oneLate.m.penalty_rate_pct_per_day,
    capPct: edits.oneLate.m.max_penalty_pct,
    daysLate: 1,
  });
  assert.equal(late.penalty_amount_vnd_mn, lateOracle.penalty);
  // A milestone without a late penalty is never penalised, however late.
  assert.equal(run.row(off).predicted_decision, "RELEASE");
  assert.equal(
    run.row(off).payable_amount_vnd_mn,
    edits.off.m.planned_payment_vnd_mn,
  );
  assert.ok(edits.off.days > 0, "it was late");
  // Penalty above the planned amount.
  const overshoot = run.row(huge);
  assert.equal(overshoot.predicted_decision, "PENALTY");
  assert.equal(overshoot.payable_amount_vnd_mn, "0.00");
  assert.ok(cents(overshoot.payable_amount_vnd_mn) >= 0n);
});

test("engine: approvals count once per required role, an open dispute holds a payable milestone, and unreadable terms fall to rule 80 (BR-10, BR-08, BR-14, BR-15)", async () => {
  const base = await official();
  const two = base.rows.find(
    (r) =>
      r.predicted_decision === "RELEASE" &&
      base.trace(r.milestone_id).quorum === 2,
  );
  const free = base.rows
    .filter(
      (r) =>
        r.predicted_decision === "RELEASE" &&
        base.trace(r.milestone_id).quorum === 2,
    )
    .map((r) => r.milestone_id);
  const [distinct, duplicated, disputed, structural] = free.slice(0, 4);
  assert.ok(structural, "four two-approval releases exist");
  assert.ok(two);
  const run = await engine(({ parties, events, milestones }) => {
    const buyerOf = (milestoneId) =>
      base.tables.contracts.rows.find(
        (c) =>
          c.contract_id ===
          events.rows.find((e) => e.milestone_id === milestoneId).contract_id,
      ).buyer_id;
    const addEvent = (like, patch) => events.rows.push({ ...like, ...patch });
    // distinct roles: the two required roles are covered by two people of the SAME role.
    const approvals = events.rows.filter(
      (e) => e.milestone_id === distinct && e.event_type === "APPROVAL",
    );
    const owner = parties.rows.find(
      (p) =>
        p.party_type === "APPROVER" &&
        p.parent_party_id === buyerOf(distinct) &&
        p.approval_role === "CONTRACT_OWNER",
    );
    parties.rows.push({
      ...owner,
      party_id: "A901",
      party_name: "Second owner",
    });
    for (const approval of approvals)
      approval.actor_party_id =
        approval.actor_party_id === owner.party_id ? owner.party_id : "A901";
    // one person approving twice, with different documents, still covers one role.
    const second = events.rows
      .filter(
        (e) => e.milestone_id === duplicated && e.event_type === "APPROVAL",
      )
      .at(-1);
    const keep = events.rows.filter(
      (e) => e.milestone_id === duplicated && e.event_type === "APPROVAL",
    )[0];
    events.rows.splice(events.rows.indexOf(second), 1);
    addEvent(keep, {
      event_id: "EVX0001",
      document_id: "APR-DUP-2",
      event_timestamp: "2026-10-01T10:00:00",
    });
    // an open dispute on a payable milestone.
    const some = events.rows.find((e) => e.milestone_id === disputed);
    addEvent(some, {
      event_id: "EVX0002",
      event_type: "DISPUTE_OPENED",
      event_status: "OPEN",
      actor_party_id: buyerOf(disputed),
      actor_party_type: "BUYER",
      actor_role: "BUYER",
      document_id: "DSP-X",
      event_timestamp: "2026-10-02T10:00:00",
      reference_event_id: "",
    });
    // a quorum that disagrees with the roles cannot be evaluated.
    Object.assign(
      milestones.rows.find((m) => m.milestone_id === structural),
      { required_approval_quorum: "1" },
    );
  });
  const roles = (id) =>
    base.tables.milestones.rows
      .find((m) => m.milestone_id === id)
      .required_approval_roles.split(";");
  assert.ok(roles(distinct).includes("CONTRACT_OWNER"));
  const dedup = run.row(distinct);
  assert.equal(
    dedup.predicted_decision,
    "HOLD",
    "two people of one role are not two roles",
  );
  assert.equal(dedup.reason_code, "APPROVAL_QUORUM_NOT_MET");
  assert.equal(run.trace(distinct).valid_approval_count, 1);
  assert.equal(run.row(duplicated).reason_code, "APPROVAL_QUORUM_NOT_MET");
  assert.equal(
    run.trace(duplicated).valid_approval_count,
    1,
    "one approver counts once",
  );
  const dispute = run.row(disputed);
  assert.equal(dispute.predicted_decision, "HOLD");
  assert.equal(dispute.reason_code, "OPEN_DISPUTE");
  assert.equal(dispute.payable_amount_vnd_mn, "0.00");
  const gap = run.row(structural);
  assert.equal(gap.predicted_decision, "HOLD");
  assert.equal(gap.reason_code, "UNRESOLVED_CONDITION");
  assert.equal(gap.payable_amount_vnd_mn, "0.00");
  assert.equal(gap.penalty_amount_vnd_mn, "0.00");
  assert.deepEqual(
    run.rows.filter(
      (r) =>
        ![distinct, duplicated, disputed, structural].includes(
          r.milestone_id,
        ) &&
        r.predicted_decision !== base.row(r.milestone_id).predicted_decision,
    ),
    [],
    "no other milestone changed",
  );
});

test("engine: later approvals, resolutions and repeated documents never move the completion date or add a penalty day ([15] section 1, BR-03, BR-11)", async () => {
  const base = await official();
  const target = base.rows.find(
    (r) => r.predicted_decision === "PENALTY" && r.milestone_id !== "MS0396",
  ).milestone_id;
  const before = base.trace(target);
  const run = await engine(({ events }) => {
    const mine = events.rows.filter((e) => e.milestone_id === target);
    // Approvals a month later, a repeat of every required document two days later, and a late resolve.
    for (const e of mine.filter((x) => x.event_type === "APPROVAL"))
      e.event_timestamp = "2027-06-01T09:00:00";
    for (const e of mine.filter(
      (x) =>
        ![
          "APPROVAL",
          "REJECTION",
          "DISPUTE_OPENED",
          "DISPUTE_RESOLVED",
        ].includes(x.event_type),
    ))
      events.rows.push({
        ...e,
        event_id: `EVR${e.event_id}`,
        event_timestamp:
          addDaysIso(e.event_timestamp, 2) + e.event_timestamp.slice(10),
      });
  });
  const after = run.trace(target);
  assert.equal(after.completion_ts, before.completion_ts);
  assert.equal(after.days_late, before.days_late);
  assert.equal(
    run.row(target).penalty_amount_vnd_mn,
    base.row(target).penalty_amount_vnd_mn,
  );
  assert.equal(
    run.row(target).payable_amount_vnd_mn,
    base.row(target).payable_amount_vnd_mn,
  );
  assert.ok(
    after.duplicates.length > 0,
    "the repeats were recognised as duplicates",
  );
});

test("engine: the live decisions of the workflow database obey the same invariants after real actions", async () => {
  const w = await busyWorld();
  const milestones = new Map(
    w.tbl("milestones").map((m) => [m.milestone_id, m]),
  );
  let seen = 0;
  for (const e of w.tbl("evaluations")) {
    seen += 1;
    const m = milestones.get(e.milestoneId);
    assert.match(e.payableMillion, /^\d+\.\d{2}$/);
    assert.match(e.penaltyMillion, /^\d+\.\d{2}$/);
    assert.ok(
      Number(e.confidence) >= 0 && Number(e.confidence) <= 1,
      e.milestoneId,
    );
    if (e.openDisputeIds.length) {
      assert.equal(e.decision, "HOLD", e.milestoneId);
      assert.equal(e.reasonCode, "OPEN_DISPUTE");
    }
    if (["RELEASE", "PENALTY"].includes(e.decision)) {
      assert.equal(
        e.missing.length +
          e.unauthorized.length +
          e.openDisputeIds.length +
          e.validRejectionCount,
        0,
        e.milestoneId,
      );
      assert.equal(
        cents(e.payableMillion) + cents(e.penaltyMillion),
        cents(m.planned_payment_vnd_mn),
        e.milestoneId,
      );
    } else {
      assert.equal(e.payableMillion, "0.00", e.milestoneId);
      assert.equal(e.penaltyMillion, "0.00", e.milestoneId);
    }
  }
  assert.equal(seen, 417, "every milestone of the database is decided");
  // Exactly one payment per paid milestone, for the decided amount, on a RELEASE or PENALTY decision.
  const seenPaid = new Set();
  for (const p of w.tbl("payments")) {
    assert.ok(!seenPaid.has(p.milestoneId), "one payment per milestone");
    seenPaid.add(p.milestoneId);
    assert.ok(
      ["RELEASE", "PENALTY"].includes(w.evaluation(p.milestoneId).decision),
    );
    assert.equal(p.amountMillion, w.evaluation(p.milestoneId).payableMillion);
  }
  assert.equal(seenPaid.size, 4);
});

/* ------------------------------ 12. more rules found while reading the sources ------------------------------ */

test("rejection: an approver may reject a milestone that needs no approval at all (BR-09, sample SC015)", async () => {
  const w = await world();
  const ref = w.ref("CT0013", 3); // AUTO_IF_ALL_CONDITIONS: approval_required = FALSE
  assert.equal(w.milestone("CT0013", 3).approval_required, "FALSE");
  assert.equal(
    w.evaluation(w.milestone("CT0013", 3).milestone_id).decision,
    "PENALTY",
  );
  const result = await ok(
    w,
    userOf("B001", "CONTRACT_OWNER"),
    "approvals",
    "castVote",
    { ...ref, choice: "REJECT", note: "Không nghiệm thu" },
  );
  assert.equal(result.evaluation.decision, "REJECT");
  assert.equal(result.evaluation.payableMillion, "0.00");
  await denied(
    w,
    financeOf(w, "CT0013"),
    "payments",
    "transferToAccounting",
    [ref],
    "NOT_PAYABLE",
  );
});

test("signing: reading a request never signs it early or past its lifetime; only the signer's own read can advance the simulated phone", async () => {
  const w = await world();
  await send(w, U.SUPPLIER, "CT0102", 2);
  const pending = await w.call(
    U.SUPPLIER,
    "signing",
    "getSigningRequest",
    "CT0102",
    2,
  );
  assert.equal(
    pending.status,
    "PENDING",
    "the simulated confirmation takes a few seconds",
  );
  assert.equal(stepOf(w, "CT0102", 2).status, "CURRENT");
  // Past its lifetime a read expires it, even when the phone would have confirmed.
  await w.repo.mutate("signing-requests", (rows) => {
    const request = rows.at(-1);
    request.expiresAt = new Date(Date.now() - 1000).toISOString();
    request.autoConfirmAt = new Date(Date.now() - 2000).toISOString();
  });
  const expired = await w.call(
    U.SUPPLIER,
    "signing",
    "getSigningRequest",
    "CT0102",
    2,
  );
  assert.equal(expired.status, "EXPIRED");
  assert.equal(stepOf(w, "CT0102", 2).status, "CURRENT");
  await denied(
    w,
    U.SUPPLIER,
    "signing",
    "confirmSigningRequest",
    ["CT0102", 2],
    "REQUEST_NOT_PENDING",
  );
});

test("audit: every successful write is sealed in the chain under the signed-in actor, earlier entries never change, the chain verifies", async () => {
  const w = await world();
  const { recordHash } = await imports.load("common/audit-chain.js");
  const before = structuredClone(w.tbl("audit"));
  // A cross-section of the write actions, each by a different actor, with false claims in the input.
  const claims = {
    actorId: "u-admin",
    role: "ADMIN_AUDITOR",
    organizationId: "OPS",
    actorName: "Someone else",
  };
  await ok(w, U.SUPPLIER, "evidence", "attachEvidenceFile", {
    ...w.ref("CT0104", 2),
    ...file({ eventType: "INVOICE" }),
    ...claims,
  });
  await ok(w, U.SUPPLIER, "evidence", "attachEvidenceFile", {
    ...w.ref("CT0104", 2),
    ...file({ eventType: "SERVICE_COMPLETED" }),
    ...claims,
  });
  await ok(w, U.SUPPLIER, "evidence", "submitEvidence", {
    ...w.ref("CT0104", 2),
    ...claims,
  });
  await ok(w, U.OWNER, "approvals", "castVote", {
    ...w.ref("CT0104", 2),
    choice: "APPROVE",
    ...claims,
  });
  await ok(w, U.OWNER, "disputes", "openDispute", {
    ...w.ref("CT0104", 2),
    note: "Chất lượng",
    ...claims,
  });
  await ok(w, U.LEGAL, "disputes", "resolveDispute", {
    ...w.ref("CT0104", 2),
    option: "RESOLVE",
    note: "Đã xử lý",
    ...claims,
  });
  await ok(w, ownerOf(w, "CT0017"), "exceptions", "proposeException", {
    ...w.ref("CT0017", 3),
    eventId: "EV00177",
    reason: "Nhập nhầm",
    ...claims,
  });
  await ok(w, controllerOf(w, "CT0017"), "exceptions", "decideException", {
    exceptionId: "EXC-0001",
    approve: false,
    ...claims,
  });
  await ok(w, U.FINANCE, "payments", "transferToAccounting", {
    ...w.ref("CT0008", 1),
    ...claims,
  });
  await sign(w, U.SUPPLIER, "CT0102", 2, "USB_TOKEN");
  const added = w.tbl("audit").slice(before.length);
  assert.deepEqual(
    w.tbl("audit").slice(0, before.length),
    before,
    "earlier audit entries are untouched",
  );
  const actions = new Set(added.map((entry) => entry.action));
  for (const name of [
    "attachEvidenceFile",
    "submitEvidence",
    "castVote",
    "openDispute",
    "resolveDispute",
    "proposeException",
    "decideException",
    "transferToAccounting",
    "sendSigningRequest",
    "confirmSigningRequest",
  ])
    assert.ok(actions.has(name), `${name} is audited`);
  const actingUser = {
    attachEvidenceFile: U.SUPPLIER,
    submitEvidence: U.SUPPLIER,
    castVote: U.OWNER,
    openDispute: U.OWNER,
    resolveDispute: U.LEGAL,
    proposeException: ownerOf(w, "CT0017"),
    decideException: controllerOf(w, "CT0017"),
    transferToAccounting: U.FINANCE,
    sendSigningRequest: U.SUPPLIER,
    confirmSigningRequest: U.SUPPLIER,
  };
  for (const entry of added.filter((e) => e.resource === "workflow")) {
    assert.equal(
      entry.actorId,
      actingUser[entry.action],
      `${entry.action} is audited under the signed-in user, not the claimed one`,
    );
    assert.notEqual(entry.actorName, "Someone else");
    assert.equal(
      entry.actorRole,
      users.find((u) => u.id === entry.actorId).role,
    );
  }
  // Sequence numbers rise by one and each entry links to the previous hash.
  const sealed = w.tbl("audit").filter((e) => e.hash);
  sealed.forEach((entry, i) => {
    if (i > 0) assert.equal(entry.prevHash, sealed[i - 1].hash);
    assert.equal(entry.seq, i + 1);
  });
  // Every event the app recorded is sealed by the entry that created it.
  for (const event of w.tbl("events").filter((e) => e.origin === "APP")) {
    const entry = added.find((e) => e.eventIds?.includes(event.event_id));
    assert.ok(entry, `${event.event_id} is named in the audit`);
    assert.equal(entry.eventHashes[event.event_id], recordHash(event));
    assert.equal(
      event.recordedByUserId,
      entry.actorId,
      "the event names the audited actor",
    );
  }
  const report = await w.call(U.AUDITOR, "integrity", "verifyIntegrity");
  assert.equal(report.chain.ok, true);
  assert.deepEqual(report.evidence.problems, []);
  assert.equal(report.decisions.matched, report.decisions.checked);
});

test("audit: a rejected action leaves no trace in the chain, only successful ones are sealed", async () => {
  const w = await world();
  const head = w.snap().head;
  const length = w.tbl("audit").length;
  for (const [user, module, action, args] of [
    [U.SUPPLIER, "payments", "transferToAccounting", [w.ref("CT0008", 1)]],
    [
      U.OWNER,
      "approvals",
      "castVote",
      [{ ...w.ref("CT0103", 2), choice: "APPROVE" }],
    ],
    [
      U.SUPPLIER,
      "disputes",
      "openDispute",
      [{ ...w.ref("CT0019", 3), note: "x" }],
    ],
    [U.LEGAL, "evidence", "submitEvidence", [w.ref("CT0104", 2)]],
    [
      U.CONTROLLER,
      "exceptions",
      "decideException",
      [{ exceptionId: "EXC-1", approve: true }],
    ],
    [U.SUPPLIER, "signing", "confirmSigningRequest", ["CT0102", 2]],
  ])
    await expectCode(w.call(user, module, action, ...args), /.+/);
  assert.equal(w.tbl("audit").length, length);
  assert.equal(w.snap().head, head);
});

test("signing: a milestone id that is released with a cancelled sequence is never reused for another milestone, so history cannot be mixed up", async () => {
  const w = await world();
  await ok(w, U.LEGAL, "drafts", "confirmDigitization", "CT0101", {
    dueDate: "2027-05-31",
  });
  const first = w
    .tbl("milestones")
    .filter((m) => m.contract_id === "CT0101")
    .map((m) => m.milestone_id);
  await ok(w, U.LEGAL, "signing", "cancelSigning", "CT0101");
  await ok(w, U.LEGAL, "drafts", "confirmDigitization", "CT0101", {
    dueDate: "2027-05-31",
  });
  const second = w
    .tbl("milestones")
    .filter((m) => m.contract_id === "CT0101")
    .map((m) => m.milestone_id);
  assert.equal(second.filter((id) => first.includes(id)).length, 0);
});

test("approvals: a milestone held by a dispute still takes votes, but the hold wins until the dispute is closed (spec 9.4, rule 10 before 50 and 60)", async () => {
  const w = await world();
  const ref = w.ref("CT0103", 2); // owner approved, finance missing
  await ok(w, U.SUPPLIER, "disputes", "openDispute", {
    ...ref,
    note: "Phạt không đúng",
  });
  const held = await ok(w, U.FINANCE, "approvals", "castVote", {
    ...ref,
    choice: "APPROVE",
  });
  assert.equal(held.evaluation.validApprovalCount, 2, "the vote is recorded");
  assert.equal(held.evaluation.decision, "HOLD");
  assert.equal(held.evaluation.reasonCode, "OPEN_DISPUTE");
  assert.equal(held.evaluation.payableMillion, "0.00");
  await denied(
    w,
    U.FINANCE,
    "payments",
    "transferToAccounting",
    [ref],
    "NOT_PAYABLE",
  );
  const closed = await ok(w, U.OWNER, "disputes", "resolveDispute", {
    ...ref,
    option: "RESOLVE",
    note: "Giữ phạt",
  });
  assert.equal(closed.evaluation.decision, "PENALTY");
  assert.equal(
    closed.evaluation.completedAt,
    "2026-10-16T15:10:00",
    "neither the vote nor the resolution moves the completion date",
  );
  assert.equal(closed.evaluation.daysLate, 2);
});

test("signing: saving the same signature positions again is harmless and changes nothing", async () => {
  const w = await world();
  const slots = await w.call(
    U.LEGAL,
    "signing",
    "getDefaultSignatureSlots",
    "CT0101",
  );
  const first = await ok(
    w,
    U.LEGAL,
    "signing",
    "saveSignatureSlots",
    "CT0101",
    slots,
  );
  const again = await ok(
    w,
    U.OWNER,
    "signing",
    "saveSignatureSlots",
    "CT0101",
    slots,
  );
  assert.deepEqual(first, again);
  assert.deepEqual(record(w, "CT0101").slots, slots);
  assert.equal(
    record(w, "CT0101").steps.every((s) => s.status === "WAITING"),
    true,
  );
});

/* ------------------------------ 13. a real document: signatures are bound to its bytes ------------------------------ */

test("document: an app-made contract needs a reviewed extraction and matching signature positions; a changed file stops signing and shows on verification", async () => {
  const w = await world();
  const { BaseService } = imports;
  const fresh = await w.call(
    U.LEGAL,
    "drafts",
    "getContractDraft",
    undefined,
    true,
  );
  const saved = await ok(w, U.LEGAL, "drafts", "saveContractDraft", {
    ...fresh,
    title: "Hợp đồng có tài liệu",
    supplierId: "S015",
    type: "SERVICES",
    approvalPolicy: "FINANCE_PLUS_OWNER",
    reviewerId: U.LEGAL,
    signers: [
      { party: "BUYER", userId: U.OWNER },
      { party: "SUPPLIER", userId: U.SUPPLIER },
    ],
    file: { name: "HopDong.pdf", sizeBytes: 1000, kind: "PDF", pages: 14 },
  });
  const code = saved.code;
  const { SampleDocumentsController } = await imports.load(
    "sample-documents.js",
  );
  const { DocumentsController } = await imports.load("documents.js");
  const { ExtractionService } = await imports.load(
    "trust/extraction-service.js",
  );
  const generated = await new SampleDocumentsController(w.domain).create(
    { draft: saved, language: "en" },
    { user: w.actor(U.LEGAL) },
  );
  const buffer = Buffer.from(generated.base64, "base64");
  await new DocumentsController(w.repo, new BaseService(w.repo)).upload(
    code,
    { buffer, size: buffer.length, originalname: generated.fileName },
    { user: w.actor(U.LEGAL) },
  );
  const documentId = w.tbl("contract-drafts").find((d) => d.code === code)
    .file.documentId;
  assert.match(documentId, /^[a-f0-9-]{36}$/);
  // The terms must be reviewed against the document before the milestones are created.
  await denied(
    w,
    U.LEGAL,
    "drafts",
    "confirmDigitization",
    [code, { dueDate: "2027-12-31" }],
    "EXTRACTION_REVIEW_REQUIRED",
  );
  const extractor = new ExtractionService(w.repo, w.domain);
  const proposal = await extractor.extract(code, w.actor(U.LEGAL));
  await extractor.confirm(
    code,
    proposal.id,
    Object.fromEntries(
      proposal.fields.map((field) => [field.path, field.value]),
    ),
    w.actor(U.LEGAL),
  );
  // Positions are tied to the file they were drawn on.
  const config = await w.call(U.LEGAL, "signing", "getSigningConfig", code);
  const slots = await w.call(
    U.LEGAL,
    "signing",
    "getDefaultSignatureSlots",
    code,
  );
  assert.ok(Object.values(slots).every(Boolean));
  await denied(
    w,
    U.LEGAL,
    "signing",
    "saveSignatureSlots",
    [
      code,
      slots,
      { documentSha256: "0".repeat(64), version: config.layoutVersion },
    ],
    "DOCUMENT_CHANGED",
  );
  await denied(
    w,
    U.LEGAL,
    "signing",
    "saveSignatureSlots",
    [
      code,
      slots,
      {
        documentSha256: config.documentSha256,
        version: config.layoutVersion + 1,
      },
    ],
    "DOCUMENT_CHANGED",
  );
  await denied(
    w,
    U.LEGAL,
    "signing",
    "saveSignatureSlots",
    [code, slots],
    "DOCUMENT_CHANGED",
  );
  await ok(w, U.LEGAL, "signing", "saveSignatureSlots", code, slots, {
    documentSha256: config.documentSha256,
    version: config.layoutVersion,
  });
  await ok(w, U.LEGAL, "drafts", "confirmDigitization", code, {
    dueDate: "2027-12-31",
  });
  // Replacing the file after a request was sent cancels the signature: the digest no longer matches.
  const path = join(w.dir, "uploads", documentId);
  const original = await readFile(path);
  await send(w, U.OWNER, code, 1);
  await writeFile(
    path,
    Buffer.concat([original, Buffer.from("\n% altered after the request")]),
  );
  await denied(
    w,
    U.OWNER,
    "signing",
    "confirmSigningRequest",
    [code, 1],
    "DOCUMENT_CHANGED",
  );
  await denied(
    w,
    U.OWNER,
    "signing",
    "sendSigningRequest",
    [code, 1, "USB_TOKEN"],
    "DOCUMENT_CHANGED",
  );
  assert.equal(stepOf(w, code, 1).status, "CURRENT");
  // With the original bytes back the first signer signs, bound to the document's digest.
  await writeFile(path, original);
  await ok(w, U.OWNER, "signing", "confirmSigningRequest", code, 1);
  const proof = stepOf(w, code, 1).localProof.payload;
  assert.equal(proof.basis, "DOCUMENT_BYTES");
  assert.equal(proof.documentDigest, config.documentSha256);
  // The last signature starts the contract, and a file changed afterwards is visible on verification.
  await sign(w, U.SUPPLIER, code, 2, "VNPT_SMARTCA");
  assert.equal(w.contract(code).lifecycle, "ACTIVE");
  const intact = await w.call(U.OWNER, "signing", "getVerification", code);
  assert.deepEqual(
    intact.signatures.map((s) => s.status),
    ["VALID", "VALID"],
  );
  await writeFile(
    path,
    Buffer.concat([original, Buffer.from("\n% altered after signing")]),
  );
  const tampered = await w.call(U.OWNER, "signing", "getVerification", code);
  assert.ok(
    tampered.signatures.every(
      (s) => s.status === "INVALID" && s.contentIntact === false,
    ),
  );
});

test("repetition: the same action sent twice at once (a double click) takes effect once", async () => {
  const w = await world();
  const both = async (user, module, action, args, code) => {
    const results = await Promise.allSettled([
      w.call(user, module, action, ...args),
      w.call(user, module, action, ...args),
    ]);
    assert.equal(
      results.filter((r) => r.status === "fulfilled").length,
      1,
      `${action}: exactly one of two identical requests succeeds`,
    );
    const refused = results.find((r) => r.status === "rejected");
    assert.equal(messageOf(refused.reason), code, action);
  };
  await both(
    U.FINANCE,
    "payments",
    "transferToAccounting",
    [w.ref("CT0008", 1)],
    "ALREADY_TRANSFERRED",
  );
  assert.equal(w.tbl("payments").length, 1);
  await both(
    U.FINANCE,
    "approvals",
    "castVote",
    [{ ...w.ref("CT0103", 2), choice: "APPROVE" }],
    "ALREADY_VOTED",
  );
  assert.equal(
    w
      .events(w.milestone("CT0103", 2).milestone_id)
      .filter((e) => e.event_type === "APPROVAL").length,
    2,
  );
  await both(
    U.SUPPLIER,
    "disputes",
    "openDispute",
    [{ ...w.ref("CT0103", 2), note: "Phạt sai" }],
    "DISPUTE_ALREADY_OPEN",
  );
  assert.equal(
    w.evaluation(w.milestone("CT0103", 2).milestone_id).openDisputeIds.length,
    1,
  );
  await both(
    U.OWNER,
    "disputes",
    "resolveDispute",
    [{ ...w.ref("CT0103", 2), option: "RESOLVE", note: "Xong" }],
    "DISPUTE_NOT_OPEN",
  );
  await both(
    ownerOf(w, "CT0017"),
    "exceptions",
    "proposeException",
    [{ ...w.ref("CT0017", 3), eventId: "EV00177", reason: "Nhập nhầm" }],
    "EVENT_NOT_VOIDABLE",
  );
  await both(
    controllerOf(w, "CT0017"),
    "exceptions",
    "decideException",
    [{ exceptionId: "EXC-0001", approve: true }],
    "EXCEPTION_ALREADY_DECIDED",
  );
  await ok(w, U.SUPPLIER, "evidence", "attachEvidenceFile", {
    ...w.ref("CT0104", 2),
    ...file({ eventType: "SERVICE_COMPLETED" }),
  });
  await ok(w, U.SUPPLIER, "evidence", "attachEvidenceFile", {
    ...w.ref("CT0104", 2),
    ...file({ eventType: "INVOICE" }),
  });
  await both(
    U.SUPPLIER,
    "evidence",
    "submitEvidence",
    [w.ref("CT0104", 2)],
    "NOTHING_TO_SUBMIT",
  );
  assert.equal(
    w
      .events(w.milestone("CT0104", 2).milestone_id)
      .filter((e) => e.event_type === "INVOICE").length,
    1,
  );
  await send(w, U.SUPPLIER, "CT0102", 2);
  await both(
    U.SUPPLIER,
    "signing",
    "confirmSigningRequest",
    ["CT0102", 2],
    "REQUEST_NOT_PENDING",
  );
  assert.equal(stepOf(w, "CT0102", 2).status, "SIGNED");
  await ok(w, U.LEGAL, "drafts", "confirmDigitization", "CT0101", {
    dueDate: "2027-05-31",
  });
  await both(
    U.LEGAL,
    "signing",
    "cancelSigning",
    ["CT0101"],
    "SIGNING_ALREADY_STARTED",
  );
  await both(
    U.LEGAL,
    "drafts",
    "confirmDigitization",
    ["CT0101", { dueDate: "2027-05-31" }],
    "DRAFT_LOCKED",
  );
  assert.equal(
    w.tbl("milestones").filter((m) => m.contract_id === "CT0101").length,
    4,
  );
});

/* ------------------------------ 14. random order: no sequence of actions breaks a payment rule ------------------------------ */

function seeded(seed) {
  let state = seed >>> 0;
  return () =>
    (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32;
}

test("random order: whatever sequence of actions the parties try, nothing is paid twice or wrongly, nothing is recorded after a final state, and the chain holds", async () => {
  const rand = seeded(20261025);
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const w = await world();
  const contracts = [
    "CT0103",
    "CT0104",
    "CT0019",
    "CT0008",
    "CT0002",
    "CT0017",
    "CT0013",
    "CT0102",
    "CT0101",
    "CT0005",
  ];
  const operations = [
    "attach",
    "submit",
    "approve",
    "reject",
    "info",
    "open",
    "resolve",
    "pay",
    "propose",
    "decide",
    "send",
    "confirm",
    "cancelSigning",
    "digitize",
  ];
  const finalAt = new Map(); // milestone -> number of events when it became final (paid)
  const violations = [];
  let succeeded = 0;
  for (let step = 0; step < 110; step++) {
    const contractId = pick(contracts);
    const contract = w.contract(contractId);
    const sequences = w
      .tbl("milestones")
      .filter((m) => m.contract_id === contractId)
      .map((m) => Number(m.milestone_sequence));
    const sequence = sequences.length ? pick(sequences) : 1;
    const milestone = w.milestone(contractId, sequence);
    const ref = { contractId, sequence };
    const op = pick(operations);
    const who = {
      owner: userOf(contract.buyer_id, "CONTRACT_OWNER"),
      finance: userOf(contract.buyer_id, "FINANCE_APPROVER"),
      secondary: userOf(contract.buyer_id, "SECONDARY_APPROVER"),
      legal: userOf(contract.buyer_id, "LEGAL_REVIEWER"),
      supplier: userOf(contract.supplier_id, "SUPPLIER"),
      controller: userOf(contract.buyer_id, "ADMIN_AUDITOR"),
    };
    // Mostly the party that would normally do it, sometimes anyone at all.
    const fit = {
      attach: [who.supplier, who.legal],
      submit: [who.supplier, who.legal],
      approve: [who.owner, who.finance, who.secondary],
      reject: [who.owner, who.finance, who.secondary],
      info: [who.owner, who.finance],
      open: [who.supplier, who.legal, who.owner],
      resolve: [who.legal, who.owner],
      pay: [who.finance],
      propose: [who.owner],
      decide: [who.controller],
      send: [who.owner, who.supplier, who.secondary, who.finance],
      confirm: [who.owner, who.supplier, who.secondary, who.finance],
      cancelSigning: [who.legal, who.owner],
      digitize: [who.legal, who.owner],
    };
    const user =
      rand() < 0.85
        ? pick(fit[op])
        : pick([...Object.values(who), U.CONTROLLER, U.AUDITOR, U.SYSADMIN]);
    const types = milestone ? milestone.required_event_types.split(";") : [];
    const calls = {
      attach: [
        "evidence",
        "attachEvidenceFile",
        [{ ...ref, eventType: pick([...types, "OTHER"]), ...file() }],
      ],
      submit: ["evidence", "submitEvidence", [ref]],
      approve: ["approvals", "castVote", [{ ...ref, choice: "APPROVE" }]],
      reject: [
        "approvals",
        "castVote",
        [{ ...ref, choice: "REJECT", note: "Từ chối" }],
      ],
      info: [
        "approvals",
        "castVote",
        [{ ...ref, choice: "REQUEST_INFO", note: "Cần thêm" }],
      ],
      open: ["disputes", "openDispute", [{ ...ref, note: "Phản đối" }]],
      resolve: [
        "disputes",
        "resolveDispute",
        [{ ...ref, option: "RESOLVE", note: "Xong" }],
      ],
      pay: ["payments", "transferToAccounting", [ref]],
      propose: [
        "exceptions",
        "proposeException",
        [
          {
            ...ref,
            eventId: pick([
              ...w
                .tbl("events")
                .filter((e) => e.milestone_id === milestone?.milestone_id)
                .map((e) => e.event_id),
              "EV-NONE",
            ]),
            reason: "Gỡ",
          },
        ],
      ],
      decide: [
        "exceptions",
        "decideException",
        [
          {
            exceptionId: pick([
              ...w.tbl("exceptions").map((x) => x.id),
              "EXC-0001",
            ]),
            approve: rand() < 0.6,
          },
        ],
      ],
      send: [
        "signing",
        "sendSigningRequest",
        [contractId, pick([1, 2, 3]), "USB_TOKEN"],
      ],
      confirm: [
        "signing",
        "confirmSigningRequest",
        [contractId, pick([1, 2, 3])],
      ],
      cancelSigning: ["signing", "cancelSigning", [contractId]],
      digitize: [
        "drafts",
        "confirmDigitization",
        [contractId, { dueDate: "2027-05-31" }],
      ],
    };
    const [module, action, args] = calls[op];
    const before = w.snap();
    try {
      await w.call(user, module, action, ...args);
      succeeded += 1;
      if (op === "pay")
        finalAt.set(milestone.milestone_id, w.tbl("events").length);
    } catch (error) {
      if (w.snap().ref !== before.ref)
        violations.push(
          `step ${step}: ${op} was rejected (${messageOf(error)}) but stored data`,
        );
    }
    // Invariants that must hold after every step.
    const payments = new Map();
    for (const p of w.tbl("payments")) {
      payments.set(p.milestoneId, (payments.get(p.milestoneId) ?? 0) + 1);
      if (
        !["RELEASE", "PENALTY"].includes(p.decision) ||
        p.decision !== w.evaluation(p.milestoneId).decision ||
        p.amountMillion !== w.evaluation(p.milestoneId).payableMillion
      )
        violations.push(
          `step ${step}: payment ${p.id} does not match the decision`,
        );
    }
    for (const [id, count] of payments)
      if (count > 1) violations.push(`step ${step}: ${id} paid ${count} times`);
    for (const [id, count] of finalAt)
      if (
        w
          .tbl("events")
          .slice(count)
          .some((e) => e.milestone_id === id)
      )
        violations.push(
          `step ${step}: an event was recorded on paid milestone ${id}`,
        );
    for (const e of w.tbl("evaluations")) {
      if (
        e.openDisputeIds.length > 1 &&
        w
          .tbl("events")
          .filter(
            (x) =>
              x.milestone_id === e.milestoneId &&
              x.origin === "APP" &&
              x.event_type === "DISPUTE_OPENED",
          ).length > 1
      )
        violations.push(`step ${step}: two disputes open on ${e.milestoneId}`);
      if (e.openDisputeIds.length && e.decision !== "HOLD")
        violations.push(
          `step ${step}: ${e.milestoneId} has an open dispute but is ${e.decision}`,
        );
      if (
        !["RELEASE", "PENALTY"].includes(e.decision) &&
        (e.payableMillion !== "0.00" || e.penaltyMillion !== "0.00")
      )
        violations.push(
          `step ${step}: ${e.milestoneId} pays while ${e.decision}`,
        );
    }
    // Authority (spec 4.2): app-recorded business events name the party of the right side.
    for (const e of w
      .tbl("events")
      .filter((x) => x.origin === "APP" && SPEC_AUTHORITY[x.event_type])) {
      const party = w
        .tbl("parties")
        .find((p) => p.party_id === e.actor_party_id);
      if (party.party_type !== SPEC_AUTHORITY[e.event_type])
        violations.push(
          `step ${step}: ${e.event_id} ${e.event_type} recorded by a ${party.party_type}`,
        );
    }
  }
  assert.ok(
    succeeded >= 10,
    `only ${succeeded} actions succeeded; the sequence exercised too little`,
  );
  assert.deepEqual(violations.slice(0, 10), []);
  const report = await w.call(U.AUDITOR, "integrity", "verifyIntegrity");
  assert.equal(report.chain.ok, true);
  assert.deepEqual(report.evidence.problems, []);
  assert.equal(report.decisions.matched, report.decisions.checked);
});

// @@APPEND@@
