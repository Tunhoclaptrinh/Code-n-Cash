import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execute = promisify(execFile);
import { Repository } from "../../apps/api/dist/common/repository.js";
import { BaseService } from "../../apps/api/dist/common/services/base.service.js";
import { DomainService } from "../../apps/api/dist/domain/service.js";
import { AuthService } from "../../apps/api/dist/auth.js";
import { WorkflowService } from "../../apps/api/dist/workflow.controller.js";
import { DocumentsController } from "../../apps/api/dist/documents.js";
import { TrustService } from "../../apps/api/dist/trust/service.js";
import { ExtractionService } from "../../apps/api/dist/trust/extraction-service.js";
import { RulesService } from "../../apps/api/dist/trust/rules-service.js";
import { LocalTermExtractor } from "../../apps/api/dist/trust/extraction.js";
import {
  createLocalProof,
  verifyLocalProof,
} from "../../apps/api/dist/trust/crypto.js";
import {
  canonical,
  verifyChain,
} from "../../apps/api/dist/common/audit-chain.js";
import { auditContext } from "../../apps/api/dist/common/audit-events.js";
import {
  draftProblems,
  fieldProblem,
} from "../../apps/api/dist/common/field-validation.js";
import { verifyBundle } from "../../scripts/verify-trust.mjs";

let dir, repo, base, domain, workflow, trust, extraction, rules, docs, actors;
const call = (id, module, action, ...args) =>
  workflow.call(module, action, { args }, actors[id]);
