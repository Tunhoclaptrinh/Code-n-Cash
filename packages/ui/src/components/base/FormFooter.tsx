import { uiText } from "../../i18n";
import React from "react";
import { Space } from "antd";
import { SaveOutlined, CloseOutlined, UndoOutlined } from "@ant-design/icons";
import { BaseButton } from "./BaseButton";
import { FormFooterProps } from "./types";
export const FormFooter: React.FC<FormFooterProps> = ({
  submitText = uiText("s2fd5312bdf"),
  cancelText = uiText("s247d4b1efe"),
  resetText,
  loading = false,
  disabled = false,
  align = "center",
  onCancel,
  onSubmit,
  onReset,
  extra,
  style,
}) => {
  const justifyMap: Record<string, string> = {
    center: "center",
    left: "flex-start",
    right: "flex-end",
    "space-between": "space-between",
  };
  return (
    <div
      style={{
        display: "flex",
        justifyContent: justifyMap[align] || "center",
        alignItems: "center",
        gap: 12,
        paddingTop: 16,
        marginTop: 16,
        borderTop: "1px solid var(--border-subtle, #E5E7EB)",
        width: "100%",
        ...style,
      }}
    >
      {extra && (
        <div
          style={{
            marginRight:
              align === "space-between" || align === "center" ? 0 : "auto",
          }}
        >
          {extra}
        </div>
      )}

      <Space size="middle">
        {onReset && resetText && (
          <BaseButton
            variant="secondary"
            icon={<UndoOutlined />}
            onClick={onReset}
            disabled={disabled || loading}
            style={{ minWidth: 96, height: 32 }}
          >
            {resetText}
          </BaseButton>
        )}

        {onCancel && (
          <BaseButton
            variant="secondary"
            icon={<CloseOutlined />}
            onClick={onCancel}
            disabled={disabled || loading}
            style={{ minWidth: 96, height: 32 }}
          >
            {cancelText}
          </BaseButton>
        )}

        {onSubmit && (
          <BaseButton
            variant="primary"
            icon={<SaveOutlined />}
            loading={loading}
            disabled={disabled}
            glow
            onClick={onSubmit}
            style={{ minWidth: 120, height: 32 }}
          >
            {submitText}
          </BaseButton>
        )}
      </Space>
    </div>
  );
};
export default FormFooter;
