import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// The web app and the API compile separately; the domain types must not drift apart.
test("API and web share one definition of the workflow domain", async () => {
  const [api, web] = await Promise.all([
    readFile("apps/api/src/domain/types.ts", "utf8"),
    readFile("packages/contracts/src/workflow.ts", "utf8"),
  ]);
  assert.equal(
    web,
    api,
    "copy apps/api/src/domain/types.ts to packages/contracts/src/workflow.ts",
  );
});

test("API and web share one list engine (search, filters, sort, paging)", async () => {
  const [api, web] = await Promise.all([
    readFile("apps/api/src/domain/listing.ts", "utf8"),
    readFile("packages/contracts/src/listing.ts", "utf8"),
  ]);
  assert.equal(
    web,
    api,
    "copy apps/api/src/domain/listing.ts to packages/contracts/src/listing.ts",
  );
});

for (const [apiFile, sharedFile] of [["common/field-validation", "field-validation"], ["trust/types", "trust"]]) {
  test(`${sharedFile} stays identical between API and browser`, async () => {
    assert.equal(await readFile(`apps/api/src/${apiFile}.ts`, "utf8"), await readFile(`packages/contracts/src/${sharedFile}.ts`, "utf8"));
  });
}

// The engine policy pack is the source of the event, status, reason and decision vocabulary; the
// TypeScript unions name the same values so the API and the web can type them.
test("domain unions cover the vocabulary of the engine policy pack", async () => {
  const [types, policyText] = await Promise.all([
    readFile("apps/api/src/domain/types.ts", "utf8"),
    readFile("apps/engine/policy/case4_btc.json", "utf8"),
  ]);
  const policy = JSON.parse(policyText);
  const union = (name) => {
    const match = types.match(new RegExp(`export type ${name} =([^;]+);`));
    assert.ok(match, name);
    return new Set([...match[1].matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]));
  };
  const events = new Set([
    ...union("BusinessEventType"),
    ...union("SupportEventType"),
  ]);
  assert.deepEqual(new Set(Object.keys(policy.event_types)), events);
  const evidence = Object.entries(policy.event_types)
    .filter(([, kind]) => kind.category === "EVIDENCE")
    .map(([name]) => name);
  assert.deepEqual(new Set(evidence), union("BusinessEventType"));
  assert.deepEqual(new Set(Object.keys(policy.reasons)), union("ReasonCode"));
  assert.deepEqual(new Set(Object.keys(policy.decisions)), union("Decision"));
  // PLANNED and IN_PROGRESS exist only in as-of replays (TimelinePoint), every other status is a MilestoneStatus.
  const asOf = new Set(
    Object.values(policy.reasons).flatMap((reason) =>
      Object.values(reason.as_of ?? {}),
    ),
  );
  assert.deepEqual(asOf, new Set(["PLANNED", "IN_PROGRESS"]));
  for (const status of policy.statuses)
    assert.ok(asOf.has(status) || union("MilestoneStatus").has(status), status);
  for (const kind of Object.values(policy.event_types))
    assert.ok(union("EventStatus").has(kind.valid_status), kind.valid_status);
});
