import { Modal } from "antd";
interface Props {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  busy,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Modal
      open={open}
      title={title}
      okText={confirmLabel}
      cancelText={cancelLabel}
      confirmLoading={busy}
      onOk={onConfirm}
      onCancel={onCancel}
    >
      {body}
    </Modal>
  );
}
