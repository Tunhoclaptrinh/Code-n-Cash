import { DemoFormFill } from "@/shared/ui/DemoFillButton";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Button,
  App as AntApp,
  Form,
  Input,
  Select,
  Space,
  Tag,
  Tooltip,
  Typography,
  Upload,
  type UploadFile,
} from "antd";
import {
  CheckCircleFilled,
  CloseCircleFilled,
  CloudUploadOutlined,
  DeleteOutlined,
  ExclamationCircleFilled,
  MinusCircleOutlined,
} from "@ant-design/icons";
import { BaseButton, BaseCard, ConfirmModal, FormModal } from "@codecash/ui";
import { formatDateTime } from "@/shared/lib/format";
import {
  deleteDataset,
  uploadDataset,
  type Dataset,
  type DatasetFileStatus,
} from "../api/engine.api";

export const DATA_PACK = "datapack";

const statusTag: Record<
  DatasetFileStatus,
  { color: string; icon: React.ReactNode }
> = {
  ok: { color: "success", icon: <CheckCircleFilled /> },
  missing: { color: "error", icon: <CloseCircleFilled /> },
  invalid: { color: "error", icon: <CloseCircleFilled /> },
  ambiguous: { color: "warning", icon: <ExclamationCircleFilled /> },
  optional: { color: "default", icon: <MinusCircleOutlined /> },
};

/**
 * Picks what the engine evaluates: the bundled Data Pack or a dataset uploaded to run from scratch
 * (hidden test). Shows which input files the engine found before anything is run.
 */
