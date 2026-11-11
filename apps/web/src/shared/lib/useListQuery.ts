import { useCallback, useEffect, useMemo, useState, type Key } from "react";
import {
  keepPreviousData,
  useQuery,
  type QueryKey,
} from "@tanstack/react-query";
import {
  MAX_PAGE_SIZE,
  runList,
  type FilterValue,
  type ListPage,
  type ListQuery,
  type ListSpec,
} from "@codecash/contracts";
import { exportToCSV, exportToJSON, useDebounce } from "@codecash/ui";
import { App } from "antd";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { platform } from "@/shared/api/platform";
import { columnFilterIcon } from "@/shared/ui/columnSearch";

type Filters = Record<string, FilterValue[]>;

/** What the base ExportModal asks for. */
export interface ExportOptions {
  scope: "page" | "all" | "custom";
  format: "csv" | "json" | "xlsx";
  columns?: string[];
  limit?: number;
}

/** How one table column is written to a file: one cell, or several named cells. */
export type ExportValue<T> = (
  row: T,
) => string | number | null | Record<string, string | number | null>;

interface ExportColumn {
  key?: Key;
  title?: unknown;
}

interface Sorter {
  columnKey?: Key;
  field?: unknown;
  order?: "ascend" | "descend" | null;
}

/** URL parameters of a list: q, page, size, sort=field:order and one f.<field> per value. */
const URL_KEYS = ["q", "page", "size", "sort"];
const isListParam = (key: string) =>
  URL_KEYS.includes(key) || key.startsWith("f.");
const fromUrlValue = (value: string): FilterValue =>
  value === "true" ? true : value === "false" ? false : value;

/** The list state a link carries, or null when the URL has none (the defaults apply). */
function readUrl(params: URLSearchParams, limit: number) {
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

const sameFilters = (a: Filters, b: Filters) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every(
    (key) => JSON.stringify(a[key] ?? []) === JSON.stringify(b[key] ?? []),
  );
};

/**
 * State of one list table. Page, size, search, filters and sort live here and travel in every
 * request, so the rows, the total, the filter menus, the column filters and the export agree.
 * Column keys are the list fields of the spec (apps/api/src/domain/lists.ts).
 */
