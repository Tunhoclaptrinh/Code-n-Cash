import type { ComponentProps } from "react";
import { BaseCard } from "@codecash/ui";

type Props = ComponentProps<typeof BaseCard> & {
  /** Keeps a thin frame, for a part that must stand apart from its neighbours. */
  framed?: boolean;
};

/**
 * A titled part of the page card. It is BaseCard without its own frame, shadow and inset, so a
 * page reads as one card with sections; `framed` restores a thin border where one helps.
 */
export function Section({ framed = false, style, bodyStyle, ...props }: Props) {
  return (
    <BaseCard
      {...props}
      style={{
        boxShadow: "none",
        ...(framed
          ? { border: "1px solid var(--color-border)" }
          : { border: "none", background: "transparent" }),
        ...style,
      }}
      bodyStyle={framed ? bodyStyle : { padding: 0, ...bodyStyle }}
    />
  );
}
