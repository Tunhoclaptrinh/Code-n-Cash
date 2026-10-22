import { Card as AntCard } from "antd";
import type { ReactNode } from "react";
export function Card({
  className,
  children,
}: {
  as?: "section" | "div";
  className?: string;
  children: ReactNode;
}) {
  return (
    <AntCard className={className} styles={{ body: { padding: 20 } }}>
      {children}
    </AntCard>
  );
}
