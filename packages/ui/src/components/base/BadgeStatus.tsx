import React from "react";
import { BadgeStatusProps } from "./types";
export const BadgeStatus: React.FC<BadgeStatusProps> = ({ status, text }) => {
  const colorMap: Record<string, string> = {
    processing: "#3B82F6",
    success: "#10B981",
    error: "#EF4444",
    warning: "#F59E0B",
    default: "#9CA3AF",
  };
  const dotColor = colorMap[status] || "#10B981";
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 8px",
        borderRadius: 12,
        background: "rgba(0, 0, 0, 0.02)",
        border: "1px solid var(--border-subtle, #E5E7EB)",
        fontSize: 12,
        fontWeight: 600,
        color: "#4B5563",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          backgroundColor: dotColor,
          display: "inline-block",
          boxShadow: `0 0 6px ${dotColor}`,
        }}
      />
      <span>{text}</span>
    </div>
  );
};
