import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyInputPatch,
  fillEmptyInputs,
  isEmptyInput,
} from "../../apps/web/src/shared/lib/form-input.ts";
import { resourceDemoInput } from "../../apps/web/src/features/platform/lib/demoInput.ts";

test("demo fill preserves user text, zero, false and selected identities", () => {
  const current = {
    title: "My title",
    graceDays: 0,
    active: false,
    person: { value: "chosen", label: "Chosen" },
    signers: ["chosen"],
    amount: "",
    note: "   ",
    missing: undefined,
  };
  const sample = {
    title: "Demo",
    graceDays: 7,
    active: true,
    person: { value: "other", label: "Other" },
    signers: ["other"],
    amount: "1000.00",
    note: "Demo note",
    missing: "value",
  };
  const result = fillEmptyInputs(current, sample);
  assert.deepEqual(emptyInputPatch(current, sample), {
    amount: "1000.00",
    note: "Demo note",
    missing: "value",
  });
  assert.equal(result.title, "My title");
  assert.equal(result.graceDays, 0);
  assert.equal(result.active, false);
  assert.equal(result.person, current.person);
  assert.equal(result.signers, current.signers);
  assert.equal(current.amount, "", "fill does not mutate the input object");
});

test("blank inputs accept samples; absent suggestions never clear existing values", () => {
  assert.equal(isEmptyInput([]), true);
  assert.equal(isEmptyInput(null), true);
  assert.equal(isEmptyInput(0), false);
  assert.equal(isEmptyInput(false), false);
  assert.deepEqual(
    fillEmptyInputs(
      { signers: [], title: "", amount: "", existing: "Keep" },
      { signers: ["first"], title: undefined, amount: null, existing: "" },
    ),
    { signers: ["first"], title: "", amount: "", existing: "Keep" },
  );
});

test("resource demo input resolves real references and respects the selected organization", () => {
  const organizations = [
    { id: "buyer", name: "Buyer", kind: "BUYER" },
    { id: "supplier", name: "Supplier", kind: "SUPPLIER" },
    { id: "ops", name: "Operations", kind: "INTERNAL" },
  ];
  const t = (key) => key;
  const buyer = resourceDemoInput("users", organizations, t);
  assert.equal(buyer.role, "CONTRACT_OWNER");
  assert.equal(buyer.organizationId.value, "buyer");
  const supplier = resourceDemoInput("users", organizations, t, {
    organizationId: { value: "supplier", label: "Supplier" },
  });
  assert.equal(supplier.role, "SUPPLIER");
  assert.equal(supplier.partyId, "supplier");
  const internal = resourceDemoInput("users", organizations, t, {
    organizationId: "ops",
  });
  assert.equal(internal.role, "AUDITOR");
  assert.equal(internal.partyId, undefined);
  assert.equal(
    resourceDemoInput("contract-drafts", [], t).supplierId,
    undefined,
  );
});
