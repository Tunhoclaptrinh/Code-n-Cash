import { useMemo, useState, type Key, type ReactNode } from "react";
import { useParams, useNavigate } from "react-router-dom";
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
  Tag,
  Typography,
  App as AntApp,
  Upload,
} from "antd";
import {
  CloudUploadOutlined,
  DownloadOutlined,
  KeyOutlined,
} from "@ant-design/icons";
import {
  DataTable,
  PageContainer,
  FormModal,
  IconButton,
  useResource,
  parseImportFile,
  downloadBlob,
  exportToCSV,
  exportToJSON,
} from "@codecash/ui";
import type {
  Entity,
  ResourceDefinition,
  ResourceField,
} from "@codecash/contracts";
import { platform } from "@/shared/api/platform";
import { AppPage } from "@/shared/layout/AppPage";
import { formatDateTime, formatNumber } from "@/shared/lib/format";

/** Fields that hold an organization id; they render and edit as the organization name. */
const ORGANIZATION_FIELDS: Record<string, "any" | "SUPPLIER"> = {
  organizationId: "any",
  supplierId: "SUPPLIER",
};

export default function ResourcePage() {
  const navigate = useNavigate();
  const { resource = "organizations" } = useParams();
  const { t } = useTranslation("platform");
  const { t: tc } = useTranslation("common");
  const { message, modal } = AntApp.useApp();
  const [selectedKeys, setSelectedKeys] = useState<Key[]>([]);
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
  const organizations = useQuery({
    queryKey: ["resource", "organizations", "lookup"],
    queryFn: () =>
      platform.resource<Entity>("organizations").list({ page: 1, limit: 100 }),
  });
  const definition = definitions.data?.find((x) => x.name === resource);
  const readOnly = definition?.readOnly;
  const busy = state.create.isPending || state.update.isPending;
  const [passwordTarget, setPasswordTarget] = useState<Entity>();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [file, setFile] = useState<File>();

  const fieldLabel = (key: string) => t(`fields.${key}`, { defaultValue: key });
  const optionLabel = (field: ResourceField, value: string) =>
    field.key === "role"
      ? tc(`roles.${value}.name`, { defaultValue: value })
      : t(`options.${field.key}.${value}`, { defaultValue: value });
  const organizationName = (id: unknown) =>
    String(
      organizations.data?.items.find((org) => org.id === id)?.name ?? id ?? "",
    );
  const organizationOptions = (kind: "any" | "SUPPLIER") =>
    (organizations.data?.items ?? [])
      .filter((org) => kind === "any" || org.kind === kind)
      .map((org) => ({ value: org.id, label: String(org.name) }));

  const renderValue = (field: ResourceField, value: unknown): ReactNode => {
    if (value === undefined || value === null || value === "") return "—";
    if (field.type === "boolean")
      return (
        <Tag color={value ? "success" : "default"}>
          {t(value ? "yes" : "no")}
        </Tag>
      );
    if (field.type === "select")
      return <Tag>{optionLabel(field, String(value))}</Tag>;
    if (field.key in ORGANIZATION_FIELDS) return organizationName(value);
    if (field.key === "sha256")
      return (
        <Typography.Text
          code
          copyable={{ text: String(value), tooltips: [t("copy"), t("saved")] }}
        >
          {String(value).slice(0, 12)}…
        </Typography.Text>
      );
    if (field.key === "size" && typeof value === "number")
      return `${formatNumber(value / 1024, 1)} KB`;
    return String(value);
  };

  const columns = [
    ...(definition?.fields ?? []).map((field) => ({
      key: field.key,
      dataIndex: field.key,
      title: fieldLabel(field.key),
      sorter: true,
      render: (value: unknown) => renderValue(field, value),
    })),
    {
      key: "updatedAt",
      dataIndex: "updatedAt",
      title: fieldLabel("updatedAt"),
      sorter: true,
      render: (value: string) => (value ? formatDateTime(value) : "—"),
    },
  ];

  const report = (error: unknown) =>
    message.error(error instanceof Error ? error.message : t("error"));

  const rowActions =
    resource === "documents"
      ? (record: Entity) => (
          <IconButton
            icon={<DownloadOutlined />}
            tooltip={t("download")}
            onClick={async () => {
              try {
                downloadBlob(
                  await platform.download(`/documents/${record.id}/download`),
                  String(record.name),
                );
              } catch (error) {
                report(error);
              }
            }}
          />
        )
      : resource === "users"
        ? (record: Entity) => (
            <IconButton
              icon={<KeyOutlined />}
              tooltip={t("resetPassword")}
              onClick={() => setPasswordTarget(record)}
            />
          )
        : undefined;

  return (
    <AppPage
      active="platform"
      breadcrumb={[
        { label: t("title"), to: "/platform/organizations" },
        { label: t(`resources.${resource}`) },
      ]}
    >
      <PageContainer
        title={t("title")}
        subtitle={t(`descriptions.${resource}`, { defaultValue: "" })}
        tabs={definitions.data?.map((d) => ({
          key: d.name,
          tab: t(`resources.${d.name}`),
        }))}
        activeTabKey={resource}
        onTabChange={(key) => {
          setSelectedKeys([]);
          setEditor(undefined);
          navigate(`/platform/${key}`);
        }}
        extra={
          resource === "documents" ? (
            <Button
              type="primary"
              icon={<CloudUploadOutlined />}
              onClick={() => setUploadOpen(true)}
            >
              {t("upload")}
            </Button>
          ) : undefined
        }
      >
        {state.query.isError ? (
          <Alert type="error" showIcon title={state.query.error.message} />
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
          customActions={rowActions}
          onAdd={readOnly ? undefined : () => setEditor(null)}
          onEdit={readOnly ? undefined : (record) => setEditor(record)}
          onDelete={
            readOnly
              ? undefined
              : (id) =>
                  modal.confirm({
                    title: t("deleteTitle"),
                    content: t("deleteBody"),
                    okButtonProps: { danger: true },
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
              okButtonProps: { danger: true },
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
              label: fieldLabel(field.key),
              type: "select" as const,
              operators: ["eq" as const],
              options:
                field.type === "boolean"
                  ? [
                      { value: true, label: t("yes") },
                      { value: false, label: t("no") },
                    ]
                  : field.options?.map((value) => ({
                      value,
                      label: optionLabel(field, value),
                    })),
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
              if (options.scope === "page")
                rows = state.query.data?.items ?? [];
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
                    ...(
                      await service.list({ ...state.params, page, limit: 100 })
                    ).items,
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
      </PageContainer>
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
            label={fieldLabel(field.key)}
            valuePropName={field.type === "boolean" ? "checked" : "value"}
            rules={[
              {
                required: field.required,
                ...(field.type === "email" ? { type: "email" as const } : {}),
              },
            ]}
          >
            {field.key in ORGANIZATION_FIELDS ? (
              <Select
                showSearch={{ optionFilterProp: "label" }}
                loading={organizations.isPending}
                options={organizationOptions(ORGANIZATION_FIELDS[field.key])}
              />
            ) : field.type === "select" ? (
              <Select
                options={field.options?.map((value) => ({
                  label: optionLabel(field, value),
                  value,
                }))}
              />
            ) : field.type === "boolean" ? (
              <Switch />
            ) : field.type === "number" ? (
              <InputNumber min={0} style={{ width: "100%" }} />
            ) : (
              <Input />
            )}
          </Form.Item>
        ))}
      </FormModal>
      <FormModal
        open={uploadOpen}
        title={t("upload")}
        onClose={() => {
          setUploadOpen(false);
          setFile(undefined);
        }}
        onSubmit={async (values: { draftId: string }) => {
          if (!file) {
            message.warning(t("chooseFile"));
            throw new Error(t("chooseFile"));
          }
          const body = new FormData();
          body.append("file", file);
          try {
            await platform.request(
              "/documents/" + encodeURIComponent(values.draftId),
              { method: "POST", body },
            );
          } catch (error) {
            report(error);
            throw error;
          }
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
          <p className="ant-upload-drag-icon">
            <CloudUploadOutlined />
          </p>
          <p>{t("chooseFile")}</p>
        </Upload.Dragger>
      </FormModal>
      <FormModal
        open={!!passwordTarget}
        title={`${t("resetPassword")} · ${String(passwordTarget?.displayName ?? "")}`}
        onClose={() => setPasswordTarget(undefined)}
        onSubmit={async ({ password }: { password: string }) => {
          try {
            await platform.post(`/auth/users/${passwordTarget!.id}/password`, {
              password,
            });
          } catch (error) {
            report(error);
            throw error;
          }
          message.success(t("saved"));
        }}
      >
        <Form.Item
          name="password"
          label={t("newPassword")}
          rules={[
            { required: true },
            { min: 12, max: 128, message: t("passwordTooShort") },
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
      </FormModal>
    </AppPage>
  );
}
