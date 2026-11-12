import type { DashboardView, Decision } from "@codecash/contracts";

const DECISIONS: Decision[] = ["RELEASE", "PENALTY", "HOLD", "REJECT"];

/** Months with no due milestone become zero columns between the first and the last month. */
export function fillMonths(
  months: DashboardView["byMonth"],
): DashboardView["byMonth"] {
  if (months.length < 2) return months;
  const byKey = new Map(months.map((m) => [m.month, m]));
  const zero = Object.fromEntries(DECISIONS.map((d) => [d, "0.00"])) as Record<
    Decision,
    string
  >;
  const out: DashboardView["byMonth"] = [];
  let [year, month] = months[0].month.split("-").map(Number);
  const last = months[months.length - 1].month;
  for (let guard = 0; guard < 240; guard++) {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    out.push(
      byKey.get(key) ?? { month: key, amounts: zero, paidMillion: "0.00" },
    );
    if (key >= last) break;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return out;
}
