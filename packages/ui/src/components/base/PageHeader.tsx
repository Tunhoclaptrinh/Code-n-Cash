import React from "react";
import { Space, Typography } from "antd";
const { Title, Paragraph } = Typography;
export interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  extra?: React.ReactNode;
  tags?: React.ReactNode;
}
export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  icon,
  extra,
  tags,
}) => {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        flexWrap: "wrap",
        gap: 16,
        marginBottom: 20,
      }}
    >
      <div>
        <Space size={10} style={{ marginBottom: 4 }}>
          {icon}
          <Title level={4} style={{ margin: 0, fontWeight: 800 }}>
            {title}
          </Title>
          {tags}
        </Space>

        {subtitle && (
          <Paragraph
            style={{ color: "#6B7280", fontSize: 13, margin: 0, marginTop: 2 }}
          >
            {subtitle}
          </Paragraph>
        )}
      </div>

      {extra && (
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {extra}
        </div>
      )}
    </div>
  );
};
