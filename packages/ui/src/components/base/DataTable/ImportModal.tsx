import { uiText } from "../../../i18n";
import React, { useState } from "react";
import { Modal, Upload, message, Typography, Space } from "antd";
import {
  InboxOutlined,
  UploadOutlined,
  DownloadOutlined,
} from "@ant-design/icons";
import { DataTableColumn } from "./types";
import { BaseButton } from "../BaseButton";
const { Dragger } = Upload;
const { Paragraph, Text } = Typography;
export interface ImportModalProps {
  visible: boolean;
  onCancel: () => void;
  columns?: DataTableColumn[];
  onImport?: (file: File) => void;
  onDownloadTemplate?: (
    selectedCols?: string[],
    withMockData?: boolean,
  ) => void;
  loading?: boolean;
  entityName?: string;
}
export const ImportModal: React.FC<ImportModalProps> = ({
  visible,
  onCancel,
  onImport,
  onDownloadTemplate,
  loading = false,
  entityName = uiText("import.defaultEntity"),
}) => {
  const [fileList, setFileList] = useState<any[]>([]);
  const handleUpload = () => {
    if (fileList.length === 0) {
      message.warning(uiText("import.chooseFile"));
      return;
    }
    const file = fileList[0].originFileObj || fileList[0];
    if (onImport) {
      onImport(file);
    }
  };
  return (
    <Modal
      open={visible}
      onCancel={onCancel}
      title={
        <Space>
          <UploadOutlined style={{ color: "#315bea" }} />
          <span style={{ fontWeight: 700, fontSize: 16 }}>
            {uiText("import.title", { name: entityName })}
          </span>
        </Space>
      }
      footer={
        <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
          <BaseButton
            variant="secondary"
            size="small"
            onClick={onCancel}
            style={{ minWidth: 96, height: 32 }}
          >
            {uiText("action.cancel")}
          </BaseButton>
          <BaseButton
            variant="brand"
            size="small"
            onClick={handleUpload}
            loading={loading}
            icon={<UploadOutlined />}
            disabled={fileList.length === 0}
            glow
            style={{ minWidth: 140, height: 32 }}
          >
            {uiText("import.submit")}
          </BaseButton>
        </div>
      }
      width={560}
      centered
      destroyOnHidden
    >
      <div style={{ padding: "12px 0" }}>
        <div
          style={{
            marginBottom: 16,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Text type="secondary">{uiText("import.templateHint")}</Text>
          {onDownloadTemplate && (
            <BaseButton
              variant="secondary"
              size="small"
              icon={<DownloadOutlined />}
              onClick={() => onDownloadTemplate()}
            >
              {uiText("import.downloadTemplate")}
            </BaseButton>
          )}
        </div>

        <Dragger
          multiple={false}
          fileList={fileList}
          beforeUpload={(file) => {
            setFileList([file]);
            return false;
          }}
          onRemove={() => setFileList([])}
          accept=".csv,.json"
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined style={{ color: "#315bea", fontSize: 44 }} />
          </p>
          <p className="ant-upload-text" style={{ fontWeight: 600 }}>
            {uiText("import.dropzone")}
          </p>
          <Paragraph type="secondary" style={{ fontSize: 12, margin: 0 }}>
            {uiText("import.formats")}
          </Paragraph>
        </Dragger>
      </div>
    </Modal>
  );
};
export default ImportModal;
