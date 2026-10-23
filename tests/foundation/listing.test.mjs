import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ListQueryError,
  fold,
  runList,
} from "../../apps/api/dist/domain/listing.js";

// The engine every table uses: search, filters, sort and paging must agree with each other.
const rows = [
  {
    id: "C1",
    name: "Nguyễn Văn An",
    kind: "BUYER",
    at: "2026-10-01T08:00:00",
    value: 300,
  },
  {
    id: "C2",
    name: "Trần Thị Mai",
    kind: "SUPPLIER",
    at: "2026-10-05T09:00:00",
    value: 100,
  },
  {
    id: "C3",
    name: "Lê Quốc Dũng",
    kind: "BUYER",
    at: "2026-10-09T10:00:00",
    value: 200,
  },
  {
    id: "C4",
    name: "Phạm Đức Anh",
    kind: "SUPPLIER",
    at: "2026-10-12T11:00:00",
    value: 100,
  },
];
const spec = {
  fields: {
    id: { value: (r) => r.id, sort: true },
    name: { value: (r) => r.name, filter: "contains", sort: true },
    kind: { value: (r) => r.kind, filter: "eq", facet: true },
    from: { value: (r) => r.at, filter: "gte" },
    to: { value: (r) => r.at, filter: "lte" },
    value: { value: (r) => r.value, sort: true },
  },
  search: (r) => [r.id, r.name],
  defaultSort: { by: "id", order: "asc" },
};
const ids = (page) => page.items.map((r) => r.id);

test("search ignores accents and case, and every word must appear", () => {
  assert.equal(fold("Nguyễn ĐỨC"), "nguyen duc");
  assert.deepEqual(ids(runList(rows, { search: "duc" }, spec)), ["C4"]);
  assert.deepEqual(ids(runList(rows, { search: "DŨNG" }, spec)), ["C3"]);
  assert.deepEqual(ids(runList(rows, { search: "VĂN" }, spec)), ["C1"]);
  assert.deepEqual(ids(runList(rows, { search: "pham  anh" }, spec)), ["C4"]);
  assert.equal(runList(rows, { search: "nobody" }, spec).total, 0);
});

test("filters: any value of a field, every field, contains and date bounds", () => {
  assert.deepEqual(ids(runList(rows, { filters: { kind: ["BUYER"] } }, spec)), [
    "C1",
    "C3",
  ]);
  assert.equal(
    runList(rows, { filters: { kind: ["BUYER", "SUPPLIER"] } }, spec).total,
    4,
  );
  assert.deepEqual(
    ids(
      runList(rows, { filters: { kind: ["SUPPLIER"], name: ["mai"] } }, spec),
    ),
    ["C2"],
  );
  assert.deepEqual(
    ids(
      runList(
        rows,
        { filters: { from: ["2026-10-05"], to: ["2026-10-09"] } },
        spec,
      ),
    ),
    ["C2", "C3"],
  );
});

test("sort is stable and the total, pages and facets agree", () => {
  const sorted = runList(rows, { sortBy: "value", sortOrder: "asc" }, spec);
  assert.deepEqual(ids(sorted), ["C2", "C4", "C3", "C1"]);
  const page = runList(
    rows,
    { page: 2, limit: 3, filters: { kind: ["BUYER", "SUPPLIER"] } },
    spec,
  );
  assert.deepEqual([page.total, page.totalPages, ids(page)], [4, 2, ["C4"]]);
  // Facets describe the whole scope, so filter menus keep every option.
  const filtered = runList(rows, { filters: { kind: ["BUYER"] } }, spec);
  assert.deepEqual(filtered.facets.kind, [
    { value: "BUYER", count: 2 },
    { value: "SUPPLIER", count: 2 },
  ]);
  assert.equal(filtered.scopeTotal, 4);
  // A page past the end answers with the last page instead of an empty one.
  assert.deepEqual(ids(runList(rows, { page: 9, limit: 3 }, spec)), ["C4"]);
});

test("malformed queries are refused with a code", () => {
  for (const [query, code] of [
    [{ limit: 101 }, "INVALID_PAGINATION"],
    [{ page: 0 }, "INVALID_PAGINATION"],
    [{ filters: { id: ["C1"] } }, "INVALID_FILTER"],
    [{ filters: { kind: "BUYER" } }, "INVALID_FILTER"],
    [{ filters: { kind: [{}] } }, "INVALID_FILTER"],
    [{ sortBy: "kind" }, "INVALID_SORT"],
    [{ sortOrder: "up" }, "INVALID_SORT"],
  ])
    assert.throws(
      () => runList(rows, query, spec),
      (error) => error instanceof ListQueryError && error.message === code,
    );
});
