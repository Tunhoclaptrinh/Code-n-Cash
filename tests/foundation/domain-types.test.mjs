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
