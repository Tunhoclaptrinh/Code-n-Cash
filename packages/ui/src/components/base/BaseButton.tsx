import React from "react";
import { Button as AntButton, Tooltip } from "antd";
import { useAppConfig } from "../../context/AppConfigContext";
import { BaseButtonProps } from "./types";
export const BaseButton = React.forwardRef<any, BaseButtonProps>(
  (
    {
      variant = "primary",
      size = "small",
      tooltip,
      glow = false,
      children,
      style,
      loading,
      disabled,
      className,
      ...rest
    },
    ref,
  ) => {
    const { themeMode } = useAppConfig();
    const isLight = themeMode === "light";
    const sizeStyles: Record<
      string,
      {
        height: number;
        fontSize: number;
        padding: string;
        borderRadius: number;
      }
    > = {
      small: { height: 32, fontSize: 13, padding: "0 12px", borderRadius: 6 },
      middle: { height: 32, fontSize: 13, padding: "0 14px", borderRadius: 6 },
      large: { height: 38, fontSize: 14, padding: "0 18px", borderRadius: 8 },
    };
    const currentSize = sizeStyles[size || "small"] || sizeStyles.small;
    let customStyle: React.CSSProperties = {
      height: currentSize.height,
      fontSize: currentSize.fontSize,
      padding: currentSize.padding,
      borderRadius: currentSize.borderRadius,
      fontWeight: 600,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      cursor: disabled ? "not-allowed" : "pointer",
      userSelect: "none",
      transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
      ...style,
    };
    if (variant === "brand" || variant === "primary") {
      customStyle = {
        ...customStyle,
        background: "var(--color-primary, #315bea)",
        border: "1px solid var(--color-primary, #315bea)",
        color: "var(--color-on-solid, #FFFFFF)",
        boxShadow: glow
          ? "0 2px 8px rgba(49, 91, 234, 0.3)"
          : "0 1px 3px rgba(0, 0, 0, 0.08)",
      };
    } else if (variant === "secondary") {
      customStyle = {
        ...customStyle,
        background: isLight ? "#FFFFFF" : "rgba(255, 255, 255, 0.05)",
        border: isLight
          ? "1px solid var(--border-subtle, #E5E7EB)"
          : "1px solid rgba(255, 255, 255, 0.12)",
        color: isLight
          ? "var(--color-text-secondary, #374151)"
          : "var(--border-subtle, #E5E7EB)",
        boxShadow: "0 1px 2px rgba(0, 0, 0, 0.04)",
      };
    } else if (variant === "gold") {
      customStyle = {
        ...customStyle,
        background: "var(--status-attention, #fcc20f)",
        border: "1px solid var(--status-attention, #fcc20f)",
        color: "#111827",
        fontWeight: 700,
        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.08)",
      };
    } else if (variant === "danger") {
      customStyle = {
        ...customStyle,
        background: "var(--status-danger-strong, #DC2626)",
        border: "1px solid var(--status-danger-strong, #DC2626)",
        color: "#FFFFFF",
        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.08)",
      };
    } else if (variant === "success") {
      customStyle = {
        ...customStyle,
        background: "var(--status-success-strong, #059669)",
        border: "1px solid var(--status-success-strong, #059669)",
        color: "#FFFFFF",
        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.08)",
      };
    } else if (variant === "ghost") {
      customStyle = {
        ...customStyle,
        background: "transparent",
        border: isLight
          ? "1px solid var(--border-subtle, #E5E7EB)"
          : "1px solid rgba(255, 255, 255, 0.1)",
        color: isLight
          ? "var(--text-secondary, #4B5563)"
          : "var(--text-muted, #9CA3AF)",
      };
    }
    const btnElement = (
      <AntButton
        ref={ref}
        size={size}
        style={customStyle}
        loading={loading}
        disabled={disabled}
        className={`codecash-btn codecash-btn-${variant} ${className || ""}`}
        {...rest}
      >
        {children}
      </AntButton>
    );
    if (tooltip) {
      return (
        <Tooltip title={tooltip} placement="top">
          {disabled ? (
            <span style={{ display: "inline-flex", cursor: "not-allowed" }}>
              {btnElement}
            </span>
          ) : (
            btnElement
          )}
        </Tooltip>
      );
    }
    return btnElement;
  },
);
BaseButton.displayName = "BaseButton";
export default BaseButton;
