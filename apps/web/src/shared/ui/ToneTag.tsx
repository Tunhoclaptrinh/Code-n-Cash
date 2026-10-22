import { Tag } from "antd";
import type { ReactNode } from "react";

export type Tone =
  "success" | "warning" | "danger" | "primary" | "neutral" | "indigo";

const colors: Record<Tone, string> = {
  success: "success",
  warning: "warning",
  danger: "error",
  primary: "processing",
  neutral: "default",
  indigo: "geekblue",
};

/** Ant Design tag coloured by semantic tone, so screens never pick raw colours. */
export function ToneTag({
  tone,
  children,
}: {
  tone: Tone;
  children: ReactNode;
}) {
  return <Tag color={colors[tone]}>{children}</Tag>;
}
