import { describe, expect, it } from "vitest";
import { readListUrl, writeListUrl } from "./listUrl";

const defaults = { limit: 10, sort: { by: "at", order: "desc" as const } };

describe("list state in the address", () => {
  it("ignores an address with no list parameters", () => {
    expect(readListUrl(new URLSearchParams("tab=2"), 10)).toBeNull();
  });

  it("reads search, page, size, sort and repeated filters", () => {
    const state = readListUrl(
      new URLSearchParams(
        "q=CT0019&page=3&size=20&sort=amount:asc&f.status=HELD&f.status=PAID&f.mine=true",
      ),
      10,
    );
    expect(state).toEqual({
      search: "CT0019",
      page: 3,
      limit: 20,
      sortBy: "amount",
      sortOrder: "asc",
      filters: { status: ["HELD", "PAID"], mine: [true] },
    });
  });

  it("falls back on nonsense numbers and orders", () => {
    const state = readListUrl(
      new URLSearchParams("page=-1&size=99999&sort=at:sideways"),
      10,
    );
    expect(state).toMatchObject({ page: 1, limit: 10, sortOrder: undefined });
  });

  it("writes only what differs from the defaults and keeps other parameters", () => {
    const url = writeListUrl(
      new URLSearchParams("event=EV1&q=old&f.x=1"),
      {
        page: 1,
        limit: 10,
        sortBy: "at",
        sortOrder: "desc",
        search: "",
        filters: { status: ["HELD", "PAID"] },
      },
      defaults,
    );
    expect(url.toString()).toBe("event=EV1&f.status=HELD&f.status=PAID");
  });

  it("round-trips a full state", () => {
    const query = {
      page: 2,
      limit: 50,
      sortBy: "amount",
      sortOrder: "asc" as const,
      search: "Nova",
      filters: { mine: [false] },
    };
    const back = readListUrl(
      writeListUrl(new URLSearchParams(), query, defaults),
      10,
    );
    expect(back).toEqual(query);
  });
});
