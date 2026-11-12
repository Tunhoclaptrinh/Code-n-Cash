import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ListQuery } from "@codecash/contracts";
import { useListState } from "@codecash/ui";

const ROWS = Array.from({ length: 25 }, (_, i) => ({ id: i + 1 }));

/** A fake list endpoint: pages the 25 rows and clamps a page past the end, like the API. */
function endpoint() {
  return vi.fn(async (query: ListQuery) => {
    const limit = query.limit ?? 10;
    const last = Math.max(1, Math.ceil(ROWS.length / limit));
    const page = Math.min(query.page ?? 1, last);
    return {
      items: ROWS.slice((page - 1) * limit, page * limit),
      total: ROWS.length,
      page,
    };
  });
}

function setup(fetch = endpoint()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(
    () =>
      useListState<{ id: number }>({
        key: ["test"],
        fetch,
        sort: { by: "id", order: "asc" },
      }),
    { wrapper },
  );
  return { fetch, ...hook };
}

describe("useListState", () => {
  it("asks for the first page with the default sort", async () => {
    const { result, fetch } = setup();
    await waitFor(() =>
      expect(result.current.table.dataSource).toHaveLength(10),
    );
    expect(fetch.mock.calls[0][0]).toMatchObject({
      page: 1,
      limit: 10,
      sortBy: "id",
      sortOrder: "asc",
      filters: {},
    });
    expect(result.current.table.pagination.total).toBe(25);
  });

  it("goes back to page 1 when a filter or the sort changes", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.data).toBeDefined());
    act(() =>
      result.current.table.onPaginationChange(
        { current: 2, pageSize: 10 },
        {},
        {},
      ),
    );
    expect(result.current.query.page).toBe(2);
    act(() => result.current.table.onFilterChange("status", ["HELD", "PAID"]));
    expect(result.current.query).toMatchObject({
      page: 1,
      filters: { status: ["HELD", "PAID"] },
    });
    // Several values show as a list in the filter builder, one value as a single choice.
    expect(result.current.table.filterValues.status).toEqual(["HELD", "PAID"]);
    act(() => result.current.table.onFilterChange("status", "HELD"));
    expect(result.current.table.filterValues.status).toBe("HELD");
    act(() =>
      result.current.table.onPaginationChange(
        { current: 3, pageSize: 10 },
        {},
        { columnKey: "id", order: "descend" },
      ),
    );
    expect(result.current.query).toMatchObject({ page: 1, sortOrder: "desc" });
    expect(result.current.column("id").sortOrder).toBe("descend");
  });

  it("follows the page the server served when the asked one is gone", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.data).toBeDefined());
    act(() =>
      result.current.table.onPaginationChange(
        { current: 9, pageSize: 10 },
        {},
        {},
      ),
    );
    await waitFor(() => expect(result.current.query.page).toBe(3));
    expect(result.current.table.dataSource).toHaveLength(5);
  });

  it("waits for typing to pause before searching", async () => {
    const { result, fetch } = setup();
    await waitFor(() => expect(result.current.data).toBeDefined());
    act(() => {
      result.current.table.onSearch("CT");
      result.current.table.onSearch("CT0019");
    });
    expect(result.current.query.search ?? "").toBe("");
    await waitFor(() => expect(result.current.query.search).toBe("CT0019"));
    const searches = fetch.mock.calls.map(([q]) => q.search ?? "");
    expect(searches).not.toContain("CT");
  });
});
