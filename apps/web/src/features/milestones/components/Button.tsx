import { Button as AntButton } from "antd";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
export type ButtonVariant =
  | "primary"
  | "success"
  | "outline"
  | "outlinePrimary"
  | "outlineDanger"
  | "outlineWarning"
  | "outlineSuccess";
export type ButtonSize = "row" | "md" | "header" | "compact";
interface CommonProps {
  variant: ButtonVariant;
  size: ButtonSize;
  className?: string;
  children: ReactNode;
}
type Props = CommonProps &
  (
    | { to: string }
    | ({ to?: undefined } & Omit<
        ButtonHTMLAttributes<HTMLButtonElement>,
        "className" | "children"
      >)
  );
export function Button(props: Props) {
  const navigate = useNavigate();
  const { variant, size, className, children, to, ...rest } = props;
  const { type, ...native } = rest as ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <AntButton
      {...(native as any)}
      className={className}
      htmlType={type ?? "button"}
      type={
        variant === "primary" || variant === "success" ? "primary" : "default"
      }
      danger={variant === "outlineDanger"}
      size={size === "compact" ? "small" : "middle"}
      onClick={to ? () => navigate(to) : native.onClick}
    >
      {children}
    </AntButton>
  );
}
