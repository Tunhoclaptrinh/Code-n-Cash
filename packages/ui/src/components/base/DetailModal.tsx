import { uiText } from "../../i18n";
import React from "react";
import { Modal, Descriptions, Space } from "antd";
import { EyeOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import { BaseButton } from "./BaseButton";
import { StatusTag } from "./StatusTag";
export interface DetailItem {
  key: string;
  label: string;
  value: React.ReactNode;
  span?: number;
}
export interface DetailModalProps {
  open: boolean;
  title?: React.ReactNode;
  entityName?: string;
  record?: any;
  items?: DetailItem[];
  status?: string;
  statusLabel?: string;
  onClose: () => void;
  onEdit?: (record: any) => void;
  onDelete?: (record: any) => void;
  extraActions?: React.ReactNode;
  width?: number | string;
  children?: React.ReactNode;
}
export const DetailModal: React.FC<DetailModalProps> = ({
  open,
  title,
  entityName = uiText("s6e90be127a"),
  record,
  items = [],
  status,
  statusLabel,
  onClose,
  onEdit,
  onDelete,
  extraActions,
  width = 640,
  children,
}) => {
  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingRight: 24,
          }}
        >
          <Space size={8}>
            <EyeOutlined style={{ color: "#315bea" }} />
            <span style={{ fontWeight: 700, fontSize: 16 }}>
              {title || uiText("se06590af80", { v0: entityName })}
            </span>
          </Space>
          {status && <StatusTag status={status} text={statusLabel} />}
        </div>
      }
      footer={
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 12,
          }}
        >
          {onDelete && record && (
            <span
              role="button"
              tabIndex={0}
              onClick={() => {
                onDelete(record);
                onClose();
              }}
              style={{
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                color: "#EF4444",
                fontSize: 13,
                fontWeight: 600,
                padding: "5px 10px",
                borderRadius: 4,
                transition: "all 0.15s ease",
                userSelect: "none",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "#DC2626";
                e.currentTarget.style.backgroundColor =
                  "rgba(239, 68, 68, 0.08)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "#EF4444";
                e.currentTarget.style.backgroundColor = "transparent";
              }}
              title={uiText("s2943962c53", { v0: entityName })}
            >
              <DeleteOutlined style={{ fontSize: 13, color: "#EF4444" }} />
              <span>{uiText("saa1d94fc16")}</span>
            </span>
          )}

          <BaseButton
            variant="ghost"
            size="small"
            onClick={onClose}
            style={{ minWidth: 80 }}
          >
            {uiText("sd2b73ab2ad")}
          </BaseButton>
          {extraActions}
          {onEdit && record && (
            <BaseButton
              variant="primary"
              size="small"
              icon={<EditOutlined />}
              onClick={() => {
                onEdit(record);
                onClose();
              }}
              style={{ minWidth: 80 }}
            >
              {uiText("sb59e6523fc")}
            </BaseButton>
          )}
        </div>
      }
      width={width}
      centered
      destroyOnHidden
    >
      <div style={{ padding: "8px 0" }}>
        {items.length > 0 && (
          <Descriptions
            bordered
            size="small"
            column={{ xs: 1, sm: 2, md: 2 }}
            style={{ marginBottom: 16 }}
          >
            {items.map((item) => (
              <Descriptions.Item
                key={item.key}
                label={item.label}
                span={item.span || 1}
              >
                {item.value}
              </Descriptions.Item>
            ))}
          </Descriptions>
        )}

        {children}
      </div>
    </Modal>
  );
};
export default DetailModal;
