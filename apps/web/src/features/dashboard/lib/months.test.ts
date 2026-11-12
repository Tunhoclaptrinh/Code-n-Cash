import { describe, expect, it } from "vitest";
import type { DashboardView } from "@codecash/contracts";
import { fillMonths } from "./months";

const month = (key: string, release = "0.00") => ({
  month: key,
  amounts: { RELEASE: release, PENALTY: "0.00", HOLD: "0.00", REJECT: "0.00" },
  paidMillion: "0.00",
});

describe("fillMonths", () => {
  it("leaves zero or one month alone", () => {
    expect(fillMonths([])).toEqual([]);
    expect(fillMonths([month("2026-05")])).toHaveLength(1);
  });

  it("adds empty months between the first and the last, across a year end", () => {
    const filled = fillMonths([
      month("2026-11", "10.00"),
      month("2027-02", "5.00"),
    ] as DashboardView["byMonth"]);
    expect(filled.map((m) => m.month)).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
    ]);
    expect(filled[1].amounts.RELEASE).toBe("0.00");
    expect(filled[3].amounts.RELEASE).toBe("5.00");
  });
});
