import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Button,
  Form,
  Input,
  InputNumber,
  Switch,
  Select,
  Alert,
  Space,
  Typography,
  App as AntApp,
  Upload,
} from "antd";
import {
  DataTable,
  FormModal,
  useResource,
  parseImportFile,
  downloadBlob,
  exportToCSV,
  exportToJSON,
} from "@codecash/ui";
import type { Entity, ResourceDefinition } from "@codecash/contracts";
import { platform } from "@/shared/api/platform";
import { AppShell } from "@/shared/layout/AppShell";
export default function ResourcePage() {
  const { resource = "organizations" } = useParams();
  const { t } = useTranslation("platform");
  const { message, modal } = AntApp.useApp();
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [editor, setEditor] = useState<Entity | null | undefined>();
  const service = useMemo(
    () => platform.resource<Entity>(resource),
    [resource],
  );
  const state = useResource(resource, service);
  const definitions = useQuery({
    queryKey: ["definitions"],
    queryFn: () => platform.get<ResourceDefinition[]>("/resources"),
  });
  const definition = definitions.data?.find((x) => x.name === resource);
  const readOnly = definition?.readOnly;
  const busy = state.create.isPending || state.update.isPending;
  const columns = (definition?.fields ?? []).map((field) => ({
    key: field.key,
    dataIndex: field.key,
    title: t(`fields.${field.key}`, { defaultValue: field.key }),
    sorter: true,
    render: (value: unknown) =>
      typeof value === "boolean"
        ? t(value ? "yes" : "no")
        : String(value ?? ""),
  }));
  const [passwordTarget, setPasswordTarget] = useState<Entity>();
  const [password, setPassword] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [file, setFile] = useState<File>();
  const report = (error: unknown) =>
    message.error(error instanceof Error ? error.message : t("error"));
  return (
    <AppShell
      active="platform"
      breadcrumb={[
        { label: t("title") },
        { label: t(`resources.${resource}`) },
      ]}
    >
      <Typography.Title level={2}>
        {t(`resources.${resource}`)}
      </Typography.Title>
      <Space wrap style={{ marginBottom: 20 }}>
        {definitions.data?.map((d) => (
          <Button
            key={d.name}
            href={`/platform/${d.name}`}
            type={d.name === resource ? "primary" : "default"}
          >
            {t(`resources.${d.name}`)}
          </Button>
        ))}
      </Space>
      {state.query.isError ? (
        <Alert type="error" title={state.query.error.message} />
      ) : null}
      {resource === "documents" ? (
        <Button
          type="primary"
          style={{ marginBottom: 16 }}
          onClick={() => setUploadOpen(true)}
        >
          {t("upload")}
        </Button>
      ) : null}
      <DataTable<Entity>
        rowKey="id"
        dataSource={state.query.data?.items ?? []}
        columns={columns}
        loading={state.query.isPending}
        searchValue={state.params.search ?? ""}
        onSearch={(value) => state.change.search(value)}
        onRefresh={() => void state.refresh()}
        pagination={{
          current: state.params.page,
          pageSize: state.params.limit,
          total: state.query.data?.total ?? 0,
        }}
        onPaginationChange={(page: any, _: unknown, sorter: any) =>
          state.setParams((previous) => {
            const sortBy = sorter.order ? String(sorter.field) : "createdAt";
            const sortOrder = sorter.order === "ascend" ? "asc" : "desc";
            const changed =
              sortBy !== (previous.sortBy ?? "createdAt") ||
              sortOrder !== (previous.sortOrder ?? "desc") ||
              page.pageSize !== previous.limit;
            return {
              ...previous,
              page: changed ? 1 : page.current,
              limit: page.pageSize,
              sortBy,
              sortOrder,
            };
          })
        }
        customActions={
          resource === "documents"
            ? (record) => (
                <Button
                  onClick={async () => {
                    try {
                      downloadBlob(
                        await platform.download(
                          `/documents/${record.id}/download`,
                        ),
                        String(record.name),
                      );
                    } catch (error) {
                      report(error);
                    }
                  }}
                >
                  {t("download")}
                </Button>
              )
            : resource === "users"
              ? (record) => (
                  <Space>
                    <Button onClick={() => setEditor(record)}>
                      {t("edit")}
                    </Button>
                    <Button
                      onClick={() => {
                        setPassword("");
                        setPasswordTarget(record);
                      }}
                    >
                      {t("resetPassword")}
                    </Button>
                  </Space>
                )
              : undefined
        }
        onAdd={readOnly ? undefined : () => setEditor(null)}
        onEdit={readOnly ? undefined : (record) => setEditor(record)}
        onDelete={
          readOnly
            ? undefined
            : (id) =>
                modal.confirm({
                  title: t("deleteTitle"),
                  content: t("deleteBody"),
                  onOk: () =>
                    state.remove.mutateAsync(String(id)).catch((error) => {
                      report(error);
                      throw error;
                    }),
                })
        }
        selectedRowKeys={selectedKeys}
        onSelectChange={setSelectedKeys}
        batchOperations={!readOnly}
        onBatchDelete={(ids) =>
          modal.confirm({
            title: t("deleteTitle"),
            content: t("deleteBody"),
            onOk: async () => {
              await service.removeMany(ids.map(String));
              setSelectedKeys([]);
              state.setParams((p) => ({ ...p, page: 1 }));
              await state.refresh();
            },
          })
        }
        filters={definition?.fields
          .filter(
            (field) => field.type === "select" || field.type === "boolean",
          )
          .map((field) => ({
            key: field.key,
            label: t(`fields.${field.key}`, { defaultValue: field.key }),
            type: "select" as const,
            operators: ["eq" as const],
            options:
              field.type === "boolean"
                ? [
                    { value: true, label: t("yes") },
                    { value: false, label: t("no") },
                  ]
                : field.options?.map((value) => ({ value, label: value })),
          }))}
        filterValues={state.params.filters ?? {}}
        onFilterChange={(key, value) =>
          state.setParams((previous) => {
            const filters = { ...previous.filters };
            if (value === undefined || value === "") delete filters[key];
            else filters[key] = value;
            return { ...previous, filters, page: 1 };
          })
        }
        onClearFilters={() => state.change.filter({})}
        onExport={async (options) => {
          try {
            let rows: Entity[] = [];
            if (options.scope === "page") rows = state.query.data?.items ?? [];
            else {
              const first = await service.list({
                ...state.params,
                page: 1,
                limit: 100,
              });
              rows = first.items;
              const wanted =
                options.scope === "custom"
                  ? Math.min(options.limit ?? first.total, first.total)
                  : first.total;
              for (
                let page = 2;
                rows.length < wanted && page <= first.totalPages;
                page++
              )
                rows.push(
                  ...(await service.list({ ...state.params, page, limit: 100 }))
                    .items,
                );
              rows = rows.slice(0, wanted);
            }
            const selected = options.columns?.length
              ? rows.map((row) =>
                  Object.fromEntries(
                    options.columns.map((key: string) => [key, row[key]]),
                  ),
                )
              : rows;
            if (options.format === "json") exportToJSON(selected, resource);
            else exportToCSV(selected, resource);
          } catch (error) {
            report(error);
          }
        }}
        exportable
        exportFilename={resource}
        importable={!readOnly}
        onImport={async (file) => {
          try {
            const rows = await parseImportFile(file);
            const typed = rows.map((row) =>
              Object.fromEntries(
                Object.entries(row).map(([key, value]) => {
                  const field = definition?.fields.find((f) => f.key === key);
                  return [
                    key,
                    field?.type === "number"
                      ? Number(value)
                      : field?.type === "boolean"
                        ? value === true || value === "true"
                        : value,
                  ];
                }),
              ),
            );
            await service.import(typed);
            await state.refresh();
            message.success(t("saved"));
          } catch (error) {
            report(error);
          }
        }}
      />
      <FormModal
        open={editor !== undefined}
        title={t(editor ? "edit" : "create")}
        initialValues={editor ?? {}}
        loading={busy}
        onClose={() => setEditor(undefined)}
        onSubmit={async (values) => {
          try {
            if (editor)
              await state.update.mutateAsync({
                id: editor.id,
                data: { ...values, version: editor.version },
              });
            else await state.create.mutateAsync(values);
            message.success(t("saved"));
          } catch (error) {
            report(error);
            throw error;
          }
        }}
      >
        {definition?.fields.map((field) => (
          <Form.Item
            key={field.key}
            name={field.key}
            label={t(`fields.${field.key}`, { defaultValue: field.key })}
            valuePropName={field.type === "boolean" ? "checked" : "value"}
            rules={[
              {
                required: field.required,
                ...(field.type === "email" ? { type: "email" as const } : {}),
              },
            ]}
          >
            {field.type === "select" ? (
              <Select
                options={field.options?.map((value) => ({
                  label: value,
                  value,
                }))}
              />
            ) : field.type === "boolean" ? (
              <Switch />
            ) : field.type === "number" ? (
              <InputNumber min={0} />
            ) : (
              <Input />
            )}
          </Form.Item>
        ))}
      </FormModal>
      <FormModal
        open={uploadOpen}
        title={t("upload")}
        onClose={() => setUploadOpen(false)}
        onSubmit={async (values: { draftId: string }) => {
          if (!file) throw new Error(t("chooseFile"));
          const body = new FormData();
          body.append("file", file);
          await platform.request(
            "/documents/" + encodeURIComponent(values.draftId),
            { method: "POST", body },
          );
          await state.refresh();
          message.success(t("saved"));
          setFile(undefined);
        }}
      >
        <Form.Item
          name="draftId"
          label={t("draftId")}
          rules={[{ required: true }]}
        >
          <Input />
        </Form.Item>
        <Upload.Dragger
          accept="application/pdf"
          maxCount={1}
          beforeUpload={(file) => {
            setFile(file);
            return false;
          }}
          onRemove={() => setFile(undefined)}
        >
          <p>{t("chooseFile")}</p>
        </Upload.Dragger>
      </FormModal>
      <FormModal
        open={!!passwordTarget}
        title={t("resetPassword")}
        onClose={() => setPasswordTarget(undefined)}
        onSubmit={async () => {
          await platform.post(`/auth/users/${passwordTarget!.id}/password`, {
            password,
          });
          message.success(t("saved"));
        }}
      >
        <Form.Item label={t("newPassword")}>
          <Input.Password
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Form.Item>
      </FormModal>
    </AppShell>
  );
}
