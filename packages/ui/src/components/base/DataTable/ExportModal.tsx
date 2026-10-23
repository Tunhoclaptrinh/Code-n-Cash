import { uiText } from "../../../i18n";
import React, { useState, useEffect } from "react";
import {
  Modal,
  Radio,
  Space,
  Checkbox,
  Typography,
  Divider,
  InputNumber,
} from "antd";
import { DownloadOutlined, OrderedListOutlined } from "@ant-design/icons";
import { FilterConfig, DataTableColumn } from "./types";
import { BaseButton } from "../BaseButton";
export interface ExportModalProps {
  visible: boolean;
  onCancel: () => void;
  onOk: (options: {
    scope: "page" | "all" | "custom";
    format: "xlsx" | "csv" | "json";
    columns?: string[];
    limit?: number;
  }) => void;
  loading?: boolean;
  totalRecords?: number;
  currentPageSize?: number;
  filters?: FilterConfig[];
  currentFilters?: any;
  columns?: DataTableColumn[];
  fieldLabelMap?: Record<string, string>;
}
export const ExportModal: React.FC<ExportModalProps> = ({
  visible,
  onCancel,
  onOk,
  loading = false,
  totalRecords = 0,
  currentPageSize = 10,
  columns = [],
}) => {
  const [scope, setScope] = useState<"page" | "all" | "custom">("all");
  const [format, setFormat] = useState<"xlsx" | "csv" | "json">("csv");
  const [customLimit, setCustomLimit] = useState<number>(100);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  useEffect(() => {
    if (visible) {
      const validCols = columns
        .filter(
          (c) =>
            c.key &&
            c.key !== "actions" &&
            c.key !== "selection" &&
            !c.exportHidden,
        )
        .map((c) => String(c.key || c.dataIndex));
      setSelectedColumns(validCols);
    }
  }, [visible, columns]);
  const handleOk = () => {
    onOk({
      scope,
      format,
      columns: selectedColumns,
      limit: scope === "custom" ? customLimit : undefined,
    });
  };
  return (
    <Modal
      open={visible}
      onCancel={onCancel}
      title={
        <Space>
          <DownloadOutlined style={{ color: "#315bea" }} />
          <span style={{ fontWeight: 700, fontSize: 16 }}>
            {uiText("export.title")}
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
            onClick={handleOk}
            loading={loading}
            icon={<DownloadOutlined />}
            disabled={selectedColumns.length === 0}
            glow
            style={{ minWidth: 140, height: 32 }}
          >
            {uiText("export.start")}
          </BaseButton>
        </div>
      }
      width={680}
      centered
      destroyOnHidden
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.2fr 1fr",
          gap: 24,
          padding: "12px 0",
        }}
      >
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <section>
            <Typography.Text
              strong
              style={{ display: "block", marginBottom: 8 }}
            >
              {uiText("export.scope")}
            </Typography.Text>
            <Radio.Group
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              style={{ display: "flex", flexDirection: "column", gap: 8 }}
            >
              <Radio value="all">
                {uiText("export.scopeAll", { count: totalRecords })}
              </Radio>
              <Radio value="page">
                {uiText("export.scopePage", { count: currentPageSize })}
              </Radio>
              <div style={{ display: "flex", alignItems: "center" }}>
                <Radio value="custom">{uiText("export.scopeLimit")}</Radio>
                {scope === "custom" && (
                  <InputNumber
                    min={1}
                    max={10000}
                    value={customLimit}
                    onChange={(val) => setCustomLimit(val || 100)}
                    size="small"
                    style={{ width: 80, marginLeft: 4 }}
                  />
                )}
              </div>
            </Radio.Group>
          </section>

          <Divider style={{ margin: "10px 0" }} />

          <section>
            <Typography.Text
              strong
              style={{ display: "block", marginBottom: 8 }}
            >
              {uiText("export.format")}
            </Typography.Text>
            <Radio.Group
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              style={{ display: "flex", gap: 20 }}
            >
              <Radio value="csv">{uiText("export.formatCsv")}</Radio>
              <Radio value="json">{uiText("export.formatJson")}</Radio>
            </Radio.Group>
          </section>
        </Space>

        <section style={{ borderLeft: "1px solid #E5E7EB", paddingLeft: 20 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <Typography.Text strong>{uiText("export.columns")}</Typography.Text>
            <OrderedListOutlined style={{ color: "#9CA3AF" }} />
          </div>
          <div
            style={{
              maxHeight: 280,
              overflowY: "auto",
              background: "#F9FAFB",
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid #E5E7EB",
            }}
          >
            <Checkbox.Group
              style={{
                width: "100%",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
              value={selectedColumns}
              onChange={(vals) => setSelectedColumns(vals as string[])}
            >
              {columns
                .filter(
                  (c) =>
                    c.key &&
                    c.key !== "actions" &&
                    c.key !== "selection" &&
                    !c.exportHidden,
                )
                .map((col) => {
                  const keyStr = String(col.key || col.dataIndex);
                  const titleStr =
                    typeof col.title === "string" ? col.title : keyStr;
                  return (
                    <Checkbox key={keyStr} value={keyStr}>
                      {titleStr}
                    </Checkbox>
                  );
                })}
            </Checkbox.Group>
          </div>
        </section>
      </div>
    </Modal>
  );
};
export default ExportModal;
