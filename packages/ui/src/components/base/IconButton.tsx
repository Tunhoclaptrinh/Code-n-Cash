import React from "react";
import { Tooltip } from "antd";
import { useAppConfig } from "../../context/AppConfigContext";
export interface IconButtonProps {
  icon: React.ReactNode;
  tooltip?: string;
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
  danger?: boolean;
  success?: boolean;
  /** The row's main action (open, edit): primary colour. */
  primary?: boolean;
  color?: string;
  hoverColor?: string;
  size?: number | string;
  disabled?: boolean;
  style?: React.CSSProperties;
  className?: string;
}
export const IconButton = React.forwardRef<HTMLSpanElement, IconButtonProps>(
  (
    {
      icon,
      tooltip,
      onClick,
      danger = false,
      success = false,
      primary = false,
      color,
      hoverColor,
      size = 16,
      disabled = false,
      style,
      className,
      ...restProps
    },
    ref,
  ) => {
    const { themeMode } = useAppConfig();
    const isLight = themeMode === "light";
    const defaultColor = danger
      ? "var(--status-danger, #EF4444)"
      : success
        ? "var(--status-success, #10B981)"
        : primary
          ? "var(--color-primary, #315bea)"
          : color ||
            (isLight
              ? "var(--text-secondary, #4B5563)"
              : "var(--text-muted, #9CA3AF)");
    const activeHoverColor = danger
      ? "var(--status-danger-strong, #DC2626)"
      : success
        ? "var(--status-success-strong, #059669)"
        : primary
          ? "var(--color-primary-dark, #2849bd)"
          : hoverColor || "var(--color-primary, #315bea)";
    const [isHovered, setIsHovered] = React.useState(false);
    const buttonNode = (
      <span
        ref={ref}
        role="button"
        aria-label={tooltip}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : 0}
        onClick={disabled ? undefined : onClick}
        onKeyDown={(event) => {
          // A span with role="button" must answer the keys a real button answers.
          if (disabled || !onClick) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onClick(event as unknown as React.MouseEvent<HTMLElement>);
          }
        }}
        onMouseEnter={() => !disabled && setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          border: "none",
          background: isHovered
            ? isLight
              ? "rgba(49, 91, 234, 0.08)"
              : "rgba(255, 255, 255, 0.08)"
            : "transparent",
          color: isHovered ? activeHoverColor : defaultColor,
          cursor: disabled ? "not-allowed" : "pointer",
          fontSize: size,
          width: 30,
          height: 30,
          borderRadius: 6,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
          userSelect: "none",
          transition: "background-color 0.15s ease, color 0.15s ease",
          opacity: disabled ? 0.4 : 1,
          ...style,
        }}
        className={`codecash-icon-btn ${className || ""}`}
        {...restProps}
      >
        {icon}
      </span>
    );
    if (tooltip) {
      return (
        <Tooltip title={tooltip} placement="top">
          {buttonNode}
        </Tooltip>
      );
    }
    return buttonNode;
  },
);
IconButton.displayName = "IconButton";
export default IconButton;
