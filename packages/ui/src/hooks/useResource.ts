import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ResourceClient } from "@codecash/api-client";
import type { Entity, ListQuery, PageQuery } from "@codecash/contracts";
import { useListState, type ListFilters } from "./useListState";

/**
 * One CRUD resource: the list state shared with every other table (`useListState`: paging,
 * debounced search, filters with several values, sort, column filters) plus create, update and
 * remove, each refreshing the list. Spread `table` onto the base DataTable.
 */
export function useResource<T extends Entity>(
  name: string,
  service: ResourceClient<T>,
  initial: PageQuery = {},
) {
  const cache = useQueryClient();
  const list = useListState<T>({
    key: ["resource", name],
    fetch: (query, signal) => service.list(query as PageQuery, signal),
    pageSize: initial.limit ?? 20,
    sort: {
      by: initial.sortBy ?? "createdAt",
      order: initial.sortOrder ?? "desc",
    },
    initial: {
      ...(initial as Partial<ListQuery>),
      filters: Object.fromEntries(
        Object.entries(initial.filters ?? {}).map(([key, value]) => [
          key,
          Array.isArray(value) ? value : [value],
        ]),
      ) as ListFilters,
    },
  });
  const { setQuery } = list;
  const refresh = () =>
    cache.invalidateQueries({ queryKey: ["resource", name] });
  const create = useMutation({
    mutationFn: (data: Partial<T>) => service.create(data),
    onSuccess: refresh,
  });
  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<T> }) =>
      service.update(id, data),
    onSuccess: refresh,
  });
  // Removing the last row of a page lands on the page before it (the server also clamps).
  const remove = useMutation({
    mutationFn: (id: string) => service.remove(id),
    onSuccess: refresh,
  });
  const change = useMemo(
    () => ({
      search: (search: string) => setQuery((p) => ({ ...p, search, page: 1 })),
      filter: (filters: ListFilters) =>
        setQuery((p) => ({ ...p, filters, page: 1 })),
      page: (page: number, limit: number) =>
        setQuery((p) => ({ ...p, page: limit !== p.limit ? 1 : page, limit })),
      sort: (sortBy: string, sortOrder: "asc" | "desc") =>
        setQuery((p) => ({ ...p, sortBy, sortOrder, page: 1 })),
    }),
    [setQuery],
  );
  return {
    /** The list request (rows, total, loading, error). */
    query: list.result,
    /** The current list query: page, limit, search, filters, sort. */
    params: list.query,
    setParams: setQuery,
    change,
    /** Column filter and sort state, filter setters and the DataTable props. */
    column: list.column,
    filters: list.filters,
    setFilter: list.setFilter,
    table: list.table,
    create,
    update,
    remove,
    refresh,
  };
}
