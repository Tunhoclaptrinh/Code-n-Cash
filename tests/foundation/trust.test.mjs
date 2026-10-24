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
import { createLocalProof, verifyLocalProof } from "../../apps/api/dist/trust/crypto.js";
import { canonical, verifyChain } from "../../apps/api/dist/common/audit-chain.js";
import { auditContext } from "../../apps/api/dist/common/audit-events.js";
import { draftProblems, fieldProblem } from "../../apps/api/dist/common/field-validation.js";
import { verifyBundle } from "../../scripts/verify-trust.mjs";

let dir, repo, base, domain, workflow, trust, extraction, rules, docs, actors;
const call = (id, module, action, ...args) => workflow.call(module, action, {args}, actors[id]);
before(async () => {
  dir = await mkdtemp(join(tmpdir(), "codecash-trust-"));
  process.env.REPO_ROOT = process.cwd();
  process.env.DATA_DIR = dir;
  process.env.TRUST_DIR = join(dir, "trust");
  process.env.STORAGE_DRIVER = "file";
  repo = new Repository(); await repo.init();
  base = new BaseService(repo); domain = new DomainService(repo, base); await domain.bootstrap();
  const auth = new AuthService(repo); await auth.seed();
  actors = Object.fromEntries((await repo.list("users")).map((user) => [user.id, auth.actor(user)]));
  workflow = new WorkflowService(domain); trust = new TrustService(repo, base, domain);
  extraction = new ExtractionService(repo, domain); rules = new RulesService(repo, base); docs = new DocumentsController(repo, base);
});
after(async () => { await repo.onModuleDestroy(); await rm(dir, {recursive: true, force: true}); });

test("shared form rules reject whitespace, impossible dates, fractional days and excess money precision", () => {
  assert.equal(fieldProblem({key: "name", type: "string", required: true}, "  "), "REQUIRED:name");
  assert.equal(fieldProblem({key: "email", type: "email"}, "bad@"), "INVALID_EMAIL");
  const valid = {title: "Contract", valueMillion: "1000.00", startDate: "2028-02-29", endDate: "2028-03-01", graceDays: 5, penaltyRatePct: "0.10", maxPenaltyPct: "8.00"};
  assert.deepEqual(draftProblems(valid), {});
  for (const [key, value] of [["startDate", "2027-02-29"], ["endDate", "2028-01-01"], ["valueMillion", "1000.001"], ["graceDays", 1.5], ["penaltyRatePct", "5.01"], ["maxPenaltyPct", "100.01"]]) assert.ok(Object.keys(draftProblems({...valid, [key]: value})).length, key);
});

test("audit records actual redacted deltas and request context; rollback cannot append success", async () => {
  const actor = actors["u-sysadmin"];
  await auditContext.run({requestId: "audit-test", method: "POST", path: "/test", actor}, () => repo.mutate("audit-fixture", (rows) => rows.push({id: "redacted", version: 1, createdAt: "now", updatedAt: "now", name: "Before", passwordHash: "NEVER_LOG_HASH", token: "NEVER_LOG_TOKEN"}), base.auditRecord("CREATE", "audit-fixture", "redacted", actor)));
  const created = (await repo.list("audit")).at(-1);
  assert.equal(created.requestId, "audit-test"); assert.equal(created.actorRole, "SYSTEM_ADMIN");
  assert.deepEqual(created.changes[0].fields.name, {before: null, after: "Before"});
  assert.doesNotMatch(JSON.stringify(created), /NEVER_LOG|passwordHash|token/);
  const count = (await repo.list("audit")).length;
  await assert.rejects(repo.mutate("audit-fixture", (rows) => {rows[0].name = "Rolled back"; throw new Error("ROLLBACK");}, base.auditRecord("UPDATE", "audit-fixture", "redacted", actor)));
  assert.equal((await repo.list("audit")).length, count);
  assert.equal((await repo.list("audit-fixture"))[0].name, "Before");
  await repo.mutate("audit-fixture", (rows) => {rows[0].name = "After";}, base.auditRecord("UPDATE", "audit-fixture", "redacted", actor));
  assert.deepEqual((await repo.list("audit")).at(-1).changes[0].fields.name, {before: "Before", after: "After"});
});

