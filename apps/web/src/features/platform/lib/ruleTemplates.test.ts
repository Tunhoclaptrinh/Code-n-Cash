import { describe, expect, it } from "vitest";
import {
  RULE_DECISIONS,
  RULE_REASONS,
  RULE_TEMPLATE_WINDOWS,
  RULE_TEMPLATES,
  templateFields,
  templatePriority,
  templateValueValid,
} from "@codecash/contracts";

const STANDARD = new Set([10, 20, 30, 40, 50, 60, 70, 80]);
const byKey = (key: string) => RULE_TEMPLATES.find((row) => row.key === key)!;

describe("rule sentence templates", () => {
  it("tightening templates hold and pay nothing", () => {
    for (const template of RULE_TEMPLATES.filter((t) => t.kind === "TIGHTEN")) {
      const fields = templateFields(template);
      expect(fields.decision).toBe("HOLD");
      expect(fields.payable_amount_formula).toBe("0");
      expect(fields.penalty_amount_formula).toBe("0");
    }
  });

  it("loosening templates repeat the blocking guards", () => {
    for (const template of RULE_TEMPLATES.filter((t) => t.kind === "LOOSEN")) {
      expect(template.condition).toContain(
        "all_required_conditions_met == TRUE",
      );
      expect(template.condition).toContain("open_dispute == FALSE");
      expect(template.condition).toContain("valid_rejection_event_count == 0");
    }
  });

  it("use decisions and reasons of the policy, with a status that matches the decision", () => {
    const reasonOf = {
      HOLD: ["UNRESOLVED_CONDITION", "APPROVAL_QUORUM_NOT_MET"],
      RELEASE: ["ALL_CONDITIONS_MET"],
      PENALTY: ["LATE_COMPLETION"],
    };
    for (const template of RULE_TEMPLATES) {
      expect(RULE_DECISIONS).toContain(template.decision);
      expect(RULE_REASONS).toContain(template.reasonCode);
      expect(reasonOf[template.decision]).toContain(template.reasonCode);
    }
  });

  it("sit after the blockers (50) and before the penalty (60), tightening above loosening", () => {
    for (const template of RULE_TEMPLATES) {
      const [low, high] = RULE_TEMPLATE_WINDOWS[template.kind];
      expect(template.priority).toBeGreaterThanOrEqual(low);
      expect(template.priority).toBeLessThanOrEqual(high);
    }
    expect(RULE_TEMPLATE_WINDOWS.TIGHTEN[1]).toBeLessThan(
      RULE_TEMPLATE_WINDOWS.LOOSEN[0],
    );
  });

  it("take their own priority, else the nearest free one of their window, else none", () => {
    const late = byKey("LATE_REVIEW");
    expect(templatePriority(late, STANDARD, 80)).toBe(53);
    expect(templatePriority(late, new Set([...STANDARD, 53]), 80)).toBe(52);
    expect(templatePriority(late, new Set([...STANDARD, 53, 52]), 80)).toBe(54);
    // Never outside the window, even when every priority in it is taken.
    expect(
      templatePriority(late, new Set([...STANDARD, 51, 52, 53, 54, 55]), 80),
    ).toBeNull();
    const waive = byKey("WAIVE_SHORT_DELAY");
    expect(
      templatePriority(waive, new Set([...STANDARD, 56, 57, 58, 59]), 80),
    ).toBeNull();
  });

  it("put a whole-number parameter in place of {n}, only inside its range", () => {
    const waive = byKey("WAIVE_SHORT_DELAY");
    expect(waive.condition).toContain("days_late_after_grace <= 3 ");
    expect(templateFields(waive, 7).condition_expression).toContain(
      "days_late_after_grace <= 7 ",
    );
    // The blocking guards stay whatever the value.
    expect(templateFields(waive, 7).condition_expression).toContain(
      "open_dispute == FALSE",
    );
    expect(templateValueValid(waive, 7)).toBe(true);
    for (const bad of [0, 31, 2.5, "3", null, undefined])
      expect(templateValueValid(waive, bad)).toBe(false);
    const half = byKey("HALF_PENALTY");
    expect(half.parameter).toBeUndefined();
    expect(templateValueValid(half, undefined)).toBe(true);
    expect(templateValueValid(half, 2)).toBe(false);
    for (const template of RULE_TEMPLATES)
      expect(template.pattern.includes("{n}")).toBe(!!template.parameter);
  });
});
