import { useCallback, useEffect, useMemo, useState, type Key } from "react";
import {
  keepPreviousData,
  useQuery,
  type QueryKey,
} from "@tanstack/react-query";
import type { FilterValue, ListQuery } from "@codecash/contracts";
import { useDebounce } from "./useDebounce";

export type ListFilters = Record<string, FilterValue[]>;

/** The least a list endpoint answers with: one page of rows, the matching total, the page served. */
export interface ListResponse<T> {
  items: T[];
  total: number;
  page: number;
}

interface Sorter {
  columnKey?: Key;
  field?: unknown;
  order?: "ascend" | "descend" | null;
}

const sameFilters = (a: ListFilters, b: ListFilters) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every(
    (key) => JSON.stringify(a[key] ?? []) === JSON.stringify(b[key] ?? []),
  );
};

export interface ListStateOptions<R> {
  /** Query key prefix; the current query is appended. */
  key: QueryKey;
  fetch: (query: ListQuery, signal?: AbortSignal) => Promise<R>;
  pageSize?: number;
  sort: { by: string; order: "asc" | "desc" };
  filters?: ListFilters;
  /** Starting state (for example read from the address); defaults fill the rest. */
  initial?: Partial<ListQuery>;
}

/**
 * State of one server-paged table: page, size, search (debounced), filters and sort travel in
 * every request, so the rows, the total, the filter builder, the column filters and the sort
 * arrows always agree. `table` is spread onto the base DataTable. Shared by the workflow lists
 * (`useListQuery` in the app) and the CRUD resources (`useResource`).
 */
export function useListState<T, R extends ListResponse<T> = ListResponse<T>>(
  options: ListStateOptions<R>,
) {
  const { fetch, sort, initial } = options;
  const pageSize = options.pageSize ?? 10;
  const [query, setQuery] = useState<ListQuery>(() => ({
    page: initial?.page ?? 1,
    limit: initial?.limit ?? pageSize,
    filters: initial?.filters ?? options.filters ?? {},
    sortBy: initial?.sortBy ?? sort.by,
    sortOrder: initial?.sortOrder ?? sort.order,
    ...(initial?.search ? { search: initial.search } : {}),
  }));
  const [searchText, setSearchText] = useState(initial?.search ?? "");
  const search = useDebounce(searchText.trim(), 300);
  useEffect(() => {
    setQuery((q) =>
      (q.search ?? "") === search ? q : { ...q, search, page: 1 },
    );
  }, [search]);

  const result = useQuery({
    queryKey: [...options.key, query],
    queryFn: ({ signal }) => fetch(query, signal),
    placeholderData: keepPreviousData,
  });
  const filters = useMemo(() => query.filters ?? {}, [query.filters]);

  const setFilter = useCallback(
    (key: string, values?: FilterValue[] | null) =>
      setQuery((q) => {
        const next = { ...(q.filters ?? {}) };
        if (values?.length) next[key] = values;
        else delete next[key];
        return { ...q, filters: next, page: 1 };
      }),
    [],
  );
  const setFilters = useCallback(
    (next: ListFilters) => setQuery((q) => ({ ...q, filters: next, page: 1 })),
    [],
  );

  // The server answers with the last page when the asked one no longer exists (rows removed).
  const served = result.isPlaceholderData ? undefined : result.data?.page;
  useEffect(() => {
    if (served !== undefined && served !== query.page)
      setQuery((q) => ({ ...q, page: served }));
  }, [served, query.page]);

  /** Controlled filter and sort state for the column of list field `key`. */
  const column = (key: string) => ({
    key,
    filteredValue: (filters[key] as Key[] | undefined) ?? null,
    sortOrder:
      query.sortBy === key
        ? query.sortOrder === "asc"
          ? ("ascend" as const)
          : ("descend" as const)
        : null,
  });

  /** Props for the base DataTable: search, filter builder, paging, sort and column filters. */
  const table = {
    dataSource: result.data?.items ?? [],
    loading: result.isFetching,
    searchValue: searchText,
    onSearch: setSearchText,
    onRefresh: () => void result.refetch(),
    pagination: {
      current: query.page,
      pageSize: query.limit,
      total: result.data?.total ?? 0,
    },
    // One value shows as a single choice in the filter builder, several as a multiple choice.
    filterValues: Object.fromEntries(
      Object.entries(filters).map(([key, values]) => [
        key,
        values.length === 1 ? values[0] : values,
      ]),
    ),
    onFilterChange: (key: string, value: unknown) =>
      setFilter(
        key,
        Array.isArray(value)
          ? (value as FilterValue[])
          : value === undefined || value === null || value === ""
            ? undefined
            : [value as FilterValue],
      ),
    onClearFilters: () => setFilters({}),
    onPaginationChange: (
      page: { current?: number; pageSize?: number },
      tableFilters: Record<string, FilterValue[] | null> | undefined,
      sorter: Sorter | Sorter[],
    ) =>
      setQuery((q) => {
        const s = Array.isArray(sorter) ? sorter[0] : sorter;
        const sortBy = s?.order ? String(s.columnKey ?? s.field) : sort.by;
        const sortOrder = s?.order
          ? s.order === "ascend"
            ? ("asc" as const)
            : ("desc" as const)
          : sort.order;
        const nextFilters = { ...(q.filters ?? {}) };
        for (const [key, values] of Object.entries(tableFilters ?? {}))
          if (values?.length) nextFilters[key] = values;
          else delete nextFilters[key];
        const limit = page.pageSize ?? q.limit;
        const changed =
          sortBy !== q.sortBy ||
          sortOrder !== q.sortOrder ||
          limit !== q.limit ||
          !sameFilters(nextFilters, q.filters ?? {});
        return {
          ...q,
          filters: nextFilters,
          sortBy,
          sortOrder,
          limit,
          page: changed ? 1 : (page.current ?? 1),
        };
      }),
  };

  return {
    result,
    data: result.data,
    query,
    setQuery,
    filters,
    setFilter,
    setFilters,
    column,
    table,
  };
}
