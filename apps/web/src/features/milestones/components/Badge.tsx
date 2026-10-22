import { Tag } from "antd";
import type { ReactNode } from "react";
export type BadgeTone =
  "success" | "warning" | "danger" | "primary" | "neutral" | "indigo";
export type BadgeSize = "sm" | "md" | "lg" | "strong" | "headline";
const colors = {
  success: "success",
  warning: "warning",
  danger: "error",
  primary: "blue",
  neutral: "default",
  indigo: "geekblue",
};
export function Badge({
  tone,
  children,
}: {
  tone: BadgeTone;
  size?: BadgeSize;
  children: ReactNode;
}) {
  return <Tag color={colors[tone]}>{children}</Tag>;
}
