import { describe, expect, it } from "vitest";
import { refreshedByLiveUpdates } from "./useLiveUpdates";

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