export function useListQuery<T, P extends ListPage<T> = ListPage<T>>(options: {
  key: QueryKey;
  fetch: (query: ListQuery) => Promise<P>;
  pageSize?: number;
  sort: { by: string; order: "asc" | "desc" };
  filters?: Filters;
  /**
   * Keeps page, size, search, filters and sort in the address (replacing the entry, not adding
   * history), so a reload, a shared link or a dashboard drill-down opens the same rows. One table
   * per page uses it; other query parameters of the page are left alone.
   */
  syncUrl?: boolean;
  auditExport?:
    | "contracts"
    | "tasks"
    | "activity"
    | "exceptions"
    | "permissions"
    | "engine";
}) {
  const { fetch, sort } = options;
  const { message } = App.useApp();
  const { t } = useTranslation("platform");
  const [params, setParams] = useSearchParams();
  const [fromUrl] = useState(() =>
    options.syncUrl ? readUrl(params, options.pageSize ?? 10) : null,
  );
  const [query, setQuery] = useState<ListQuery>({
    page: fromUrl?.page ?? 1,
    limit: fromUrl?.limit ?? options.pageSize ?? 10,
    filters: fromUrl?.filters ?? options.filters ?? {},
    sortBy: fromUrl?.sortBy ?? sort.by,
    sortOrder: fromUrl?.sortOrder ?? sort.order,
    ...(fromUrl?.search ? { search: fromUrl.search } : {}),
  });
  const [searchText, setSearchText] = useState(fromUrl?.search ?? "");
  const search = useDebounce(searchText.trim(), 300);
  useEffect(() => {
    setQuery((q) =>
      (q.search ?? "") === search ? q : { ...q, search, page: 1 },
    );
  }, [search]);
  const result = useQuery({
    queryKey: [...options.key, query],
    queryFn: () => fetch(query),
    placeholderData: keepPreviousData,
  });
  const filters = useMemo(() => query.filters ?? {}, [query.filters]);
  const syncUrl = options.syncUrl ?? false;
  useEffect(() => {
    if (!syncUrl) return;
    setParams(
      (current) => {
        const next = new URLSearchParams();
        for (const [key, value] of current.entries())
          if (!isListParam(key)) next.append(key, value);
        if (query.search) next.set("q", query.search);
        if ((query.page ?? 1) > 1) next.set("page", String(query.page));
        if (query.limit !== (options.pageSize ?? 10))
          next.set("size", String(query.limit));
        if (query.sortBy !== sort.by || query.sortOrder !== sort.order)
          next.set("sort", `${query.sortBy}:${query.sortOrder}`);
        for (const [key, values] of Object.entries(query.filters ?? {}))
          for (const value of values) next.append(`f.${key}`, String(value));
        return next.toString() === current.toString() ? current : next;
      },
      { replace: true },
    );
  }, [syncUrl, query, setParams, options.pageSize, sort.by, sort.order]);
  const [exporting, setExporting] = useState(false);

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

  /** Controlled filter and sort state for the column of list field `key`. */
  const column = (key: string) => ({
    key,
    filterIcon: columnFilterIcon,
    filteredValue: (filters[key] as Key[] | undefined) ?? null,
    sortOrder:
      query.sortBy === key
        ? query.sortOrder === "asc"
          ? ("ascend" as const)
          : ("descend" as const)
        : null,
  });

  /** Every matching row in the current order, read page by page (export of "all"). */
  const fetchAll = async (limit = Number.POSITIVE_INFINITY) => {
    const rows: T[] = [];
    for (let page = 1; rows.length < limit; page++) {
      const part = await fetch({ ...query, page, limit: MAX_PAGE_SIZE });
      rows.push(...part.items);
      if (page >= part.totalPages) break;
    }
    return rows.slice(0, limit);
  };

  /** Export handler: exactly the rows the table shows (one page, all, or the first N). */
  const exporter =
    (
      columns: ExportColumn[],
      values: Record<string, ExportValue<T>>,
      filename: string,
    ) =>
    async (opt: ExportOptions) => {
      setExporting(true);
      try {
        const rows =
          opt.scope === "page"
            ? (result.data?.items ?? [])
            : await fetchAll(
                opt.scope === "custom"
                  ? (opt.limit ?? MAX_PAGE_SIZE)
                  : undefined,
              );
        const keys = opt.columns?.length
          ? opt.columns
          : columns.map((c) => String(c.key));
        const records = rows.map((row) => {
          const record: Record<string, string | number | null> = {};
          for (const key of keys) {
            const column = columns.find((c) => String(c.key) === key);
            const write = values[key];
            if (!column || !write) continue;
            const value = write(row);
            if (value !== null && typeof value === "object")
              Object.assign(record, value);
            else
              record[typeof column.title === "string" ? column.title : key] =
                value;
          }
          return record;
        });
        if (options.auditExport)
          await platform.post("/exports", {
            source: options.auditExport,
            count: rows.length,
            format: opt.format,
            scope: opt.scope,
            columns: keys,
          });
        if (opt.format === "json") exportToJSON(records, filename);
        else exportToCSV(records, filename);
      } catch {
        void message.error(t("error"));
      } finally {
        setExporting(false);
      }
    };

  // The server answers with the last page when the asked one no longer exists (rows removed).
  const served = result.isPlaceholderData ? undefined : result.data?.page;
  useEffect(() => {
    if (served !== undefined && served !== query.page)
      setQuery((q) => ({ ...q, page: served }));
  }, [served, query.page]);
  const pagination = {
    current: query.page,
    pageSize: query.limit,
    total: result.data?.total ?? 0,
  };

  /** Props for the base DataTable: search, filter builder, paging, sort and column filters. */
  const table = {
    dataSource: result.data?.items ?? [],
    loading: result.isFetching,
    searchValue: searchText,
    onSearch: setSearchText,
    onRefresh: () => void result.refetch(),
    pagination,
    exportLoading: exporting,
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
    onClearFilters: () => setQuery((q) => ({ ...q, filters: {}, page: 1 })),
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
    filters,
    setFilter,
    setFilters: (next: Filters) =>
      setQuery((q) => ({ ...q, filters: next, page: 1 })),
    column,
    table,
    exporter,
  };
}

/** The same list engine over rows already in the browser (one document such as an engine run). */
export const localList =
  <T>(rows: T[], spec: ListSpec<T>) =>
  (query: ListQuery) =>
    Promise.resolve(runList(rows, query, spec));
