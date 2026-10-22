import React, { isValidElement, ReactElement } from "react";
import {
  Card,
  Statistic,
  Tag,
  Skeleton,
  Space,
  Row,
  Col,
  Spin,
  theme,
} from "antd";
import { ArrowUpOutlined, ArrowDownOutlined } from "@ant-design/icons";
import { formatNumber } from "../../utils/formatters";
import {
  StatisticCardProps,
  StatisticsCardProps,
  StatisticsItem,
} from "./types";
export const StatisticCard: React.FC<StatisticCardProps> = ({
  title,
  value,
  prefix,
  suffix,
  precision,
  icon,
  iconBg = "linear-gradient(135deg, rgba(49, 91, 234, 0.08) 0%, rgba(252, 194, 15, 0.08) 100%)",
  trend,
  tag,
  subText,
  valueColor,
  loading = false,
  extra,
  onClick,
  style,
}) => {
  const { token } = theme.useToken();
  return (
    <Card
      variant="borderless"
      onClick={onClick}
      style={{
        borderRadius: 10,
        height: "100%",
        cursor: onClick ? "pointer" : "default",
        transition: "all 0.3s ease",
        boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.04)",
        border: `1px solid ${token.colorBorderSecondary}`,
        ...style,
      }}
      styles={{ body: { padding: 18 } }}
    >
      <Skeleton loading={loading} active paragraph={{ rows: 2 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 10,
          }}
        >
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: token.colorTextSecondary,
            }}
          >
            {title}
          </span>

          <Space size="small">
            {tag && (
              <Tag
                color={tag.color || "#10B981"}
                style={{
                  borderRadius: 4,
                  fontWeight: 700,
                  fontSize: 11,
                  margin: 0,
                }}
              >
                {tag.text}
              </Tag>
            )}
            {extra}
          </Space>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <Statistic
              value={value}
              prefix={prefix}
              suffix={suffix}
              precision={precision}
              valueStyle={{
                fontWeight: 800,
                fontSize: 28,
                letterSpacing: "-0.5px",
                color: valueColor || "inherit",
                fontFamily: token.fontFamily,
              }}
            />

            {trend && (
              <div
                style={{
                  marginTop: 6,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Tag
                  color={trend.isIncrease ? "#10B981" : "#EF4444"}
                  style={{
                    borderRadius: 4,
                    border: "none",
                    fontWeight: 700,
                    fontSize: 11,
                    padding: "1px 6px",
                  }}
                >
                  {trend.isIncrease ? (
                    <ArrowUpOutlined />
                  ) : (
                    <ArrowDownOutlined />
                  )}{" "}
                  {trend.value}
                </Tag>
                {trend.label && (
                  <span
                    style={{ fontSize: 12, color: token.colorTextSecondary }}
                  >
                    {trend.label}
                  </span>
                )}
              </div>
            )}

            {subText && (
              <div
                style={{
                  marginTop: 4,
                  fontSize: 12,
                  color: token.colorTextSecondary,
                }}
              >
                {subText}
              </div>
            )}
          </div>

          {icon && (
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: iconBg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 20,
                flexShrink: 0,
              }}
            >
              {icon}
            </div>
          )}
        </div>
      </Skeleton>
    </Card>
  );
};
export const StatisticsCard: React.FC<StatisticsCardProps> = ({
  title,
  data = [],
  loading = false,
  containerStyle = {},
  cardStyle = {},
  colSpan = { span: 24, sm: 12, md: 6 },
  hideCard = false,
  rowGutter = 10,
  borderleft = false,
  statShadow = true,
}) => {
  const renderStatisticItem = (item: StatisticsItem) => {
    const iconElement =
      item.icon && isValidElement(item.icon)
        ? React.cloneElement(item.icon as ReactElement<any>, {
            style: {
              color: item.valueColor || "#315bea",
              ...((item.icon as ReactElement<any>).props.style || {}),
            },
          })
        : item.icon;
    return (
      <div
        style={{
          background: item.backgroundColor || "var(--bg-surface-card, #FFFFFF)",
          borderRadius: 8,
          padding: "12px 16px",
          border: "1px solid var(--border-subtle, #E5E7EB)",
          borderLeft:
            borderleft && item.valueColor
              ? `4px solid ${item.valueColor}`
              : undefined,
          boxShadow: statShadow ? "0 1px 2px rgba(0, 0, 0, 0.03)" : "none",
          cursor: item.onClick ? "pointer" : "default",
          transition: "all 0.25s ease",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          height: "100%",
          ...cardStyle,
        }}
        onClick={item.onClick}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {iconElement && (
            <span
              style={{
                fontSize: 16,
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              {iconElement}
            </span>
          )}
          <div
            style={{
              fontSize: 13,
              color: "var(--text-secondary, #374151)",
              fontWeight: 600,
            }}
          >
            {item.title}
          </div>
        </div>

        <div
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: item.valueColor || "var(--text-primary, #111827)",
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            lineHeight: 1,
            marginLeft: 12,
          }}
        >
          {typeof item.value === "number"
            ? formatNumber(item.value)
            : item.value}
        </div>
      </div>
    );
  };
  const content = (
    <Spin spinning={loading}>
      {title && (
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            marginBottom: 10,
            color: "#4B5563",
          }}
        >
          {title}
        </div>
      )}
      <Row gutter={[rowGutter, rowGutter]}>
        {data.map((item, index) => (
          <Col {...(item.colSpan || colSpan)} key={index}>
            {renderStatisticItem(item)}
          </Col>
        ))}
      </Row>
    </Spin>
  );
  if (hideCard) {
    return <div style={{ ...containerStyle }}>{content}</div>;
  }
  return (
    <Card
      style={{
        borderRadius: 10,
        border: "1px solid var(--border-subtle, #E5E7EB)",
        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.03)",
        ...containerStyle,
      }}
      styles={{ body: { padding: 16 } }}
    >
      {content}
    </Card>
  );
};