test("local extraction requires unambiguous source evidence and never guesses missing terms", () => {
  const extractor = new LocalTermExtractor();
  const source = "Contract value: 1,250.50 million\nGrace period: 5 days\nPenalty rate: 0.25% per day\fPenalty cap: 8%\nStart date: 01/12/2026\nEnd date: 2027-12-01";
  const fields = Object.fromEntries(extractor.extract(source).map((field) => [field.path, field]));
  assert.equal(fields.valueMillion.value, "1250.50"); assert.equal(fields.startDate.value, "2026-12-01");
  assert.equal(fields.maxPenaltyPct.evidence.page, 2);
  assert.equal(fields.maxPenaltyPct.evidence.quote, "Penalty cap: 8%");
  for (const field of Object.values(fields)) assert.equal(field.state, "SUGGESTED");
  const conflicted = extractor.extract(source + "\nGrace: 9 days");
  assert.equal(conflicted.find((field) => field.path === "graceDays").value, null);
  assert.ok(extractor.extract("scanned image without text").every((field) => field.value === null && field.evidence === null));
});

test("uploaded DOCX is bound to the draft, extracted with provenance and needs explicit review", async () => {
  const draft = await call("u-legal", "drafts", "getContractDraft", "CT0101");
  const saved = await call("u-legal", "drafts", "saveContractDraft", {...draft, title: "Extracted contract", file: {name: "terms.docx", kind: "DOCX", sizeBytes: 1000}});
  const path = join(dir, "fixture.docx");
  const text = "Contract value: 1250.50 million\nGrace period: 5 days\nPenalty rate: 0.25% per day\nPenalty cap: 8%\nStart date: 2026-12-01\nEnd date: 2027-12-01";
  await execute("python3", ["-c", "import zipfile,sys,xml.sax.saxutils as x\nwith zipfile.ZipFile(sys.argv[1],'w') as z: z.writestr('word/document.xml','<w:document xmlns:w=\"urn:word\"><w:body>'+''.join('<w:p><w:r><w:t>'+x.escape(s)+'</w:t></w:r></w:p>' for s in sys.argv[2].splitlines())+'</w:body></w:document>')", path, text]);
  const bytes = await readFile(path);
  const document = await docs.upload(saved.code, {buffer: bytes, size: bytes.length, originalname: "terms.docx"}, {user: actors["u-legal"]});
  assert.equal((await call("u-legal", "drafts", "getContractDraft", saved.code)).file.sha256, document.sha256);
  await assert.rejects(extraction.extract(saved.code, actors["u-supplier"]));
  await assert.rejects(call("u-legal", "drafts", "confirmDigitization", saved.code, {dueDate: "2028-12-01"}), /EXTRACTION_REVIEW_REQUIRED/);
  const proposal = await extraction.extract(saved.code, actors["u-legal"]);
  assert.equal(proposal.extractor.kind, "TEXT_RULES"); assert.equal(proposal.documentSha256, document.sha256);
  const values = Object.fromEntries(proposal.fields.map((field) => [field.path, field.value]));
  assert.ok(Object.values(values).every((value) => value !== null));
  await extraction.confirm(saved.code, proposal.id, values, actors["u-legal"]);
  await assert.rejects(extraction.confirm(saved.code, proposal.id, values, actors["u-legal"]), /EXTRACTION_ALREADY_CONFIRMED/);
  const current = await call("u-legal", "drafts", "getContractDraft", saved.code);
  assert.equal(current.valueMillion, "1250.50"); assert.equal(current.penaltyRatePct, "0.25");
  await call("u-legal", "drafts", "confirmDigitization", saved.code, {dueDate: "2028-12-01"});
});

