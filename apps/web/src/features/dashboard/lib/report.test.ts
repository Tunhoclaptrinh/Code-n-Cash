import { describe, expect, it } from "vitest";
import type { TFunction } from "i18next";
import type { DashboardView } from "@codecash/contracts";
import { reportRows } from "./report";

// Keys stand in for labels: the test checks structure and exact amounts, not wording.
const t = ((key: string) => key) as unknown as TFunction;

const view = {
  contractCount: 2,
  milestones: {
    total: 5,
    paid: 1,
    payable: 2,
    held: 1,
    rejected: 0,
    overdue: 1,
    dueSoon: 2,
  },
  amounts: {
    plannedMillion: "12345678901234.10",
    paidMillion: "0.10",
    payableMillion: "0.20",
    penaltyMillion: "2.22",
    heldMillion: "7776.00",
    rejectedMillion: "0.00",
  },
  byMonth: [
    {
      month: "2026-11",
      amounts: {
        RELEASE: "1.10",
        PENALTY: "0.00",
        HOLD: "5.00",
        REJECT: "0.00",
      },
      paidMillion: "0.10",
    },
  ],
  holdReasons: [
    {
      reason: "MISSING_REQUIRED_EVIDENCE",
      milestones: 3,
      amountMillion: "5020.00",
    },
  ],
  byStatus: { PENDING_CONDITIONS: 2 },
  byDecision: { RELEASE: 3, HOLD: 1 },
  attention: [
    {
      contractId: "CT0019",
      sequence: 3,
      kind: "OPEN_DISPUTE",
      amountMillion: "591.00",
      dueDate: null,
    },
  ],
  contracts: [
    { contractId: "CT0102", title: "Training", heldMillion: "3200.00" },
  ],
} as unknown as DashboardView;

describe("reportRows", () => {
  const rows = reportRows(view, t, t);

  it("keeps every amount as the exact string from the API", () => {
    const planned = rows.find((r) => r.item === "report.items.planned");
    expect(planned?.value).toBe("12345678901234.10");
    expect(rows.find((r) => r.item === "money.parts.paid")?.value).toBe("0.10");
    expect(
      rows.every(
        (r) => typeof r.value !== "number" || Number.isInteger(r.value),
      ),
    ).toBe(true);
  });

  it("covers every part of the overview", () => {
    const sections = new Set(rows.map((r) => r.section));
    expect([...sections]).toEqual([
      "report.sections.totals",
      "report.sections.months",
      "report.sections.reasons",
      "report.sections.status",
      "report.sections.decisions",
      "report.sections.attention",
      "report.sections.contracts",
    ]);
    // Four decisions and the paid amount for the one month.
    expect(
      rows.filter((r) => r.section === "report.sections.months"),
    ).toHaveLength(5);
    expect(
      rows.find(
        (r) =>
          r.section === "report.sections.decisions" &&
          r.item === "decision.REJECT",
      )?.value,
    ).toBe(0);
  });
});