before(async () => {
  dir = await mkdtemp(join(tmpdir(), "codecash-trust-"));
  process.env.REPO_ROOT = process.cwd();
  process.env.DATA_DIR = dir;
  process.env.TRUST_DIR = join(dir, "trust");
  process.env.STORAGE_DRIVER = "file";
  repo = new Repository();
  await repo.init();
  base = new BaseService(repo);
  domain = new DomainService(repo, base);
  await domain.bootstrap();
  const auth = new AuthService(repo);
  await auth.seed();
  actors = Object.fromEntries(
    (await repo.list("users")).map((user) => [user.id, auth.actor(user)]),
  );
  workflow = new WorkflowService(domain);
  trust = new TrustService(repo, base, domain);
  extraction = new ExtractionService(repo, domain);
  rules = new RulesService(repo, base);
  docs = new DocumentsController(repo, base);
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

test("shared form rules reject whitespace, impossible dates, fractional days and excess money precision", () => {
  assert.equal(
    fieldProblem({ key: "name", type: "string", required: true }, "  "),
    "REQUIRED:name",
  );
  assert.equal(
    fieldProblem({ key: "email", type: "email" }, "bad@"),
    "INVALID_EMAIL",
  );
  const valid = {
    title: "Contract",
    valueMillion: "1000.00",
    startDate: "2028-02-29",
    endDate: "2028-03-01",
    graceDays: 5,
    penaltyRatePct: "0.10",
    maxPenaltyPct: "8.00",
  };
  assert.deepEqual(draftProblems(valid), {});
  for (const [key, value] of [
    ["startDate", "2027-02-29"],
    ["endDate", "2028-01-01"],
    ["valueMillion", "1000.001"],
    ["graceDays", 1.5],
    ["penaltyRatePct", "5.01"],
    ["maxPenaltyPct", "100.01"],
  ])
    assert.ok(
      Object.keys(draftProblems({ ...valid, [key]: value })).length,
      key,
    );
});

test("audit records actual redacted deltas and request context; rollback cannot append success", async () => {
  const actor = actors["u-sysadmin"];
  await auditContext.run(
    { requestId: "audit-test", method: "POST", path: "/test", actor },
    () =>
      repo.mutate(
        "audit-fixture",
        (rows) =>
          rows.push({
            id: "redacted",
            version: 1,
            createdAt: "now",
            updatedAt: "now",
            name: "Before",
            passwordHash: "NEVER_LOG_HASH",
            token: "NEVER_LOG_TOKEN",
          }),
        base.auditRecord("CREATE", "audit-fixture", "redacted", actor),
      ),
  );
  const created = (await repo.list("audit")).at(-1);
  assert.equal(created.requestId, "audit-test");
  assert.equal(created.actorRole, "SYSTEM_ADMIN");
  assert.deepEqual(created.changes[0].fields.name, {
    before: null,
    after: "Before",
  });
  assert.doesNotMatch(JSON.stringify(created), /NEVER_LOG|passwordHash|token/);
  const count = (await repo.list("audit")).length;
  await assert.rejects(
    repo.mutate(
      "audit-fixture",
      (rows) => {
        rows[0].name = "Rolled back";
        throw new Error("ROLLBACK");
      },
      base.auditRecord("UPDATE", "audit-fixture", "redacted", actor),
    ),
  );
  assert.equal((await repo.list("audit")).length, count);
  assert.equal((await repo.list("audit-fixture"))[0].name, "Before");
  await repo.mutate(
    "audit-fixture",
    (rows) => {
      rows[0].name = "After";
    },
    base.auditRecord("UPDATE", "audit-fixture", "redacted", actor),
  );
  assert.deepEqual((await repo.list("audit")).at(-1).changes[0].fields.name, {
    before: "Before",
    after: "After",
  });
});

test("local extraction requires unambiguous source evidence and never guesses missing terms", () => {
  const extractor = new LocalTermExtractor();
  const source =
    "Contract value: 1,250.50 million\nGrace period: 5 days\nPenalty rate: 0.25% per day\fPenalty cap: 8%\nStart date: 01/12/2026\nEnd date: 2027-12-01";
  const fields = Object.fromEntries(
    extractor.extract(source).map((field) => [field.path, field]),
  );
  assert.equal(fields.valueMillion.value, "1250.50");
  assert.equal(fields.startDate.value, "2026-12-01");
  assert.equal(fields.maxPenaltyPct.evidence.page, 2);
  assert.equal(fields.maxPenaltyPct.evidence.quote, "Penalty cap: 8%");
  for (const field of Object.values(fields))
    assert.equal(field.state, "SUGGESTED");
  const conflicted = extractor.extract(source + "\nGrace: 9 days");
  assert.equal(
    conflicted.find((field) => field.path === "graceDays").value,
    null,
  );
  assert.ok(
    extractor
      .extract("scanned image without text")
      .every((field) => field.value === null && field.evidence === null),
  );
});

test("uploaded DOCX is bound to the draft, extracted with provenance and needs explicit review", async () => {
  const draft = await call("u-legal", "drafts", "getContractDraft", "CT0101");
  const saved = await call("u-legal", "drafts", "saveContractDraft", {
    ...draft,
    title: "Extracted contract",
    file: { name: "terms.docx", kind: "DOCX", sizeBytes: 1000 },
  });
  const { SampleDocumentsController } =
    await import("../../apps/api/dist/sample-documents.js");
  const sample = await new SampleDocumentsController(domain).create(
    {
      draft: {
        ...saved,
        valueMillion: "1250.50",
        graceDays: 5,
        penaltyRatePct: "0.25",
        maxPenaltyPct: "8.00",
        startDate: "2026-12-01",
        endDate: "2027-12-01",
      },
      language: "en",
    },
    { user: actors["u-legal"] },
  );
  const bytes = Buffer.from(sample.base64, "base64");
  const document = await docs.upload(
    saved.code,
    { buffer: bytes, size: bytes.length, originalname: "terms.docx" },
    { user: actors["u-legal"] },
  );
  assert.equal(
    (await call("u-legal", "drafts", "getContractDraft", saved.code)).file
      .sha256,
    document.sha256,
  );
  await assert.rejects(extraction.extract(saved.code, actors["u-supplier"]));
  await assert.rejects(
    call("u-legal", "drafts", "confirmDigitization", saved.code, {
      dueDate: "2028-12-01",
    }),
    /EXTRACTION_REVIEW_REQUIRED/,
  );
  const proposal = await extraction.extract(saved.code, actors["u-legal"]);
  assert.equal(proposal.extractor.kind, "TEXT_RULES");
  assert.equal(proposal.documentSha256, document.sha256);
  const values = Object.fromEntries(
    proposal.fields.map((field) => [field.path, field.value]),
  );
  assert.ok(Object.values(values).every((value) => value !== null));
  await extraction.confirm(saved.code, proposal.id, values, actors["u-legal"]);
  await assert.rejects(
    extraction.confirm(saved.code, proposal.id, values, actors["u-legal"]),
    /EXTRACTION_ALREADY_CONFIRMED/,
  );
  const current = await call(
    "u-legal",
    "drafts",
    "getContractDraft",
    saved.code,
  );
  assert.equal(current.valueMillion, "1250.50");
  assert.equal(current.penaltyRatePct, "0.25");
  await placeActualSignatures(saved.code);
  await call("u-legal", "drafts", "confirmDigitization", saved.code, {
    dueDate: "2028-12-01",
  });
});

test("signing rejects expired requests, changed bytes and duplicate confirmation, then verifies offline", async () => {
  const code = "CT0101";
  const overview = await call("u-owner", "signing", "getSigningOverview", code);
  const step = overview.steps.find((item) => item.status === "CURRENT");
  const signer = step.signerUserId;
  await call(
    signer,
    "signing",
    "sendSigningRequest",
    code,
    step.stepNo,
    "USB_TOKEN",
  );
  await repo.mutate("signing-requests", (rows) => {
    rows.at(-1).expiresAt = "2000-01-01T00:00:00.000Z";
  });
  await assert.rejects(
    call(signer, "signing", "confirmSigningRequest", code, step.stepNo),
    /REQUEST_EXPIRED/,
  );
  await call(
    signer,
    "signing",
    "sendSigningRequest",
    code,
    step.stepNo,
    "USB_TOKEN",
  );
  const draft = (await repo.list("contract-drafts")).find(
    (row) => row.code === code,
  );
  const path = join(dir, "uploads", draft.file.documentId),
    original = await readFile(path);
  await writeFile(path, "changed bytes");
  await assert.rejects(
    call(signer, "signing", "confirmSigningRequest", code, step.stepNo),
    /DOCUMENT_CHANGED/,
  );
  await writeFile(path, original);
  await call(signer, "signing", "confirmSigningRequest", code, step.stepNo);
  await assert.rejects(
    call(signer, "signing", "confirmSigningRequest", code, step.stepNo),
    /REQUEST_NOT_PENDING/,
  );
  let verified = await call("u-owner", "signing", "getVerification", code);
  assert.equal(verified.signatures[0].status, "VALID");
  assert.equal(verified.signatures[0].certificateTrusted, false);
  const bundle = await trust.signatureBundle(code, actors["u-owner"]);
  assert.equal(
    verifyBundle(bundle, { document: original }).result,
    "CRYPTO_VALID_UNTRUSTED_KEY",
  );
  assert.equal(
    verifyBundle(bundle, {
      document: original,
      fingerprints: [bundle.proofs[0].keyFingerprint],
    }).result,
    "VERIFIED_LOCAL_KEY",
  );
  assert.equal(
    verifyBundle(bundle, { document: Buffer.from("tampered") }).valid,
    false,
  );
  await writeFile(path, "tampered");
  verified = await call("u-owner", "signing", "getVerification", code);
  assert.equal(verified.signatures[0].status, "INVALID");
  await writeFile(path, original);
  const altered = structuredClone(bundle.proofs[0]);
  altered.payload.signerUserId = "forged";
  assert.equal(verifyLocalProof(altered), false);
});

test("legacy seeded signatures are explicitly unverified and idle polling creates no audit noise", async () => {
  const before = (await repo.list("audit")).length;
  await call("u-supplier", "signing", "getSigningRequest", "CT0102", 2);
  assert.equal((await repo.list("audit")).length, before);
  const verification = await call(
    "u-owner",
    "signing",
    "getVerification",
    "CT0102",
  );
  assert.equal(verification.signatures[0].status, "UNVERIFIED");
});

test("rule versions validate the DSL and 20 labels, require a second publisher and pin future contracts", async () => {
  const author = actors["u-sysadmin"],
    reviewer = {
      ...author,
      id: "second-admin",
      displayName: "Second reviewer",
    };
  let version = await rules.create(
    { name: "Version one", reason: "Validate local configuration" },
    author,
  );
  const invalid = structuredClone(version.rules);
  invalid[0].condition_expression = "FALSE AND __import__('os')";
  let saved = await rules.save(
    version.id,
    { version: version.version, rules: invalid, templates: version.templates },
    author,
  );
  await assert.rejects(
    rules.submit(saved.id, saved.version, author),
    /RULE_VERSION_INVALID/,
  );
  saved = await rules.save(
    version.id,
    {
      version: saved.version,
      rules: version.rules,
      templates: version.templates,
    },
    author,
  );
  version = await rules.submit(saved.id, saved.version, author);
  assert.equal(version.validation.matched, 20);
  assert.equal(version.validation.evaluated, 405);
  await assert.rejects(
    rules.publish(version.id, version.version, author),
    /SECOND_REVIEWER_REQUIRED/,
  );
  version = await rules.publish(version.id, version.version, reviewer);
  await assert.rejects(
    rules.save(
      version.id,
      {
        version: version.version,
        rules: version.rules,
        templates: version.templates,
      },
      author,
    ),
    /RULE_VERSION_LOCKED/,
  );
  const original = await call("u-legal", "drafts", "getContractDraft");
  const draft = await call("u-legal", "drafts", "saveContractDraft", {
    ...original,
    title: "Pinned version",
    file: { name: "pinned.pdf", sizeBytes: 1000, kind: "PDF" },
  });
  assert.equal(draft.ruleVersion.id, version.id);
  const contract = (await repo.list("contracts")).find(
    (row) => row.contract_id === draft.code,
  );
  assert.ok(contract.rule_set_id.includes("~"));
  let second = await rules.create(
    { name: "Version two", reason: "Next version" },
    author,
  );
  second = await rules.submit(second.id, second.version, author);
  await rules.publish(second.id, second.version, reviewer);
  const resaved = await call("u-legal", "drafts", "saveContractDraft", draft);
  assert.equal(
    resaved.ruleVersion.id,
    version.id,
    "retired version remains pinned",
  );
  assert.equal(
    (await repo.list("contracts"))
      .find((row) => row.contract_id === "CT0001")
      .rule_set_id.includes("~"),
    false,
  );
});

test("anchor outbox is durable, idempotent, independently verifiable and detects rewritten history", async () => {
  const actor = actors["u-admin"],
    id = randomUUID();
  const jobs = await Promise.all([
    trust.request(id, actor),
    trust.request(id, actor),
  ]);
  assert.equal(jobs[0].status, "CONFIRMED");
  assert.equal(jobs[1].id, id);
  assert.equal(
    (await repo.list("anchor-jobs")).filter((job) => job.id === id).length,
    1,
  );
  const bundle = await trust.bundle(id, actor);
  assert.equal((await trust.check(bundle)).result, "MATCH");
  const records = JSON.parse(await readFile(repo.path, "utf8"));
  const key = trust.status().witnessKeyFingerprint;
  assert.equal(
    verifyBundle(bundle, { records, fingerprints: [key] }).result,
    "VERIFIED_LOCAL_KEY",
  );
  const tampered = structuredClone(bundle);
  tampered.receipt.payload.observedAt = "forged";
  assert.equal((await trust.check(tampered)).result, "MISMATCH");
  records.audit[1].action = "forged";
  assert.equal(
    verifyBundle(bundle, { records, fingerprints: [key] }).valid,
    false,
  );
  const restored = new Repository();
  await restored.init();
  assert.equal(
    (await restored.list("anchor-jobs")).find((job) => job.id === id).status,
    "CONFIRMED",
  );
  await restored.onModuleDestroy();
  assert.equal(verifyChain(await repo.list("audit")).ok, true);
  assert.ok(canonical(bundle).includes("AUDIT_ANCHOR"));
});

test("witness outage keeps a failed durable job that can retry without duplicating business work", async () => {
  const actor = actors["u-admin"];
  const witnessDir = join(dir, "unavailable");
  await writeFile(witnessDir, "not a directory");
  const originalDir = process.env.TRUST_DIR;
  process.env.TRUST_DIR = witnessDir;
  const job = await trust.request(randomUUID(), actor);
  assert.equal(job.status, "FAILED");
  assert.equal(job.attempts, 1);
  process.env.TRUST_DIR = originalDir;
  const retried = await trust.retry(job.id, actor);
  assert.equal(retried.status, "CONFIRMED");
  assert.equal(retried.attempts, 2);
  assert.equal((await trust.retry(job.id, actor)).attempts, 2);
});

test("rule impact preview compares all 405 inputs, exposes regressions and persists nothing", async () => {
  const version = await rules.create(
    { name: "Impact preview", reason: "Check candidate before saving" },
    actors["u-sysadmin"],
  );
  const before = await readFile(repo.path, "utf8");
  const baseline = await rules.preview(version.id, {
    version: version.version,
    rules: version.rules,
    templates: version.templates,
  });
  assert.equal(baseline.evaluated, 405);
  assert.equal(baseline.matched, 20);
  assert.equal(baseline.changed, 0);
  assert.equal(baseline.canSubmit, true);
  const candidate = structuredClone(version.rules);
  for (const rule of candidate) rule.payable_amount_formula = "0";
  const impact = await rules.preview(version.id, {
    version: version.version,
    rules: candidate,
    templates: version.templates,
  });
  assert.ok(impact.changed > 0);
  assert.ok(impact.matched < impact.samples);
  assert.equal(impact.canSubmit, false);
  assert.ok(impact.changes.every((row) => row.before && row.after));
  const malicious = structuredClone(version.rules);
  malicious[0].condition_expression = "FALSE AND __import__('os')";
  await assert.rejects(
    rules.preview(version.id, {
      version: version.version,
      rules: malicious,
      templates: version.templates,
    }),
    /RULE_VERSION_INVALID/,
  );
  await assert.rejects(
    rules.preview(version.id, {
      version: version.version + 1,
      rules: version.rules,
      templates: version.templates,
    }),
    /VERSION_CONFLICT/,
  );
  assert.equal(await readFile(repo.path, "utf8"), before);
});

test("rule publication rejects unlabelled regressions even when all 20 public samples still pass", async () => {
  const author = actors["u-sysadmin"];
  let version = await rules.create(
    { name: "Unlabelled regression", reason: "Protect full BTC pack" },
    author,
  );
  const candidate = structuredClone(version.rules);
  const release = candidate.find(
    (rule) =>
      rule.release_rule_code === "R_GOODS_STD:SIGNING" &&
      rule.priority === "70",
  );
  release.condition_expression = "FALSE";
  const impact = await rules.preview(version.id, {
    version: version.version,
    rules: candidate,
    templates: version.templates,
  });
  assert.equal(impact.matched, 20);
  assert.equal(impact.invariantViolations, 0);
  assert.ok(impact.changed > 0);
  assert.equal(impact.canSubmit, false);
  assert.equal(impact.compatibilityPolicy, "BTC_FULL_PACK_V1");
  version = await rules.save(
    version.id,
    {
      version: version.version,
      rules: candidate,
      templates: version.templates,
    },
    author,
  );
  await assert.rejects(
    rules.submit(version.id, version.version, author),
    /RULE_VERSION_REGRESSION/,
  );
  assert.equal(
    (await repo.list("rule-versions")).find((row) => row.id === version.id)
      .status,
    "DRAFT",
  );
});

test("real sample DOCX supports 1–4 signers through upload, extraction, sequential signing and activation", async () => {
  const { SampleDocumentsController } =
    await import("../../apps/api/dist/sample-documents.js");
  const { documentText } =
    await import("../../apps/api/dist/trust/extraction.js");
  const samples = new SampleDocumentsController(domain);
  for (const count of [1, 2, 3, 4]) {
    const current = await call("u-legal", "drafts", "getContractDraft");
    const options = await call("u-legal", "drafts", "getUploadFormOptions");
    const supplierId = "S015";
    const signers = [
      { party: "BUYER", userId: "u-owner" },
      {
        party: "SUPPLIER",
        userId: options.supplierSigners[supplierId][0].userId,
      },
      { party: "BUYER", userId: "u-finance" },
      { party: "BUYER", userId: "u-secondary" },
    ].slice(0, count);
    const input = {
      ...current,
      title: `Sample ${count} <signers> & terms`,
      documentBody:
        "CUSTOM_CLAUSE {{title}} for {{buyer}} at {{valueMillion}} <safe> & {literal}",
      supplierId,
      signers,
      valueMillion: "1250.50",
      penaltyRatePct: "0.25",
      maxPenaltyPct: "8.00",
      graceDays: 5,
    };
    const docCount = (await repo.list("documents")).length;
    await assert.rejects(
      samples.create(
        { draft: input, language: "en" },
        { user: actors["u-supplier"] },
      ),
    );
    await assert.rejects(
      samples.create(
        { draft: { ...input, signers: [] }, language: "en" },
        { user: actors["u-legal"] },
      ),
      /SIGNER_COUNT/,
    );
    await assert.rejects(
      samples.create(
        {
          draft: {
            ...input,
            signers: [
              { party: "BUYER", userId: "u-owner" },
              { party: "BUYER", userId: "u-finance" },
            ],
          },
          language: "en",
        },
        { user: actors["u-legal"] },
      ),
      /SIGNERS_BOTH_SIDES/,
    );
    const generated = await samples.create(
      { draft: input, language: count % 2 ? "vi" : "en" },
      { user: actors["u-legal"] },
    );
    assert.equal(
      (await repo.list("documents")).length,
      docCount,
      "generation is not a draft save or upload",
    );
    const bytes = Buffer.from(generated.base64, "base64");
    assert.equal(bytes.subarray(0, 2).toString(), "PK");
    if (count === 1 || count === 4) {
      const { previewPdf } =
        await import("../../apps/api/dist/document-preview.js");
      const pdf = await previewPdf(bytes, "DOCX");
      assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
      const pdfPath = join(dir, `rendered-${count}.pdf`);
      await writeFile(pdfPath, pdf);
      const info = await execute("pdfinfo", [pdfPath]);
      assert.match(info.stdout, /Pages:\s+[1-9]\d*/);
      const extracted = await execute("pdftotext", [pdfPath, "-"]);
      assert.ok(extracted.stdout.includes("1250.50"));
    }
    const path = join(dir, `sample-${count}.docx`);
    await writeFile(path, bytes);
    const text = await documentText(path, "DOCX");
    assert.ok(
      text.includes(input.title),
      "OOXML safely roundtrips special characters",
    );
    assert.ok(text.includes(`CUSTOM_CLAUSE ${input.title}`));
    assert.ok(text.includes("<safe> & {literal}"));
    assert.ok(!text.includes("{{buyer}}"));
    const fields = new LocalTermExtractor().extract(text);
    assert.ok(
      fields.every((field) => field.value !== null),
      JSON.stringify(fields),
    );
    const saved = await call("u-legal", "drafts", "saveContractDraft", {
      ...input,
      file: {
        name: generated.fileName,
        kind: "DOCX",
        sizeBytes: bytes.length,
        pages: 14,
      },
    });
    await docs.upload(
      saved.code,
      { buffer: bytes, size: bytes.length, originalname: generated.fileName },
      { user: actors["u-legal"] },
    );
    let appendix;
    if (count === 1) {
      const file = {
        buffer: bytes,
        size: bytes.length,
        originalname: "Appendix-terms.docx",
      };
      appendix = await docs.appendix(saved.code, file, {
        user: actors["u-legal"],
      });
      assert.equal(
        (await docs.appendix(saved.code, file, { user: actors["u-legal"] })).id,
        appendix.id,
        "retry does not duplicate an appendix",
      );
      const currentDraft = await call(
        "u-legal",
        "drafts",
        "getContractDraft",
        saved.code,
      );
      assert.equal(currentDraft.appendixDocuments[0].sha256, appendix.sha256);
      assert.deepEqual(currentDraft.appendixNames, [file.originalname]);
    }
    const proposal = await extraction.extract(saved.code, actors["u-legal"]);
    assert.equal(proposal.extractor.kind, "TEXT_RULES");
    await extraction.confirm(
      saved.code,
      proposal.id,
      Object.fromEntries(
        proposal.fields.map((field) => [field.path, field.value]),
      ),
      actors["u-legal"],
    );
    await placeActualSignatures(saved.code);
    await call("u-legal", "drafts", "confirmDigitization", saved.code, {
      dueDate: input.endDate,
    });
    const { ContractFilesController } =
      await import("../../apps/api/dist/contract-files.js");
    const contractFiles = new ContractFilesController(domain, repo);
    const supplierRequest = { user: actors["u-supplier"] };
    assert.ok(
      (await contractFiles.list(saved.code, supplierRequest)).length > 0,
    );
    await assert.rejects(
      contractFiles.list("CT0001", supplierRequest),
      /CONTRACT_ACCESS_DENIED/,
    );
    await assert.rejects(
      contractFiles.preview(saved.code, randomUUID(), supplierRequest, {}),
      /RECORD_NOT_FOUND/,
    );
    if (appendix) {
      await assert.rejects(
        docs.appendix(
          saved.code,
          { buffer: bytes, size: bytes.length, originalname: "late.docx" },
          { user: actors["u-legal"] },
        ),
        /DRAFT_LOCKED/,
      );
      let downloaded;
      const response = {
        type() {
          return this;
        },
        setHeader() {
          return this;
        },
        send(value) {
          downloaded = value;
        },
      };
      await contractFiles.download(
        saved.code,
        appendix.id,
        supplierRequest,
        response,
      );
      assert.deepEqual(downloaded, bytes);
      await writeFile(join(dir, "uploads", appendix.id), "tampered");
      await assert.rejects(
        contractFiles.download(
          saved.code,
          appendix.id,
          supplierRequest,
          response,
        ),
        /DOCUMENT_CHANGED/,
      );
      await assert.rejects(
        call(
          signers[0].userId,
          "signing",
          "sendSigningRequest",
          saved.code,
          1,
          "USB_TOKEN",
        ),
        /DOCUMENT_CHANGED/,
      );
      await writeFile(join(dir, "uploads", appendix.id), bytes);
    }
    for (const [index, signer] of signers.entries()) {
      await call(
        signer.userId,
        "signing",
        "sendSigningRequest",
        saved.code,
        index + 1,
        "USB_TOKEN",
      );
      await call(
        signer.userId,
        "signing",
        "confirmSigningRequest",
        saved.code,
        index + 1,
      );
    }
    const verified = await call(
      "u-owner",
      "signing",
      "getVerification",
      saved.code,
    );
    assert.equal(verified.signatures.length, count);
    assert.ok(
      verified.signatures.every(
        (signature) =>
          signature.status === "VALID" &&
          signature.certificateTrusted === false,
      ),
    );
    assert.ok(verified.effectiveAt);
    assert.equal(
      (await repo.list("events")).filter(
        (event) =>
          event.contract_id === saved.code &&
          event.event_type === "CONTRACT_SIGNED",
      ).length,
      1,
    );
    await assert.rejects(
      call(
        signers.at(-1).userId,
        "signing",
        "confirmSigningRequest",
        saved.code,
        count,
      ),
      /REQUEST_NOT_PENDING/,
    );
  }
});

test("HTTP signing bridge binds proofs to the payload and pinned key, with no local fallback", async () => {
  const { HttpSigningProvider } =
    await import("../../apps/api/dist/trust/signing-provider.js");
  const { localKey } = await import("../../apps/api/dist/trust/crypto.js");
  const signer = "test-bridge";
  const provider = new HttpSigningProvider(
    "https://signer.example.test/sign",
    "test-token",
    localKey(signer).keyFingerprint,
  );
  const payload = {
    requestId: "request-1",
    documentDigest: "a".repeat(64),
    signerUserId: "u-owner",
  };
  const original = globalThis.fetch;
  const requests = [];
  try {
    globalThis.fetch = async (url, options) => {
      requests.push({ url, options });
      const body = JSON.parse(options.body);
      return Response.json(createLocalProof(signer, body.payload));
    };
    const proof = await provider.sign(signer, payload);
    assert.equal(provider.simulated, false);
    assert.equal(provider.verify(signer, proof), true);
    await provider.sign(signer, payload);
    assert.equal(
      requests[0].options.headers["Idempotency-Key"],
      requests[1].options.headers["Idempotency-Key"],
    );
    assert.equal(
      requests[0].options.headers.Authorization,
      "Bearer test-token",
    );
    assert.equal(
      JSON.parse(requests[0].options.body).schema,
      "codecash.detached-signature.v1",
    );
    globalThis.fetch = async () =>
      Response.json(
        createLocalProof(signer, { ...payload, signerUserId: "forged" }),
      );
    await assert.rejects(
      provider.sign(signer, payload),
      /SIGNATURE_PROVIDER_ERROR/,
    );
    globalThis.fetch = async () =>
      Response.json(createLocalProof("untrusted-bridge", payload));
    await assert.rejects(
      provider.sign(signer, payload),
      /SIGNATURE_PROVIDER_ERROR/,
    );
    globalThis.fetch = async () => new Response("rejected", { status: 503 });
    await assert.rejects(
      provider.sign(signer, payload),
      /SIGNATURE_PROVIDER_ERROR/,
    );
    globalThis.fetch = async () => {
      throw new Error("network unavailable");
    };
    await assert.rejects(
      provider.sign(signer, payload),
      /SIGNATURE_PROVIDER_ERROR/,
    );
    assert.throws(
      () =>
        new HttpSigningProvider(
          "http://remote.test/sign",
          "token",
          "a".repeat(64),
        ),
      /HTTPS/,
    );
    assert.throws(
      () =>
        new HttpSigningProvider("https://remote.test/sign", "", "a".repeat(64)),
      /requires/,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("rule language catalog and diagnostics share the engine vocabulary without writes", async () => {
  const before = await repo.list("audit");
  const catalog = await rules.language();
  assert.equal(catalog.variables.length, 17);
  assert.deepEqual(
    catalog.variables.find((row) => row.name === "penalty_amount_vnd_mn")
      .fields,
    ["payable_amount_formula"],
  );
  const result = await rules.checkExpressions({
    rules: [
      {
        rule_id: "CHECK",
        priority: "70",
        condition_expression: "open_dispute == FALSE",
        penalty_amount_formula: "penalty_amount_vnd_mn",
        payable_amount_formula: "TRUE",
      },
    ],
  });
  assert.equal(result.valid, false);
  assert.equal(result.checked, 3);
  assert.deepEqual(
    result.issues.map((issue) => [issue.field, issue.code]),
    [
      ["penalty_amount_formula", "VARIABLE_UNAVAILABLE"],
      ["payable_amount_formula", "NUMBER_REQUIRED"],
    ],
  );
  assert.deepEqual(await repo.list("audit"), before);
  await assert.rejects(rules.checkExpressions({ rules: [] }), {
    message: "RULE_VERSION_INVALID",
  });
});

test("rule diagnostics are read-only; full-pack preview catches regressions outside the 20 samples", async () => {
  const author = actors["u-sysadmin"];
  const version = await rules.create(
    {
      name: "Explain rule language",
      reason: "Test all branches and full-pack gate",
    },
    author,
  );
  const before = (await repo.list("audit")).length;
  assert.equal((await rules.language()).variables.length, 17);
  assert.deepEqual(await rules.checkExpressions({ rules: version.rules }), {
    valid: true,
    checked: 384,
    issues: [],
  });
  const invalid = structuredClone(version.rules);
  invalid[0].condition_expression = "open_dispute == 1";
  const result = await rules.checkExpressions({ rules: invalid });
  assert.equal(result.valid, false);
  assert.equal(result.issues[0].code, "TYPE_MISMATCH");
  assert.equal(result.issues[0].field, "condition_expression");
  await assert.rejects(
    rules.checkExpressions({ rules: [] }),
    /RULE_VERSION_INVALID/,
  );
  const wrongUnit = structuredClone(version.rules);
  wrongUnit[0].payable_amount_formula =
    "planned_payment_vnd_mn + grace_period_days";
  const unitResult = await rules.checkExpressions({ rules: wrongUnit });
  assert.equal(unitResult.valid, false);
  assert.equal(unitResult.issues[0].code, "UNIT_MISMATCH");
  const noPercentConversion = structuredClone(version.rules);
  noPercentConversion.find(
    (row) => row.rule_id === "PR0006",
  ).penalty_amount_formula =
    "days_late_after_grace * penalty_rate_pct_per_day * planned_payment_vnd_mn";
  assert.equal(
    (await rules.checkExpressions({ rules: noPercentConversion })).issues[0]
      .code,
    "PERCENT_CONVERSION_REQUIRED",
  );
  const zeroDenominator = structuredClone(version.rules);
  zeroDenominator.find(
    (row) => row.rule_id === "PR0023",
  ).payable_amount_formula =
    "planned_payment_vnd_mn / (required_event_completion_rate - required_event_completion_rate)";
  assert.equal(
    (await rules.checkExpressions({ rules: zeroDenominator })).valid,
    true,
  );
  await assert.rejects(
    rules.preview(version.id, {
      version: version.version,
      rules: zeroDenominator,
      templates: version.templates,
    }),
    /RULE_EVALUATION_FAILED/,
  );
  const baseline = await rules.preview(version.id, {
    version: version.version,
    rules: version.rules,
    templates: version.templates,
  });
  assert.equal(baseline.evaluated, 405);
  assert.equal(baseline.matched, 20);
  assert.equal(baseline.changed, 0);
  assert.equal(baseline.canSubmit, true);
  const modified = structuredClone(version.rules);
  const target = modified.find((row) => row.rule_id === "PR0023");
  target.condition_expression += " AND planned_payment_vnd_mn != 258.00";
  const preview = await rules.preview(version.id, {
    version: version.version,
    rules: modified,
    templates: version.templates,
  });
  assert.equal(
    preview.matched,
    20,
    "public examples alone cannot protect the full pack",
  );
  assert.ok(preview.changed > 0);
  assert.equal(preview.canSubmit, false);
  assert.ok(preview.changes.some((row) => row.milestoneId === "MS0001"));
  assert.equal(
    (await repo.list("audit")).length,
    before,
    "diagnostics and preview do not write business state",
  );
  const saved = await rules.save(
    version.id,
    { version: version.version, rules: modified, templates: version.templates },
    author,
  );
  await assert.rejects(
    rules.submit(saved.id, saved.version, author),
    /RULE_VERSION_REGRESSION/,
  );
});
