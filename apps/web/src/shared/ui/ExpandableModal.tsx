import { useState, type ReactNode } from "react";
import { Button, Modal, Tooltip } from "antd";
import { CompressOutlined, ExpandOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";

/** Modal with a toggle to fill the screen, for records with long detail (view, edit, delete). */
export function ExpandableModal({
  open,
  title,
  footer,
  width = 900,
  onClose,
  children,
}: {
  open: boolean;
  title: ReactNode;
  footer?: ReactNode;
  width?: number;
  onClose: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation("common");
  const [full, setFull] = useState(false);
  const label = t(full ? "modal.exitFullscreen" : "modal.fullscreen");
  return (
    <Modal
      open={open}
      onCancel={onClose}
      afterOpenChange={(visible) => !visible && setFull(false)}
      footer={footer}
      width={full ? "100vw" : width}
      centered={!full}
      destroyOnHidden
      style={
        full ? { top: 0, maxWidth: "100vw", margin: 0, padding: 0 } : undefined
      }
      styles={{
        container: full ? { borderRadius: 0, minHeight: "100vh" } : undefined,
        body: full
          ? { height: "calc(100vh - 150px)", overflow: "auto" }
          : { maxHeight: "68vh", overflow: "auto" },
      }}
      title={
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            paddingRight: 28,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>{title}</div>
          <Tooltip title={label}>
            <Button
              type="text"
              size="small"
              icon={full ? <CompressOutlined /> : <ExpandOutlined />}
              onClick={() => setFull(!full)}
              aria-label={label}
              data-testid="modal-fullscreen"
            />
          </Tooltip>
        </div>
      }
    >
      {children}
    </Modal>
  );
}