test("signing rejects expired requests, changed bytes and duplicate confirmation, then verifies offline", async () => {
  const code = "CT0101";
  const overview = await call("u-owner", "signing", "getSigningOverview", code);
  const step = overview.steps.find((item) => item.status === "CURRENT");
  const signer = step.signerUserId;
  await call(signer, "signing", "sendSigningRequest", code, step.stepNo, "USB_TOKEN");
  await repo.mutate("signing-requests", (rows) => {rows.at(-1).expiresAt = "2000-01-01T00:00:00.000Z";});
  await assert.rejects(call(signer, "signing", "confirmSigningRequest", code, step.stepNo), /REQUEST_EXPIRED/);
  await call(signer, "signing", "sendSigningRequest", code, step.stepNo, "USB_TOKEN");
  const draft = (await repo.list("contract-drafts")).find((row) => row.code === code);
  const path = join(dir, "uploads", draft.file.documentId), original = await readFile(path);
  await writeFile(path, "changed bytes");
  await assert.rejects(call(signer, "signing", "confirmSigningRequest", code, step.stepNo), /DOCUMENT_CHANGED/);
  await writeFile(path, original);
  await call(signer, "signing", "confirmSigningRequest", code, step.stepNo);
  await assert.rejects(call(signer, "signing", "confirmSigningRequest", code, step.stepNo), /REQUEST_NOT_PENDING/);
  let verified = await call("u-owner", "signing", "getVerification", code);
  assert.equal(verified.signatures[0].status, "VALID"); assert.equal(verified.signatures[0].certificateTrusted, false);
  const bundle = await trust.signatureBundle(code, actors["u-owner"]);
  assert.equal(verifyBundle(bundle, {document: original}).result, "CRYPTO_VALID_UNTRUSTED_KEY");
  assert.equal(verifyBundle(bundle, {document: original, fingerprints: [bundle.proofs[0].keyFingerprint]}).result, "VERIFIED_LOCAL_KEY");
  assert.equal(verifyBundle(bundle, {document: Buffer.from("tampered")}).valid, false);
  await writeFile(path, "tampered");
  verified = await call("u-owner", "signing", "getVerification", code);
  assert.equal(verified.signatures[0].status, "INVALID");
  await writeFile(path, original);
  const altered = structuredClone(bundle.proofs[0]); altered.payload.signerUserId = "forged";
  assert.equal(verifyLocalProof(altered), false);
});

test("legacy seeded signatures are explicitly unverified and idle polling creates no audit noise", async () => {
  const before = (await repo.list("audit")).length;
  await call("u-supplier", "signing", "getSigningRequest", "CT0102", 2);
  assert.equal((await repo.list("audit")).length, before);
  const verification = await call("u-owner", "signing", "getVerification", "CT0102");
  assert.equal(verification.signatures[0].status, "UNVERIFIED");
});

test("rule versions validate the DSL and 20 labels, require a second publisher and pin future contracts", async () => {
  const author = actors["u-sysadmin"], reviewer = {...author, id: "second-admin", displayName: "Second reviewer"};
  let version = await rules.create({name: "Version one", reason: "Validate local configuration"}, author);
  const invalid = structuredClone(version.rules); invalid[0].condition_expression = "FALSE AND __import__('os')";
  let saved = await rules.save(version.id, {version: version.version, rules: invalid, templates: version.templates}, author);
  await assert.rejects(rules.submit(saved.id, saved.version, author), /RULE_VERSION_INVALID/);
  saved = await rules.save(version.id, {version: saved.version, rules: version.rules, templates: version.templates}, author);
  version = await rules.submit(saved.id, saved.version, author);
  assert.equal(version.validation.matched, 20); assert.equal(version.validation.evaluated, 405);
  await assert.rejects(rules.publish(version.id, version.version, author), /SECOND_REVIEWER_REQUIRED/);
  version = await rules.publish(version.id, version.version, reviewer);
  await assert.rejects(rules.save(version.id, {version: version.version, rules: version.rules, templates: version.templates}, author), /RULE_VERSION_LOCKED/);
  const original = await call("u-legal", "drafts", "getContractDraft");
  const draft = await call("u-legal", "drafts", "saveContractDraft", {...original, title: "Pinned version", file: {name: "pinned.pdf", sizeBytes: 1000, kind: "PDF"}});
  assert.equal(draft.ruleVersion.id, version.id);
  const contract = (await repo.list("contracts")).find((row) => row.contract_id === draft.code);
  assert.ok(contract.rule_set_id.includes("~"));
  let second = await rules.create({name: "Version two", reason: "Next version"}, author);
  second = await rules.submit(second.id, second.version, author); await rules.publish(second.id, second.version, reviewer);
  const resaved = await call("u-legal", "drafts", "saveContractDraft", draft);
  assert.equal(resaved.ruleVersion.id, version.id, "retired version remains pinned");
  assert.equal((await repo.list("contracts")).find((row) => row.contract_id === "CT0001").rule_set_id.includes("~"), false);
});

