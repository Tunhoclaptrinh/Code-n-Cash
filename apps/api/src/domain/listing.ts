/**
 * One list engine for every table: search, filters, sort and paging, with the same rules on the
 * server (workflow lists) and in the browser (single documents such as the Data Pack results).
 * apps/api/src/domain/listing.ts and packages/contracts/src/listing.ts are identical copies
 * (tests/foundation/domain-types.test.mjs checks it).
 */

export type FilterValue = string | number | boolean;

/** Paging query; also the exact parameters a list request sends. */
export interface ListQuery {
  page?: number;
  limit?: number;
  /** Words to find, accents and case ignored; every word must appear. */
  search?: string;
  /** Field → accepted values; a row matches any value of a field and every field. */
  filters?: Record<string, FilterValue[]>;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface FacetValue {
  value: string;
  count: number;
}

export interface ListPage<T> {
  items: T[];
  /** Rows matching the search and the filters. */
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  /** Rows in the caller's scope, before search and filters. */
  scopeTotal: number;
  /** Distinct values of the facet fields over the whole scope, with counts. */
  facets: Record<string, FacetValue[]>;
}

type Cell = string | number | boolean | null | undefined;

export interface ListField<T> {
  value: (row: T) => Cell | Cell[];
  /**
   * eq: one of the values; contains: the text contains the value (accents ignored);
   * gte / lte: compared as text from the start (ISO dates, codes).
   */
  filter?: "eq" | "contains" | "gte" | "lte";
  sort?: boolean;
  facet?: boolean;
}

export interface ListSpec<T> {
  fields: Record<string, ListField<T>>;
  /** Texts the global search looks into. */
  search: (row: T) => Cell[];
  defaultSort: { by: string; order: "asc" | "desc" };
}

/** Thrown for a malformed query; the message is the error code returned to the client. */
export class ListQueryError extends Error {}

export const MAX_PAGE_SIZE = 100;

/** Lower case without accents: "Nguyễn Đức" → "nguyen duc". */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

const cells = (value: Cell | Cell[]): Cell[] =>
  Array.isArray(value) ? value : [value];
const text = (value: Cell) =>
  value === null || value === undefined ? "" : String(value);

function compare(a: Cell | Cell[], b: Cell | Cell[]): number {
  const x = cells(a)[0];
  const y = cells(b)[0];
  if (typeof x === "number" && typeof y === "number") return x - y;
  if (typeof x === "boolean" && typeof y === "boolean")
    return Number(x) - Number(y);
  return text(x).localeCompare(text(y), "vi", { numeric: true });
}

/** Validates a query against the spec; unknown fields, values or sizes are refused. */
export function parseListQuery<T>(
  raw: unknown,
  spec: ListSpec<T>,
): Required<Omit<ListQuery, "search">> & { search: string } {
  const input = (raw && typeof raw === "object" ? raw : {}) as ListQuery;
  const page = input.page ?? 1;
  const limit = input.limit ?? 10;
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > MAX_PAGE_SIZE
  )
    throw new ListQueryError("INVALID_PAGINATION");
  const search = typeof input.search === "string" ? input.search : "";
  if (search.length > 200) throw new ListQueryError("INVALID_SEARCH");
  const filters: Record<string, FilterValue[]> = {};
  if (input.filters !== undefined) {
    if (
      !input.filters ||
      typeof input.filters !== "object" ||
      Array.isArray(input.filters)
    )
      throw new ListQueryError("INVALID_FILTER");
    for (const [key, values] of Object.entries(input.filters)) {
      if (
        !spec.fields[key]?.filter ||
        !Array.isArray(values) ||
        values.length > 50 ||
        values.some((v) => !["string", "number", "boolean"].includes(typeof v))
      )
        throw new ListQueryError("INVALID_FILTER");
      if (values.length) filters[key] = values;
    }
  }
  const sortBy = input.sortBy ?? spec.defaultSort.by;
  const sortOrder = input.sortOrder ?? spec.defaultSort.order;
  if (!spec.fields[sortBy]?.sort || !["asc", "desc"].includes(sortOrder))
    throw new ListQueryError("INVALID_SORT");
  return { page, limit, search, filters, sortBy, sortOrder };
}

function matches<T>(
  row: T,
  field: ListField<T>,
  values: FilterValue[],
): boolean {
  const own = cells(field.value(row));
  switch (field.filter) {
    case "contains":
      return values.every((v) =>
        own.some((c) => fold(text(c)).includes(fold(String(v)))),
      );
    case "gte":
      return own.some((c) =>
        values.every((v) => text(c).slice(0, String(v).length) >= String(v)),
      );
    case "lte":
      return own.some((c) =>
        values.every((v) => text(c).slice(0, String(v).length) <= String(v)),
      );
    default:
      return own.some((c) => values.some((v) => text(c) === String(v)));
  }
}

/** Rows matching the query, sorted, before paging (also what an export of "all" contains). */
export function selectRows<T>(
  rows: T[],
  query: ReturnType<typeof parseListQuery>,
  spec: ListSpec<T>,
): T[] {
  const words = fold(query.search).split(/\s+/).filter(Boolean);
  const kept = rows.filter((row) => {
    for (const [key, values] of Object.entries(query.filters))
      if (!matches(row, spec.fields[key], values)) return false;
    if (!words.length) return true;
    const haystack = fold(spec.search(row).map(text).join(" "));
    return words.every((word) => haystack.includes(word));
  });
  const field = spec.fields[query.sortBy];
  const direction = query.sortOrder === "asc" ? 1 : -1;
  // Array.prototype.sort is stable: equal rows keep the scope's own order.
  return kept.sort(
    (a, b) => direction * compare(field.value(a), field.value(b)),
  );
}

/** One page of the rows matching `raw`, with totals and facets for the statistics. */
export function runList<T>(
  rows: T[],
  raw: unknown,
  spec: ListSpec<T>,
): ListPage<T> {
  const query = parseListQuery(raw, spec);
  const selected = selectRows(rows, query, spec);
  const facets: Record<string, FacetValue[]> = {};
  for (const [key, field] of Object.entries(spec.fields)) {
    if (!field.facet) continue;
    const counts = new Map<string, number>();
    for (const row of rows)
      for (const value of new Set(cells(field.value(row)).map(text)))
        if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
    facets[key] = [...counts]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => a.value.localeCompare(b.value, "vi", { numeric: true }));
  }
  const totalPages = Math.max(1, Math.ceil(selected.length / query.limit));
  // A page past the end (rows removed meanwhile) shows the last page instead of nothing.
  const page = Math.min(query.page, totalPages);
  return {
    items: selected.slice((page - 1) * query.limit, page * query.limit),
    total: selected.length,
    page,
    limit: query.limit,
    totalPages,
    scopeTotal: rows.length,
    facets,
  };
}
