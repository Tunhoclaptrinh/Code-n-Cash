import { uiText } from "../../i18n";
import { useEffect } from "react";
import { Drawer, Form, Space } from "antd";
import { BaseButton } from "./BaseButton";
import { FormDrawerProps } from "./types";
export function FormDrawer<T = any>({
  open,
  title,
  icon,
  initialValues,
  loading = false,
  width = 460,
  submitText = uiText("s3633ceb693"),
  cancelText = uiText("s247d4b1efe"),
  onClose,
  onSubmit,
  children,
}: FormDrawerProps<T>) {
  const [form] = Form.useForm<T>();
  useEffect(() => {
    if (open) {
      form.resetFields();
      if (initialValues) {
        form.setFieldsValue(initialValues as any);
      }
    }
  }, [open, initialValues, form]);
  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      await onSubmit(values);
      onClose();
    } catch (error) {
      console.warn("Form validation failed:", error);
    }
  };
  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={width}
      title={
        <Space size={8}>
          {icon}
          <span style={{ fontWeight: 700, fontSize: 16 }}>{title}</span>
        </Space>
      }
      styles={{
        body: { padding: "20px" },
      }}
      extra={
        <Space>
          <BaseButton
            variant="ghost"
            size="small"
            onClick={onClose}
            disabled={loading}
          >
            {cancelText}
          </BaseButton>
          <BaseButton
            variant="primary"
            size="small"
            loading={loading}
            onClick={handleOk}
          >
            {submitText}
          </BaseButton>
        </Space>
      }
      destroyOnHidden
    >
      <Form form={form} layout="vertical" initialValues={initialValues}>
        {typeof children === "function" ? children(form) : children}
      </Form>
    </Drawer>
  );
}
