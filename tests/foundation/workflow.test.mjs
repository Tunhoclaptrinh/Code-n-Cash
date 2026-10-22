import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Repository } from "../../apps/api/dist/common/repository.js";
import { BaseService } from "../../apps/api/dist/common/services/base.service.js";
import { WorkflowService } from "../../apps/api/dist/workflow.controller.js";
const owner = {
  id: "u-owner",
  email: "owner@novaan.vn",
  displayName: "Owner",
  role: "CONTRACT_OWNER",
  organizationId: "org-nova-an",
  roleChipOrganization: "Nova An",
  permissions: [],
};
const supplier = {
  ...owner,
  id: "u-supplier",
  role: "SUPPLIER",
  organizationId: "org-phu-minh",
};
test("workflow uses authenticated actors, scopes direct IDs and persists across service instances", async () => {
  const dir = await mkdtemp(join(tmpdir(), "codecash-workflow-"));
  process.env.REPO_ROOT = process.cwd();
  process.env.DATA_DIR = dir;
  process.env.STORAGE_DRIVER = "file";
  const repo = new Repository();
  await repo.init();
  const base = new BaseService(repo);
  const service = new WorkflowService(repo, base);
  try {
    await assert.rejects(
      service.call("constructor", "constructor", { args: ["return 1"] }, owner),
    );
    const list = await service.call(
      "contracts-contractList",
      "getContractList",
      { args: [{ ...owner, role: "ADMIN_AUDITOR" }] },
      supplier,
    );
    assert.equal(list.contracts.length, 2);
    await assert.rejects(
      service.call(
        "milestones-contracts",
        "getContractOverview",
        { args: ["CT0014"] },
        supplier,
      ),
    );
    await assert.rejects(
      service.call(
        "milestones-approvals",
        "castVote",
        {
          args: [
            {
              contractId: "CT0101",
              milestoneNo: 2,
              role: "FINANCE_APPROVER",
              userId: "u-finance",
              choice: "APPROVE",
            },
          ],
        },
        supplier,
      ),
    );
    const draft = await service.call(
      "contracts-contractDraft",
      "getContractDraft",
      { args: [] },
      owner,
    );
    const next = { ...draft, title: "Persisted workflow draft" };
    await service.call(
      "contracts-contractDraft",
      "saveContractDraft",
      { args: [next] },
      owner,
    );
    const restarted = new WorkflowService(repo, base);
    const restored = await restarted.call(
      "contracts-contractDraft",
      "getContractDraft",
      { args: [] },
      owner,
    );
    assert.equal(restored.title, next.title);
    const activity = await restarted.call(
      "audit-activity",
      "listActivityEntries",
      { args: [] },
      owner,
    );
    assert.ok(
      activity.some(
        (entry) =>
          entry.action.kind === "WORKFLOW_ACTION" &&
          entry.action.code === "saveContractDraft",
      ),
    );
    const log = await repo.list("audit");
    assert.equal(log.at(-1).action, "saveContractDraft");
    assert.equal(log.at(-1).actorId, "u-owner");
  } finally {
    await repo.onModuleDestroy();
    await rm(dir, { recursive: true, force: true });
  }
});
