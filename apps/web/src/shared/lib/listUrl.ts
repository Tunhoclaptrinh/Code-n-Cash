import {
  MAX_PAGE_SIZE,
  type FilterValue,
  type ListQuery,
} from "@codecash/contracts";

type Filters = Record<string, FilterValue[]>;

/** URL parameters of a list: q, page, size, sort=field:order and one f.<field> per value. */
const URL_KEYS = ["q", "page", "size", "sort"];
const isListParam = (key: string) =>
  URL_KEYS.includes(key) || key.startsWith("f.");
const fromUrlValue = (value: string): FilterValue =>
  value === "true" ? true : value === "false" ? false : value;

/** The list state a link carries, or null when the URL has none (the defaults apply). */
export function readListUrl(params: URLSearchParams, limit: number) {
  if (![...params.keys()].some(isListParam)) return null;
  const filters: Filters = {};
  for (const [key, value] of params.entries())
    if (key.startsWith("f.") && value !== "")
      (filters[key.slice(2)] ??= []).push(fromUrlValue(value));
  const [sortBy, sortOrder] = (params.get("sort") ?? "").split(":");
  const page = Number(params.get("page"));
  const size = Number(params.get("size"));
  return {
    search: params.get("q") ?? "",
    page: Number.isInteger(page) && page > 0 ? page : 1,
    limit:
      Number.isInteger(size) && size > 0 && size <= MAX_PAGE_SIZE
        ? size
        : limit,
    filters,
    sortBy: sortBy || undefined,
    sortOrder:
      sortOrder === "asc" || sortOrder === "desc"
        ? (sortOrder as "asc" | "desc")
        : undefined,
  };
}

/**
 * The address for list `query`: other parameters of the page are kept, list parameters are
 * written only where they differ from the defaults, one `f.<field>` per filter value.
 */
export function writeListUrl(
  current: URLSearchParams,
  query: ListQuery,
  defaults: { limit: number; sort: { by: string; order: "asc" | "desc" } },
): URLSearchParams {
  const next = new URLSearchParams();
  for (const [key, value] of current.entries())
    if (!isListParam(key)) next.append(key, value);
  if (query.search) next.set("q", query.search);
  if ((query.page ?? 1) > 1) next.set("page", String(query.page));
  if (query.limit !== defaults.limit) next.set("size", String(query.limit));
  if (
    query.sortBy !== defaults.sort.by ||
    query.sortOrder !== defaults.sort.order
  )
    next.set("sort", `${query.sortBy}:${query.sortOrder}`);
  for (const [key, values] of Object.entries(query.filters ?? {}))
    for (const value of values) next.append(`f.${key}`, String(value));
  return next;
}
