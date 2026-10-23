import React from "react";
import { Drawer } from "antd";
import { ActionDrawerProps } from "./types";
export const ActionDrawer: React.FC<ActionDrawerProps> = ({
  open,
  title,
  onClose,
  width = 460,
  footer,
  children,
}) => {
  return (
    <Drawer
      title={title}
      placement="right"
      width={width}
      open={open}
      onClose={onClose}
      footer={footer}
      styles={{
        body: { padding: 20 },
      }}
      destroyOnHidden
    >
      {children}
    </Drawer>
  );
};
