import type { KeyboardEvent, ReactNode } from "react";

/**
 * A table cell that opens its row: reachable with Tab and activated with Enter or Space, like the
 * row's own action buttons, instead of answering the mouse only.
 */
export function ClickableCell({
  onOpen,
  children,
}: {
  onOpen: () => void;
  children: ReactNode;
}) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen();
    }
  };
  return (
    <div
      role="button"
      tabIndex={0}
      style={{ cursor: "pointer" }}
      onClick={onOpen}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  );
}