export function DatasetPanel({
  source,
  datasets,
  loading,
  canManage,
  onSourceChange,
  onChanged,
}: {
  source: string;
  datasets: Dataset[];
  loading: boolean;
  canManage: boolean;
  onSourceChange: (source: string) => void;
  onChanged: () => Promise<unknown>;
}) {
  const { t } = useTranslation("platform");
  const { message } = AntApp.useApp();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dataset = datasets.find((d) => d.id === source);
  const report = (error: unknown) =>
    message.error(error instanceof Error ? error.message : String(error));
  const remove = useMutation({
    mutationFn: () => deleteDataset(source),
    onSuccess: async () => {
      message.success(t("data.source.deleted"));
      setConfirmDelete(false);
      onSourceChange(DATA_PACK);
      await onChanged();
    },
    onError: report,
  });
  const stateTag = (d: Dataset) =>
    !d.report.ok ? (
      <Tag color="error">{t("data.source.incomplete")}</Tag>
    ) : d.lastRun ? (
      <Tag color="success">{t("data.source.ran")}</Tag>
    ) : (
      <Tag>{t("data.source.notRun")}</Tag>
    );

  return (
    <BaseCard>
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        <Space wrap size={8} style={{ width: "100%" }}>
          <Typography.Text strong>{t("data.source.label")}</Typography.Text>
          <Select
            data-testid="dataset-source"
            value={source}
            loading={loading}
            onChange={onSourceChange}
            style={{ minWidth: 280, maxWidth: "100%" }}
            options={[
              { value: DATA_PACK, label: t("data.source.datapack") },
              ...datasets.map((d) => ({
                value: d.id,
                label: (
                  <Space size={6}>
                    <span>{d.name}</span>
                    {stateTag(d)}
                  </Space>
                ),
              })),
            ]}
          />
          {canManage ? (
            <BaseButton
              variant="secondary"
              icon={<CloudUploadOutlined />}
              onClick={() => setUploadOpen(true)}
              data-testid="dataset-upload"
            >
              {t("data.source.upload")}
            </BaseButton>
          ) : null}
          {dataset && canManage ? (
            <Button
              size="small"
              type="text"
              danger
              icon={<DeleteOutlined />}
              onClick={() => setConfirmDelete(true)}
            >
              {t("data.source.delete")}
            </Button>
          ) : null}
        </Space>
        {dataset ? (
          <>
            <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
              {t("data.source.uploadedBy", {
                name: dataset.createdBy,
                time: formatDateTime(dataset.createdAt),
              })}
              {dataset.lastRun
                ? ` · ${t("data.source.lastRun", { time: formatDateTime(dataset.lastRun.at) })}`
                : ""}
            </Typography.Text>
            <div data-testid="dataset-checklist">
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                  gap: 8,
                }}
              >
                {dataset.report.files.map((file) => (
                  <FileRow
                    key={file.role}
                    name={file.name}
                    status={file.status}
                    detail={
                      file.status === "invalid"
                        ? t("data.source.missingColumns", {
                            columns: file.missingColumns.join(", "),
                          })
                        : file.status === "ok"
                          ? t("data.source.rows", { count: file.rows })
                          : file.path
                    }
                    path={file.path}
                  />
                ))}
                {dataset.report.scope ? (
                  <FileRow
                    name={dataset.report.scope.path.split("/").at(-1) ?? ""}
                    status={dataset.report.scope.status}
                    detail={`${t("data.source.scope")} · ${t(
                      "data.source.rows",
                      {
                        count: dataset.report.scope.rows,
                      },
                    )}`}
                    path={dataset.report.scope.path}
                  />
                ) : null}
              </div>
            </div>
          </>
        ) : null}
      </Space>
      <FormModal
        open={uploadOpen}
        title={t("data.upload.title")}
        onClose={() => {
          setUploadOpen(false);
          setFiles([]);
        }}
        onSubmit={async (values: { name?: string }) => {
          if (!files.length) {
            message.warning(t("data.upload.chooseFiles"));
            throw new Error(t("data.upload.chooseFiles"));
          }
          try {
            const created = await uploadDataset(
              files.map((f) => f.originFileObj as File),
              values.name?.trim(),
            );
            if (created.report.ok) message.success(t("data.upload.done"));
            else message.warning(t("data.upload.incomplete"));
            await onChanged();
            onSourceChange(created.id);
            setFiles([]);
          } catch (error) {
            report(error);
            throw error;
          }
        }}
      >
        <Form.Item
          name="name"
          label={
            <Space wrap>
              {t("data.upload.name")}
              <DemoFormFill values={{ name: t("data.upload.demoName") }} />
            </Space>
          }
        >
          <Input
            maxLength={120}
            placeholder={t("data.upload.namePlaceholder")}
          />
        </Form.Item>
        <Upload.Dragger
          multiple
          accept=".csv,.zip"
          fileList={files}
          beforeUpload={() => false}
          onChange={({ fileList }) => setFiles(fileList.slice(0, 20))}
        >
          <p className="ant-upload-drag-icon">
            <CloudUploadOutlined />
          </p>
          <p>{t("data.upload.drop")}</p>
          <p className="ant-upload-hint" style={{ padding: "0 12px" }}>
            {t("lite.uploadHint")}
          </p>
        </Upload.Dragger>
      </FormModal>
      <ConfirmModal
        open={confirmDelete}
        danger
        title={t("data.source.delete")}
        content={t("data.source.deleteBody", { name: dataset?.name ?? "" })}
        confirmText={t("delete")}
        cancelText={t("cancel")}
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
        onCancel={() => setConfirmDelete(false)}
      />
    </BaseCard>
  );
}

function FileRow({
  name,
  status,
  detail,
  path,
}: {
  name: string;
  status: DatasetFileStatus;
  detail: string | null;
  path: string | null;
}) {
  const { t } = useTranslation("platform");
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        border: "1px solid var(--border-divider)",
        borderRadius: 8,
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <Tooltip title={path}>
          <Typography.Text
            strong
            ellipsis
            style={{ display: "block", fontSize: 13 }}
          >
            {name}
          </Typography.Text>
        </Tooltip>
        {detail ? (
          <Typography.Text
            type="secondary"
            ellipsis={{ tooltip: detail }}
            style={{ display: "block", fontSize: 12 }}
          >
            {detail}
          </Typography.Text>
        ) : null}
      </div>
      <Tag
        color={statusTag[status].color}
        icon={statusTag[status].icon}
        style={{ margin: 0 }}
      >
        {t(`data.source.status.${status}`)}
      </Tag>
    </div>
  );
}
