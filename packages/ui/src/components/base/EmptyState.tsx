import { uiText } from "../../i18n";
import React from "react";
import { Typography } from "antd";
import { InboxOutlined } from "@ant-design/icons";
import { BaseButton } from "./BaseButton";
import { EmptyStateProps } from "./types";
const { Paragraph } = Typography;
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = <InboxOutlined style={{ fontSize: 44, color: "#9CA3AF" }} />,
  title = uiText("se77813987e"),
  description = uiText("s836584783e"),
  actionText,
  onAction,
}) => {
  return (
    <div
      style={{
        padding: "48px 24px",
        textAlign: "center",
        background: "var(--bg-root, #F8FAFC)",
        borderRadius: 12,
        border: "1px dashed var(--border-subtle, #E5E7EB)",
      }}
    >
      <div style={{ marginBottom: 12 }}>{icon}</div>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>
        {title}
      </div>
      <Paragraph
        style={{
          color: "#6B7280",
          fontSize: 13,
          maxWidth: 420,
          margin: "0 auto 16px",
        }}
      >
        {description}
      </Paragraph>
      {actionText && onAction && (
        <BaseButton variant="brand" onClick={onAction} glow>
          {actionText}
        </BaseButton>
      )}
    </div>
  );
};
export default EmptyState;
