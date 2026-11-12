import { describe, expect, it } from "vitest";
import { formatDecimalString, formatMonth, sumDecimalStrings } from "./format";

describe("money strings", () => {
  it("groups digits without going through a float", () => {
    expect(formatDecimalString("365785.87")).toBe("365.785,87");
    // Beyond Number precision the digits must survive unchanged.
    expect(formatDecimalString("12345678901234567890.12")).toBe(
      "12.345.678.901.234.567.890,12",
    );
    expect(formatDecimalString("-0.10")).toBe("-0,10");
    expect(formatDecimalString("n/a")).toBe("n/a");
  });

  it("adds in hundredths exactly", () => {
    // 0.1 + 0.2 is the classic float trap.
    expect(sumDecimalStrings(["0.10", "0.20"])).toBe("0.30");
    expect(sumDecimalStrings(["1290.00", "0.1", "-5.05"])).toBe("1285.05");
    expect(sumDecimalStrings([])).toBe("0.00");
  });

  it("writes months for labels and axes", () => {
    expect(formatMonth("2026-08")).toBe("08/2026");
    expect(formatMonth("2026-08", true)).toBe("08/26");
  });
});
