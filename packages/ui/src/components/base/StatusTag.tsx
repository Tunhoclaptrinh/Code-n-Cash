import { uiText } from "../../i18n";
import React from "react";
import { Tag } from "antd";
import {
  CheckCircleFilled,
  SyncOutlined,
  ClockCircleFilled,
  CloseCircleFilled,
  ThunderboltFilled,
} from "@ant-design/icons";
import { StatusTagProps } from "./types";
export const StatusTag: React.FC<StatusTagProps> = ({
  status,
  text,
  customLabel,
}) => {
  const normalized = (status || "").toUpperCase();
  const label = customLabel || text;
  switch (normalized) {
    case "COMPLETED":
    case "SUCCESS":
    case "AUTO_APPROVED":
    case "ACTIVE":
    case "CONNECTED":
      return (
        <Tag
          icon={<CheckCircleFilled style={{ color: "#10B981" }} />}
          style={{
            borderRadius: 4,
            fontWeight: 700,
            fontSize: 11,
            background: "rgba(16, 185, 129, 0.12)",
            border: "1px solid rgba(16, 185, 129, 0.25)",
            color: "#10B981",
          }}
        >
          {label ||
            (normalized === "AUTO_APPROVED"
              ? uiText("s6eab27c270")
              : uiText("s9a7d703709"))}
        </Tag>
      );
    case "PROCESSING":
    case "PENDING":
    case "IN_TRANSIT":
      return (
        <Tag
          icon={<SyncOutlined spin style={{ color: "#3B82F6" }} />}
          style={{
            borderRadius: 4,
            fontWeight: 700,
            fontSize: 11,
            background: "rgba(59, 130, 246, 0.12)",
            border: "1px solid rgba(59, 130, 246, 0.25)",
            color: "#3B82F6",
          }}
        >
          {label || uiText("s39fc933455")}
        </Tag>
      );
    case "PENDING_REVIEW":
    case "AWAITING":
    case "WARNING":
      return (
        <Tag
          icon={<ClockCircleFilled style={{ color: "#F59E0B" }} />}
          style={{
            borderRadius: 4,
            fontWeight: 700,
            fontSize: 11,
            background: "rgba(245, 158, 11, 0.12)",
            border: "1px solid rgba(245, 158, 11, 0.25)",
            color: "#F59E0B",
          }}
        >
          {label || uiText("sb00ce9b6e3")}
        </Tag>
      );
    case "AUTO_HEALED":
    case "HEALED":
      return (
        <Tag
          icon={<ThunderboltFilled style={{ color: "#8B5CF6" }} />}
          style={{
            borderRadius: 4,
            fontWeight: 700,
            fontSize: 11,
            background: "rgba(139, 92, 246, 0.12)",
            border: "1px solid rgba(139, 92, 246, 0.25)",
            color: "#8B5CF6",
          }}
        >
          {label || uiText("s6df7bbe8d9")}
        </Tag>
      );
    case "FAILED":
    case "ERROR":
    case "DISCONNECTED":
    case "MANUAL_REQUIRED":
      return (
        <Tag
          icon={<CloseCircleFilled style={{ color: "#EF4444" }} />}
          style={{
            borderRadius: 4,
            fontWeight: 700,
            fontSize: 11,
            background: "rgba(239, 68, 68, 0.12)",
            border: "1px solid rgba(239, 68, 68, 0.25)",
            color: "#EF4444",
          }}
        >
          {label ||
            (normalized === "MANUAL_REQUIRED"
              ? uiText("s2fce2c1485")
              : uiText("s471434ca39"))}
        </Tag>
      );
    default:
      return (
        <Tag
          style={{
            borderRadius: 4,
            fontWeight: 600,
            fontSize: 11,
            background: "var(--bg-surface-alt, #F8FAFC)",
            border: "1px solid var(--border-subtle, #E5E7EB)",
            color: "var(--text-secondary, #4B5563)",
          }}
        >
          {label || status}
        </Tag>
      );
  }
};
