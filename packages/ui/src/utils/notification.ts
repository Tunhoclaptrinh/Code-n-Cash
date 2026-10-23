import { message, notification } from "antd";
export const notify = {
  success: (text: string) => void message.success(text),
  error: (text: string) => void message.error(text),
  warning: (text: string) => void message.warning(text),
  info: (text: string) => void message.info(text),
  open: notification.open,
};
