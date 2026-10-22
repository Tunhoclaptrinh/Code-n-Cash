import { BaseCard } from "@codecash/ui";
import type { ReactNode } from "react";
export function Card({
  as: Element = "section",
  className,
  children,
}: {
  as?: "section" | "div";
  className?: string;
  children: ReactNode;
}) {
  return (
    <BaseCard
      bodyStyle={{
        padding: 0,
        display: "flex",
        flexDirection: "column",
        flex: 1,
      }}
      style={{
        minWidth: 0,
        width: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Element className={className} style={{ flex: 1, minWidth: 0 }}>
        {children}
      </Element>
    </BaseCard>
  );
}
