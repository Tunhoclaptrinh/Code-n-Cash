import { useState } from "react";
import { Alert, Modal, Space, Switch, Table, Tag, Typography } from "antd";
import { CheckCircleFilled, CloseCircleFilled } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import type { ImportValidationReport } from "@codecash/contracts";

type Result = ImportValidationReport["results"][number];

/**
 * Second step of an import (Base import-export): shows the server's dry-run report row by row
 * and imports only the valid rows once the user confirms.
 */
export function ImportPreviewModal({
  open,
  report,
  columns,
  loading,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  report?: ImportValidationReport;
  /** Field keys and labels, in file order. */
  columns: { key: string; label: string }[];
  loading?: boolean;
  onCancel: () => void;
  onConfirm: (validRows: Record<string, unknown>[]) => void;
}) {
  const { t } = useTranslation("common");
  const [errorsOnly, setErrorsOnly] = useState(false);
  const summary = report?.summary ?? { total: 0, valid: 0, error: 0 };
  const results = (report?.results ?? []).filter(
    (r) => !errorsOnly || r.status === "invalid",
  );
  const label = (key: string) =>
    columns.find((column) => column.key === key)?.label ?? key;
  /** `REQUIRED:name` → "Bắt buộc: Tên". */
  const describe = (code: string) => {
    const [kind, field] = code.split(":");
    const text = t(`importPreview.errors.${kind}`, { defaultValue: kind });
    return field ? `${text}: ${label(field)}` : text;
  };

  return (
    <Modal
      open={open}
      title={t("importPreview.title")}
      width={960}
      centered
      onCancel={onCancel}
      okText={t("importPreview.confirm", { count: summary.valid })}
      cancelText={t("importPreview.cancel")}
      okButtonProps={{ disabled: !summary.valid, loading }}
      onOk={() =>
        onConfirm(
          (report?.results ?? [])
            .filter((r) => r.status === "valid")
            .map((r) => r.data),
        )
      }
      destroyOnHidden
    >
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        <Space wrap>
          <Tag>{t("importPreview.total", { count: summary.total })}</Tag>
          <Tag color="success" icon={<CheckCircleFilled />}>
            {t("importPreview.valid", { count: summary.valid })}
          </Tag>
          <Tag color="error" icon={<CloseCircleFilled />}>
            {t("importPreview.invalid", { count: summary.error })}
          </Tag>
          <Space size={6}>
            <Switch
              size="small"
              checked={errorsOnly}
              onChange={setErrorsOnly}
            />
            <Typography.Text>{t("importPreview.errorsOnly")}</Typography.Text>
          </Space>
        </Space>
        <Alert
          showIcon
          type={
            summary.error ? (summary.valid ? "warning" : "error") : "success"
          }
          title={
            summary.error
              ? summary.valid
                ? t("importPreview.partial", {
                    error: summary.error,
                    valid: summary.valid,
                  })
                : t("importPreview.none")
              : t("importPreview.allValid", { count: summary.valid })
          }
        />
        <Table<Result>
          size="small"
          rowKey="row"
          dataSource={results}
          pagination={{ pageSize: 8, hideOnSinglePage: true }}
          scroll={{ x: "max-content", y: 360 }}
          columns={[
            { key: "row", dataIndex: "row", title: "#", width: 56 },
            {
              key: "status",
              dataIndex: "status",
              title: t("importPreview.status"),
              width: 110,
              render: (status: Result["status"]) =>
                status === "valid" ? (
                  <Tag color="success">{t("importPreview.rowValid")}</Tag>
                ) : (
                  <Tag color="error">{t("importPreview.rowInvalid")}</Tag>
                ),
            },
            ...columns.map((column) => ({
              key: column.key,
              title: column.label,
              render: (_: unknown, r: Result) =>
                String(r.data[column.key] ?? ""),
            })),
            {
              key: "errors",
              title: t("importPreview.errorsColumn"),
              render: (_: unknown, r: Result) =>
                r.errors.length ? (
                  <Typography.Text type="danger" style={{ fontSize: 12.5 }}>
                    {r.errors.map(describe).join("; ")}
                  </Typography.Text>
                ) : (
                  "—"
                ),
            },
          ]}
        />
      </Space>
    </Modal>
  );
}
