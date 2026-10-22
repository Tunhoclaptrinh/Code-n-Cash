import { uiText } from "../../i18n";
import React from "react";
import { Modal, Space, Typography } from "antd";
import { ExclamationCircleFilled } from "@ant-design/icons";
import { FormFooter } from "./FormFooter";
import { ConfirmModalProps } from "./types";
const { Paragraph } = Typography;
export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  open,
  title,
  content,
  confirmText = uiText("sd53daf2f46"),
  cancelText = uiText("s247d4b1efe"),
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}) => {
  return (
    <Modal
      open={open}
      onCancel={onCancel}
      title={
        <Space>
          <ExclamationCircleFilled
            style={{ color: danger ? "#EF4444" : "#fcc20f", fontSize: 20 }}
          />
          <span style={{ fontWeight: 700, fontSize: 16 }}>{title}</span>
        </Space>
      }
      footer={
        <FormFooter
          align="center"
          cancelText={cancelText}
          submitText={confirmText}
          loading={loading}
          onCancel={onCancel}
          onSubmit={onConfirm}
          style={{ marginTop: 0, paddingTop: 14 }}
        />
      }
      styles={{
        body: { padding: "16px 0" },
      }}
      centered
      destroyOnHidden
    >
      <Paragraph
        style={{ color: "#4B5563", fontSize: 14, lineHeight: 1.6, margin: 0 }}
      >
        {content}
      </Paragraph>
    </Modal>
  );
};
