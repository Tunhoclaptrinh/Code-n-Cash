import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { markChanged, refreshedByLiveUpdates } from "./useLiveUpdates";

describe("refreshedByLiveUpdates", () => {
  it("re-reads the workflow screens on a change", () => {
    expect(refreshedByLiveUpdates(["milestones", "overview", "CT0104"])).toBe(
      true,
    );
    expect(refreshedByLiveUpdates(["pending-tasks", "u-owner"])).toBe(true);
  });

  it("leaves the signing device alone: re-reading its session would reopen its stream", () => {
    expect(refreshedByLiveUpdates(["signing-device", "u-owner"])).toBe(false);
    expect(
      refreshedByLiveUpdates(["signing-device", "u-owner", "transactions"]),
    ).toBe(false);
  });
});

describe("markChanged", () => {
  it("re-reads open screens now and makes closed ones re-read when they open again", async () => {
    const cache = new QueryClient({
      defaultOptions: { queries: { staleTime: 30_000 } },
    });
    const list = ["contract-summaries", "u-owner"];
    const overview = ["milestones", "overview", "CT0102"];
    const device = ["signing-device", "u-owner"];
    // The contract list was read before, then left: cached, no screen shows it.
    cache.setQueryData(list, { signer: "previous" });
    cache.setQueryData(device, { session: 1 });
    // The contract detail is open.
    const fetchOverview = vi.fn().mockResolvedValue({ signer: "next" });
    const observer = new QueryObserver(cache, {
      queryKey: overview,
      queryFn: fetchOverview,
      staleTime: 30_000,
    });
    const unsubscribe = observer.subscribe(() => {});
    await vi.waitFor(() =>
      expect(cache.getQueryState(overview)?.status).toBe("success"),
    );
    expect(fetchOverview).toHaveBeenCalledTimes(1);

    await markChanged(cache);
    expect(fetchOverview).toHaveBeenCalledTimes(2);
    expect(cache.getQueryState(list)?.isInvalidated).toBe(true);
    expect(cache.getQueryState(device)?.isInvalidated).toBe(false);
    unsubscribe();
  });
});