test("anchor outbox is durable, idempotent, independently verifiable and detects rewritten history", async () => {
  const actor = actors["u-admin"], id = randomUUID();
  const jobs = await Promise.all([trust.request(id, actor), trust.request(id, actor)]);
  assert.equal(jobs[0].status, "CONFIRMED"); assert.equal(jobs[1].id, id);
  assert.equal((await repo.list("anchor-jobs")).filter((job) => job.id === id).length, 1);
  const bundle = await trust.bundle(id, actor);
  assert.equal((await trust.check(bundle)).result, "MATCH");
  const records = JSON.parse(await readFile(repo.path, "utf8"));
  const key = trust.status().witnessKeyFingerprint;
  assert.equal(verifyBundle(bundle, {records, fingerprints: [key]}).result, "VERIFIED_LOCAL_KEY");
  const tampered = structuredClone(bundle); tampered.receipt.payload.observedAt = "forged";
  assert.equal((await trust.check(tampered)).result, "MISMATCH");
  records.audit[1].action = "forged";
  assert.equal(verifyBundle(bundle, {records, fingerprints: [key]}).valid, false);
  const restored = new Repository(); await restored.init();
  assert.equal((await restored.list("anchor-jobs")).find((job) => job.id === id).status, "CONFIRMED");
  await restored.onModuleDestroy();
  assert.equal(verifyChain(await repo.list("audit")).ok, true);
  assert.ok(canonical(bundle).includes("AUDIT_ANCHOR"));
});

test("witness outage keeps a failed durable job that can retry without duplicating business work", async () => {
  const actor = actors["u-admin"];
  const witnessDir = join(dir, "unavailable"); await writeFile(witnessDir, "not a directory");
  const originalDir = process.env.TRUST_DIR; process.env.TRUST_DIR = witnessDir;
  const job = await trust.request(randomUUID(), actor);
  assert.equal(job.status, "FAILED"); assert.equal(job.attempts, 1);
  process.env.TRUST_DIR = originalDir;
  const retried = await trust.retry(job.id, actor);
  assert.equal(retried.status, "CONFIRMED"); assert.equal(retried.attempts, 2);
  assert.equal((await trust.retry(job.id, actor)).attempts, 2);
});

test("rule diagnostics are read-only; full-pack preview catches regressions outside the 20 samples", async () => {
  const author = actors["u-sysadmin"];
  const version = await rules.create({name: "Explain rule language", reason: "Test all branches and full-pack gate"}, author);
  const before = (await repo.list("audit")).length;
  assert.equal((await rules.language()).variables.length, 17);
  assert.deepEqual(await rules.checkExpressions({rules: version.rules}), {valid: true, checked: 384, issues: []});
  const invalid = structuredClone(version.rules); invalid[0].condition_expression = "open_dispute == 1";
  const result = await rules.checkExpressions({rules: invalid});
  assert.equal(result.valid, false); assert.equal(result.issues[0].code, "TYPE_MISMATCH");
  assert.equal(result.issues[0].field, "condition_expression");
  await assert.rejects(rules.checkExpressions({rules: []}), /RULE_VERSION_INVALID/);
  const baseline = await rules.preview(version.id, {version: version.version, rules: version.rules, templates: version.templates});
  assert.equal(baseline.evaluated, 405); assert.equal(baseline.matched, 20); assert.equal(baseline.changed, 0); assert.equal(baseline.canSubmit, true);
  const modified = structuredClone(version.rules);
  const target = modified.find(row => row.rule_id === "PR0023");
  target.condition_expression += " AND planned_payment_vnd_mn != 258.00";
  const preview = await rules.preview(version.id, {version: version.version, rules: modified, templates: version.templates});
  assert.equal(preview.matched, 20, "public examples alone cannot protect the full pack");
  assert.ok(preview.changed > 0); assert.equal(preview.canSubmit, false);
  assert.ok(preview.changes.some(row => row.milestoneId === "MS0001"));
  assert.equal((await repo.list("audit")).length, before, "diagnostics and preview do not write business state");
  const saved = await rules.save(version.id, {version: version.version, rules: modified, templates: version.templates}, author);
  await assert.rejects(rules.submit(saved.id, saved.version, author), /RULE_VERSION_REGRESSION/);
});
