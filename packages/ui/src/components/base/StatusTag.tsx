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
          icon={
            <CheckCircleFilled
              style={{ color: "var(--status-success, #10B981)" }}
            />
          }
          style={{
            borderRadius: 4,
            fontWeight: 700,
            fontSize: 11,
            background: "rgba(16, 185, 129, 0.12)",
            border: "1px solid rgba(16, 185, 129, 0.25)",
            color: "var(--status-success, #10B981)",
          }}
        >
          {label ||
            (normalized === "AUTO_APPROVED"
              ? uiText("status.aiApproved")
              : uiText("status.success"))}
        </Tag>
      );
    case "PROCESSING":
    case "PENDING":
    case "IN_TRANSIT":
      return (
        <Tag
          icon={
            <SyncOutlined
              spin
              style={{ color: "var(--status-info, #3B82F6)" }}
            />
          }
          style={{
            borderRadius: 4,
            fontWeight: 700,
            fontSize: 11,
            background: "rgba(59, 130, 246, 0.12)",
            border: "1px solid rgba(59, 130, 246, 0.25)",
            color: "var(--status-info, #3B82F6)",
          }}
        >
          {label || uiText("status.processing")}
        </Tag>
      );
    case "PENDING_REVIEW":
    case "AWAITING":
    case "WARNING":
      return (
        <Tag
          icon={
            <ClockCircleFilled
              style={{ color: "var(--status-warning, #F59E0B)" }}
            />
          }
          style={{
            borderRadius: 4,
            fontWeight: 700,
            fontSize: 11,
            background: "rgba(245, 158, 11, 0.12)",
            border: "1px solid rgba(245, 158, 11, 0.25)",
            color: "var(--status-warning, #F59E0B)",
          }}
        >
          {label || uiText("status.awaiting")}
        </Tag>
      );
    case "AUTO_HEALED":
    case "HEALED":
      return (
        <Tag
          icon={
            <ThunderboltFilled
              style={{ color: "var(--status-accent, #8B5CF6)" }}
            />
          }
          style={{
            borderRadius: 4,
            fontWeight: 700,
            fontSize: 11,
            background: "rgba(139, 92, 246, 0.12)",
            border: "1px solid rgba(139, 92, 246, 0.25)",
            color: "var(--status-accent, #8B5CF6)",
          }}
        >
          {label || uiText("status.aiRecovered")}
        </Tag>
      );
    case "FAILED":
    case "ERROR":
    case "DISCONNECTED":
    case "MANUAL_REQUIRED":
      return (
        <Tag
          icon={
            <CloseCircleFilled
              style={{ color: "var(--status-danger, #EF4444)" }}
            />
          }
          style={{
            borderRadius: 4,
            fontWeight: 700,
            fontSize: 11,
            background: "rgba(239, 68, 68, 0.12)",
            border: "1px solid rgba(239, 68, 68, 0.25)",
            color: "var(--status-danger, #EF4444)",
          }}
        >
          {label ||
            (normalized === "MANUAL_REQUIRED"
              ? uiText("status.manualRequired")
              : uiText("status.failed"))}
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
