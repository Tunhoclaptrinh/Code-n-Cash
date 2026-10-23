import React from "react";
import { Tooltip } from "antd";
import { useAppConfig } from "../../context/AppConfigContext";
export interface IconButtonProps {
  icon: React.ReactNode;
  tooltip?: string;
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
  danger?: boolean;
  success?: boolean;
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
      ? "#EF4444"
      : success
        ? "#10B981"
        : color || (isLight ? "#4B5563" : "#9CA3AF");
    const activeHoverColor = danger
      ? "#DC2626"
      : success
        ? "#059669"
        : hoverColor || "#315bea";
    const [isHovered, setIsHovered] = React.useState(false);
    const buttonNode = (
      <span
        ref={ref}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={disabled ? undefined : onClick}
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
          outline: "none",
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
