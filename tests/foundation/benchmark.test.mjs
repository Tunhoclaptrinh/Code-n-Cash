import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { RolesGuard } from "../../apps/api/dist/common/guards/roles.guard.js";
import { EngineController } from "../../apps/api/dist/engine.js";

const { Reflector } = createRequire(
  new URL("../../apps/api/package.json", import.meta.url),
)("@nestjs/core");

// The synthetic benchmark is a read of the official Data Pack results: it is served to the roles
// that may read them (engine:read) and refused to the others.
const controller = new EngineController({}, {});
const guard = new RolesGuard(new Reflector());
const asRole = (role) =>
  guard.canActivate({
    getHandler: () => EngineController.prototype.benchmark,
    getClass: () => EngineController,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  });

test("the benchmark endpoint returns the test split with no failures and no unauthorized payment", async () => {
  const result = await controller.benchmark();
  const { synthetic } = result;
  assert.equal(synthetic.failureCount, 0);
  assert.equal(synthetic.test.unauthorizedPayment.count, 0);
  assert.ok(synthetic.test.unauthorizedPayment.total > 0);
  assert.equal(synthetic.test.decisionAccuracy.correct, synthetic.test.cases);
  assert.equal(synthetic.test.fullMatch.correct, synthetic.test.cases);
  assert.equal(Object.keys(synthetic.scenarios).length, 33);
  assert.ok(result.publicSamples.test.cases > 0);
});

test("concurrent and later requests share one computed run", async () => {
  const [a, b] = await Promise.all([
    controller.benchmark(),
    controller.benchmark(),
  ]);
  assert.equal(a, b);
  assert.equal(await controller.benchmark(), a);
});

test("the benchmark is guarded by the permission to read the results", () => {
  for (const role of [
    "CONTRACT_OWNER",
    "FINANCE_APPROVER",
    "ADMIN_AUDITOR",
    "AUDITOR",
  ])
    assert.equal(asRole(role), true, role);
  // SYSTEM_ADMIN manages accounts and configuration (SoD-1) and does not read decisions.
  assert.throws(() => asRole("SYSTEM_ADMIN"), /PERMISSION_DENIED/);
  assert.throws(() => asRole("UNKNOWN_ROLE"), /PERMISSION_DENIED/);
});
