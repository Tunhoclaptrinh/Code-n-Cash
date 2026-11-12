import { useEffect, useState, type Key } from "react";
import type { QueryKey } from "@tanstack/react-query";
import {
  MAX_PAGE_SIZE,
  runList,
  type FilterValue,
  type ListPage,
  type ListQuery,
  type ListSpec,
} from "@codecash/contracts";
import { exportToCSV, exportToJSON, useListState } from "@codecash/ui";
import { App } from "antd";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { platform } from "@/shared/api/platform";
import { columnFilterIcon } from "@/shared/ui/columnSearch";
import { readListUrl, writeListUrl } from "./listUrl";

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

/**
 * State of one workflow list table: the shared list state of the base (`useListState`: paging,
 * search, filters, sort, column filters) plus what only this app adds, the address sync and the
 * audited export. Column keys are the list fields of the spec (apps/api/src/domain/lists.ts).
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
    options.syncUrl ? readListUrl(params, options.pageSize ?? 10) : null,
  );
  const list = useListState<T, P>({
    key: options.key,
    fetch: (query) => fetch(query),
    pageSize: options.pageSize,
    sort,
    filters: options.filters,
    initial: fromUrl ?? undefined,
  });
  const { query, result, filters } = list;
  const syncUrl = options.syncUrl ?? false;
  useEffect(() => {
    if (!syncUrl) return;
    setParams(
      (current) => {
        const next = writeListUrl(current, query, {
          limit: options.pageSize ?? 10,
          sort,
        });
        return next.toString() === current.toString() ? current : next;
      },
      { replace: true },
    );
  }, [syncUrl, query, setParams, options.pageSize, sort.by, sort.order]);
  const [exporting, setExporting] = useState(false);

  /** Controlled filter and sort state for the column of list field `key`. */
  const column = (key: string) => ({
    ...list.column(key),
    filterIcon: columnFilterIcon,
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

  /** Props for the base DataTable: the shared list state plus the export progress. */
  const table = { ...list.table, exportLoading: exporting };

  return {
    result,
    data: result.data,
    query,
    filters,
    setFilter: list.setFilter,
    setFilters: list.setFilters,
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
