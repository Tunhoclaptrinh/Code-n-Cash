import type { TFunction } from "i18next";
import type { DashboardView, Decision } from "@codecash/contracts";

const DECISIONS: Decision[] = ["RELEASE", "PENALTY", "HOLD", "REJECT"];

export interface ReportRow {
  section: string;
  item: string;
  value: string | number;
  unit: string;
}

/**
 * The overview's figures as rows for a spreadsheet: totals, months, hold reasons, statuses,
 * decisions, attention items and the contracts holding money. Amounts stay the exact decimal
 * strings the API sent (never converted to floats), in millions of VND.
 */
export function reportRows(
  data: DashboardView,
  t: TFunction,
  td: TFunction,
): ReportRow[] {
  const million = t("unit");
  const section = (key: string) => t(`report.sections.${key}`);
  const rows: ReportRow[] = [];
  const add = (key: string, item: string, value: string | number, unit = "") =>
    rows.push({ section: section(key), item, value, unit });

  add("totals", t("report.items.contracts"), data.contractCount);
  add("totals", t("report.items.milestones"), data.milestones.total);
  add(
    "totals",
    t("report.items.planned"),
    data.amounts.plannedMillion,
    million,
  );
  for (const key of ["paid", "payable", "penalty", "held", "rejected"] as const)
    add(
      "totals",
      t(`money.parts.${key}`),
      data.amounts[`${key}Million` as const],
      million,
    );
  add("totals", t("report.items.overdue"), data.milestones.overdue);
  add("totals", t("report.items.dueSoon"), data.milestones.dueSoon);

  for (const month of data.byMonth) {
    for (const decision of DECISIONS)
      add(
        "months",
        `${month.month} · ${td(`decision.${decision}`)}`,
        month.amounts[decision],
        million,
      );
    add(
      "months",
      `${month.month} · ${t("months.paid")}`,
      month.paidMillion,
      million,
    );
  }
  for (const reason of data.holdReasons) {
    add(
      "reasons",
      td(`reason.${reason.reason}`),
      reason.amountMillion,
      million,
    );
    add(
      "reasons",
      `${td(`reason.${reason.reason}`)} · ${t("report.items.milestones")}`,
      reason.milestones,
    );
  }
  for (const [status, count] of Object.entries(data.byStatus))
    add("status", td(`contractStatus.${status}`), count ?? 0);
  for (const decision of DECISIONS)
    add(
      "decisions",
      td(`decision.${decision}`),
      data.byDecision[decision] ?? 0,
    );
  for (const item of data.attention)
    add(
      "attention",
      `${item.contractId} · ${td("milestoneNo", { no: item.sequence })} · ${t(`attention.kind.${item.kind}`)}`,
      item.amountMillion,
      million,
    );
  for (const contract of data.contracts)
    add(
      "contracts",
      `${contract.contractId} · ${contract.title}`,
      contract.heldMillion,
      million,
    );
  return rows;
}
