import { describe, expect, it } from "vitest";
import { statSpan } from "./statLayout";

const shares = (count: number) =>
  Array.from({ length: count }, (_, i) => statSpan(i, count).xl.flex);

describe("statSpan", () => {
  it("keeps up to six tiles on one wide row", () => {
    expect(shares(5)).toEqual(Array(5).fill("0 0 20%"));
    expect(shares(4)).toEqual(Array(4).fill("0 0 25%"));
  });

  it("splits more than six into even rows", () => {
    // Nine tiles: rows of five and four, never six and three.
    expect(new Set(shares(9))).toEqual(new Set(["0 0 20%"]));
    expect(new Set(shares(12))).toEqual(new Set([`0 0 ${100 / 6}%`]));
  });

  it("gives a lone last tile the whole phone row", () => {
    expect(statSpan(4, 5).xs).toBe(24);
    expect(statSpan(3, 5).xs).toBe(12);
    expect(statSpan(3, 4).xs).toBe(12);
  });
});
