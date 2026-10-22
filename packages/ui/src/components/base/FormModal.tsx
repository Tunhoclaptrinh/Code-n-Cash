import { uiText } from "../../i18n";
import { useEffect } from "react";
import { Modal, Form, Space, Spin } from "antd";
import { FormFooter } from "./FormFooter";
import { FormModalProps } from "./types";
export function FormModal<T = any>({
  open,
  title,
  entityName,
  isEditing,
  icon,
  initialValues,
  loading = false,
  width = 580,
  submitText = uiText("action.save"),
  cancelText = uiText("action.cancel"),
  resetText,
  footerAlign = "center",
  footer,
  onClose,
  onSubmit,
  onReset,
  children,
}: FormModalProps<T>) {
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
  const handleReset = () => {
    form.resetFields();
    if (onReset) {
      onReset();
    }
  };
  const modalTitle =
    title ||
    (entityName ? (
      <Space size={8}>
        {icon}
        <span style={{ fontWeight: 700, fontSize: 16 }}>
          {isEditing
            ? uiText("form.editTitle", { name: entityName })
            : uiText("form.createTitle", { name: entityName })}
        </span>
      </Space>
    ) : (
      uiText("form.defaultEntity")
    ));
  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={width}
      title={modalTitle}
      footer={
        footer === undefined ? (
          <FormFooter
            align={footerAlign}
            submitText={submitText}
            cancelText={cancelText}
            resetText={resetText}
            loading={loading}
            onCancel={onClose}
            onSubmit={handleOk}
            onReset={resetText ? handleReset : undefined}
            style={{ marginTop: 0, paddingTop: 12 }}
          />
        ) : (
          footer
        )
      }
      styles={{
        body: { padding: "16px 0 0 0" },
      }}
      centered
      destroyOnHidden
    >
      <Spin spinning={loading}>
        <Form form={form} layout="vertical" initialValues={initialValues}>
          {typeof children === "function" ? children(form) : children}
        </Form>
      </Spin>
    </Modal>
  );
}
