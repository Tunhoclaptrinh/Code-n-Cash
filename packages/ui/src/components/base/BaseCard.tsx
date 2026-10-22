import React from "react";
import { Card as AntCard, Skeleton } from "antd";
import { BaseCardProps } from "./types";
export const BaseCard: React.FC<BaseCardProps> = ({
  title,
  subtitle,
  icon,
  extra,
  actions,
  loading = false,
  bordered = false,
  hoverable = false,
  children,
  className,
  style,
  bodyStyle,
  onClick,
}) => {
  return (
    <AntCard
      title={
        title ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {icon && (
              <span style={{ fontSize: 18, color: "#315bea" }}>{icon}</span>
            )}
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.3 }}>
                {title}
              </div>
              {subtitle && (
                <div
                  style={{
                    fontSize: 12,
                    color: "#6B7280",
                    fontWeight: 400,
                    marginTop: 2,
                  }}
                >
                  {subtitle}
                </div>
              )}
            </div>
          </div>
        ) : null
      }
      extra={extra}
      actions={actions}
      variant={bordered ? "outlined" : "borderless"}
      hoverable={hoverable}
      onClick={onClick}
      className={className}
      style={{
        borderRadius: 12,
        overflow: "hidden",
        transition: "all 0.3s ease",
        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
        border: "1px solid var(--border-subtle, #E5E7EB)",
        ...style,
      }}
      styles={{ body: { padding: 20, ...bodyStyle } }}
    >
      <Skeleton loading={loading} active paragraph={{ rows: 3 }}>
        {children}
      </Skeleton>
    </AntCard>
  );
};
