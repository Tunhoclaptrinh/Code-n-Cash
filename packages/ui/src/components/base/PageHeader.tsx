import React from "react";
import { QuestionCircleOutlined } from "@ant-design/icons";
import { Space, Typography, Tooltip } from "antd";
const { Title, Paragraph } = Typography;
export interface PageHeaderProps {
  title: React.ReactNode;
  tooltip?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  extra?: React.ReactNode;
  tags?: React.ReactNode;
}
export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  tooltip,
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
        minWidth: 0,
      }}
    >
      <div>
        <Space wrap size={10} style={{ marginBottom: 4 }}>
          {icon}
          <Title level={3} style={{ margin: 0, fontWeight: 650 }}>
            {title}
          </Title>
          {tooltip && (
            <Tooltip title={tooltip}>
              <QuestionCircleOutlined />
            </Tooltip>
          )}
          {tags}
        </Space>

        {subtitle && (
          <Paragraph type="secondary" style={{ margin: 0, marginTop: 4 }}>
            {subtitle}
          </Paragraph>
        )}
      </div>

      {extra && (
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          {extra}
        </div>
      )}
    </div>
  );
};
