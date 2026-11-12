import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Donut, SegmentedBar } from "./charts";

const part = (key: string, value: number) => ({
  key,
  label: key,
  value,
  display: String(value),
  color: "red",
});

describe("Donut", () => {
  it("draws one arc per non-zero part and lists every part with its share", () => {
    const { container } = render(
      <Donut
        label="Hợp đồng theo trạng thái"
        total={4}
        caption="hợp đồng"
        data={[part("A", 3), part("B", 1), part("C", 0)]}
      />,
    );
    // The track plus two arcs: the zero part draws nothing.
    expect(container.querySelectorAll("circle")).toHaveLength(3);
    expect(screen.getByText("75%")).toBeTruthy();
    expect(screen.getByText("25%")).toBeTruthy();
    expect(screen.getByText("0%")).toBeTruthy();
    expect(
      screen.getByRole("img", { name: "Hợp đồng theo trạng thái" }),
    ).toBeTruthy();
  });

  it("makes rows with a value a link, and not the empty ones", () => {
    const onSelect = vi.fn();
    render(
      <Donut
        label="x"
        total={1}
        caption="x"
        data={[part("A", 1), part("B", 0)]}
        onSelect={onSelect}
      />,
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]);
    expect(onSelect).toHaveBeenCalledWith("A");
  });
});

describe("SegmentedBar", () => {
  it("gives each non-zero part a share of the bar and prints large shares", () => {
    render(
      <SegmentedBar
        label="Phân bổ"
        parts={[part("paid", 80), part("held", 20), part("rejected", 0)]}
      />,
    );
    const segments = screen.getAllByRole("listitem");
    expect(segments).toHaveLength(2);
    expect(segments[0].textContent).toBe("80%");
    expect(segments[1].getAttribute("aria-label")).toBe("held: 20, 20%");
  });
});
