import { useEffect, useMemo, useState, type Key, type ReactNode } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Dropdown,
  Form,
  Input,
  InputNumber,
  Switch,
  Select,
  Alert,
  Space,
  Tag,
  Typography,
  App as AntApp,
  Upload,
} from "antd";
import type { MenuProps } from "antd";
import {
  CloudUploadOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  EyeOutlined,
  KeyOutlined,
  MenuOutlined,
} from "@ant-design/icons";
import {
  BaseButton,
  ConfirmModal,
  DataTable,
  DebounceSelect,
  DetailModal,
  PageContainer,
  FormModal,
  IconButton,
  useAccess,
  useDebounce,
  useResource,
  parseImportFile,
  downloadBlob,
} from "@codecash/ui";
import { ApiError as HttpError } from "@codecash/api-client";
import type {
  Entity,
  ImportValidationReport,
  Origin,
  PageQuery,
  ResourceDefinition,
  ResourceField,
} from "@codecash/contracts";
import { platform } from "@/shared/api/platform";
import { useCurrentUser } from "@/shared/auth/session";
import { AppPage } from "@/shared/layout/AppPage";
import { formatDateTime, formatNumber } from "@/shared/lib/format";
import { OriginTag } from "@/shared/ui/DomainTags";
import { ImportPreviewModal } from "@/shared/ui/ImportPreviewModal";

type Filters = NonNullable<PageQuery["filters"]>;
type Option = { value: string; label: string };

/** Reference fields restricted to one organization kind when picking a value. */
const REF_KIND: Record<string, string> = { supplierId: "SUPPLIER" };

/** CSV cells arrive as text; convert them to the field types the API validates. */
function typedRow(
  row: Record<string, unknown>,
  fields: ResourceField[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(row)) {
    if (raw === "" || raw === undefined || raw === null) continue;
    const field = fields.find((f) => f.key === key);
    result[key] =
      field?.type === "number"
        ? Number(raw)
        : field?.type === "boolean"
          ? raw === true || String(raw).toLowerCase() === "true"
          : raw;
  }
  return result;
}

/** One page per resource: switching tabs starts with fresh search, filters, sort and selection. */
export default function ResourcePage() {
  const { resource = "organizations" } = useParams();
  return <ResourceView key={resource} resource={resource} />;
}

function ResourceView({ resource }: { resource: string }) {
  const navigate = useNavigate();
  const { t } = useTranslation("platform");
  const { t: tc } = useTranslation("common");
  const { message } = AntApp.useApp();
  const user = useCurrentUser();
  const { hasPermission } = useAccess(user);
  const [selectedKeys, setSelectedKeys] = useState<Key[]>([]);
  const [editor, setEditor] = useState<Entity | null | undefined>();
  const [passwordTarget, setPasswordTarget] = useState<Entity>();
  const [viewing, setViewing] = useState<Entity>();
  const [pendingDelete, setPendingDelete] = useState<Key[]>();
  const [deleting, setDeleting] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<ImportValidationReport>();
  const [importing, setImporting] = useState(false);
  const service = useMemo(
    () => platform.resource<Entity>(resource),
    [resource],
  );
  const state = useResource(resource, service);
  // Typing waits 300 ms before asking the server, and a new search starts on page 1.
  const [searchText, setSearchText] = useState("");
  const search = useDebounce(searchText.trim(), 300);
  const { setParams } = state;
  useEffect(
    () =>
      setParams((p) =>
        (p.search ?? "") === search ? p : { ...p, search, page: 1 },
      ),
    [search, setParams],
  );
  const [exporting, setExporting] = useState(false);
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
  const fields = useMemo(() => definition?.fields ?? [], [definition]);
  const readOnly = definition?.readOnly;
  const can = (operation: string) => hasPermission(`${resource}:${operation}`);
  /** Data Pack and workflow records change only through their own screens (resources.json). */
  const editable = (record: Entity, operation: "update" | "delete") =>
    !readOnly &&
    !definition?.managedOrigins?.includes(String(record.origin)) &&
    can(operation);
  const items = state.query.data?.items ?? [];
  const filters: Filters = state.params.filters ?? {};
  const busy = state.create.isPending || state.update.isPending;

  const fieldLabel = (key: string) => t(`fields.${key}`, { defaultValue: key });
  const optionLabel = (field: ResourceField, value: string) =>
    field.key === "role"
      ? tc(`roles.${value}.name`, { defaultValue: value })
      : t(`options.${field.key}.${value}`, { defaultValue: value });
  const refOptions = (field: ResourceField): Option[] =>
    (organizations.data?.items ?? [])
      .filter((org) => !REF_KIND[field.key] || org.kind === REF_KIND[field.key])
      .map((org) => ({ value: org.id, label: String(org.name) }));
  const refName = (id: unknown) =>
    String(
      organizations.data?.items.find((org) => org.id === id)?.name ?? id ?? "",
    );
  /** Remote search for a reference field (populate), as in the Base forms. */
  const searchRef = (field: ResourceField) => async (search: string) =>
    (
      await platform.resource<Entity>(field.ref!).list({
        search,
        limit: 20,
        filters: REF_KIND[field.key]
          ? { kind: REF_KIND[field.key] }
          : undefined,
      })
    ).items.map((item) => ({ value: item.id, label: String(item.name) }));

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
    if (field.ref) return refName(value);
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
  /** Column filter options for fields with a closed set of values (server-side, exact match). */
  const columnFilters = (field: ResourceField) =>
    field.type === "boolean"
      ? [
          { text: t("yes"), value: true },
          { text: t("no"), value: false },
        ]
      : field.type === "select"
        ? (field.options ?? []).map((value) => ({
            text: optionLabel(field, value),
            value,
          }))
        : field.ref
          ? refOptions(field).map((o) => ({ text: o.label, value: o.value }))
          : undefined;

  const columns = [
    ...fields.map((field) => {
      const options = columnFilters(field);
      return {
        key: field.key,
        dataIndex: field.key,
        title: fieldLabel(field.key),
        sorter: true,
        ...(options
          ? {
              filters: options,
              filterMultiple: false,
              filterSearch: !!field.ref,
              filteredValue:
                filters[field.key] !== undefined ? [filters[field.key]] : null,
            }
          : {}),
        render: (value: unknown) => renderValue(field, value),
      };
    }),
    ...(items.some((item) => item.origin)
      ? [
          {
            key: "origin",
            dataIndex: "origin",
            title: fieldLabel("origin"),
            render: (value: Origin | undefined) =>
              value ? <OriginTag origin={value} /> : "—",
          },
        ]
      : []),
    {
      key: "updatedAt",
      dataIndex: "updatedAt",
      title: fieldLabel("updatedAt"),
      sorter: true,
      render: (value: string) => (value ? formatDateTime(value) : "—"),
    },
  ];

  const report = (error: unknown) =>
    message.error(
      error instanceof HttpError
        ? t(`errors.${error.code}`, { defaultValue: error.message })
        : error instanceof Error
          ? error.message
          : t("error"),
    );
  const download = async (record: Entity) => {
    try {
      downloadBlob(
        await platform.download(`/documents/${record.id}/download`),
        String(record.name),
      );
    } catch (error) {
      report(error);
    }
  };
  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      if (pendingDelete.length === 1)
        await state.remove.mutateAsync(String(pendingDelete[0]));
      else {
        await service.removeMany(pendingDelete.map(String));
        state.setParams((p) => ({ ...p, page: 1 }));
        await state.refresh();
      }
      setSelectedKeys((keys) => keys.filter((k) => !pendingDelete.includes(k)));
      message.success(t("deleted", { count: pendingDelete.length }));
      setPendingDelete(undefined);
    } catch (error) {
      report(error);
    } finally {
      setDeleting(false);
    }
  };
  const setFilter = (key: string, value: unknown) =>
    state.setParams((previous) => {
      const next = { ...previous.filters };
      if (value === undefined || value === "" || value === null)
        delete next[key];
      else next[key] = value as string | number | boolean;
      return { ...previous, filters: next, page: 1 };
    });

  // Row actions follow the UniFlow base: one primary icon, the rest in a menu.
  const menuFor = (record: Entity): MenuProps["items"] => [
    {
      key: "detail",
      icon: <EyeOutlined />,
      label: t("detail"),
      onClick: () => setViewing(record),
    },
    ...(resource === "users" && hasPermission("users:reset-password")
      ? [
          {
            key: "password",
            icon: <KeyOutlined />,
            label: t("resetPassword"),
            onClick: () => setPasswordTarget(record),
          },
        ]
      : []),
    ...(resource === "documents" && hasPermission("documents:download")
      ? [
          {
            key: "download",
            icon: <DownloadOutlined />,
            label: t("download"),
            onClick: () => void download(record),
          },
        ]
      : []),
    ...(editable(record, "delete")
      ? [
          { type: "divider" as const },
          {
            key: "delete",
            icon: <DeleteOutlined />,
            label: t("delete"),
            danger: true,
            onClick: () => setPendingDelete([record.id]),
          },
        ]
      : []),
  ];
  const rowActions = (record: Entity) => (
    <Space size={4}>
      {editable(record, "update") ? (
        <IconButton
          icon={<EditOutlined />}
          tooltip={t("edit")}
          onClick={() => setEditor(record)}
        />
      ) : (
        <IconButton
          icon={<EyeOutlined />}
          tooltip={t("detail")}
          onClick={() => setViewing(record)}
        />
      )}
      <Dropdown
        menu={{ items: menuFor(record) }}
        trigger={["click"]}
        placement="bottomRight"
      >
        <IconButton icon={<MenuOutlined />} tooltip={t("moreActions")} />
      </Dropdown>
    </Space>
  );

  /** Server-side export of the current search, filters and sort (Base import-export). */
  const exportFile = async (options: {
    scope: "all" | "page" | "custom";
    format: "csv" | "json";
    limit?: number;
    columns?: string[];
  }) => {
    const query = new URLSearchParams({ format: options.format });
    if (options.columns?.length)
      query.set("columns", options.columns.join(","));
    if (state.params.search) query.set("search", state.params.search);
    if (Object.keys(filters).length)
      query.set("filters", JSON.stringify(filters));
    if (state.params.sortBy) query.set("sortBy", state.params.sortBy);
    if (state.params.sortOrder) query.set("sortOrder", state.params.sortOrder);
    if (options.scope === "page") {
      query.set("limit", String(state.params.limit ?? 20));
      query.set("page", String(state.params.page ?? 1));
    } else if (options.scope === "custom" && options.limit)
      query.set("limit", String(options.limit));
    setExporting(true);
    try {
      downloadBlob(
        await platform.download(`/resources/${resource}/export?${query}`),
        `${resource}.${options.format}`,
      );
    } catch (error) {
      report(error);
    } finally {
      setExporting(false);
    }
  };
  const validateImport = async (selected: File) => {
    try {
      const rows = (await parseImportFile(selected)).map((row) =>
        typedRow(row, fields),
      );
      setPreview(
        await platform.post<ImportValidationReport>(
          `/resources/${resource}/import/validate`,
          { items: rows },
        ),
      );
    } catch (error) {
      report(error);
    }
  };
  const importValid = async (rows: Record<string, unknown>[]) => {
    setImporting(true);
    try {
      await service.import(rows as Partial<Entity>[]);
      await state.refresh();
      message.success(t("imported", { count: rows.length }));
      setPreview(undefined);
    } catch (error) {
      report(error);
    } finally {
      setImporting(false);
    }
  };
  /** Reference fields hold `{ value, label }` in the form so the picked name stays visible. */
  const toForm = (record: Entity | null | undefined) =>
    record
      ? Object.fromEntries(
          Object.entries(record).map(([key, value]) => {
            const field = fields.find((f) => f.key === key);
            return [
              key,
              field?.ref && value ? { value, label: refName(value) } : value,
            ];
          }),
        )
      : {};
  const fromForm = (values: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(values).map(([key, value]) => [
        key,
        value && typeof value === "object" && "value" in value
          ? (value as Option).value
          : value,
      ]),
    );

  return (
    <AppPage
      guide="admin"
      active="platform"
      breadcrumb={[
        { label: t("title"), to: "/platform/organizations" },
        { label: t(`resources.${resource}`) },
      ]}
    >
      <PageContainer>
        {state.query.isError ? (
          <Alert type="error" showIcon title={state.query.error.message} />
        ) : null}
        {definition?.managedOrigins &&
        !readOnly &&
        (can("update") || can("delete")) ? (
          <Alert
            type="info"
            showIcon
            title={[
              t("managedNote", {
                origins: definition.managedOrigins
                  .map((origin) => t(`domain:origin.${origin}`))
                  .join(", "),
              }),
              resource === "contract-drafts" ? t("managedDraftsNote") : "",
            ].join(" ")}
          />
        ) : null}
        <DataTable<Entity>
          // The resources are tabs of one table: each tab is a different list, read from the server.
          tabs={definitions.data?.map((d) => ({
            key: d.name,
            label: t(`resources.${d.name}`),
          }))}
          activeTab={resource}
          onTabChange={(key) => navigate(`/platform/${key}`)}
          extra={
            resource === "documents" && hasPermission("documents:upload") ? (
              <BaseButton
                variant="primary"
                size="small"
                icon={<CloudUploadOutlined />}
                onClick={() => setUploadOpen(true)}
              >
                {t("upload")}
              </BaseButton>
            ) : undefined
          }
          rowKey="id"
          dataSource={items}
          columns={columns}
          loading={state.query.isPending}
          searchValue={searchText}
          onSearch={setSearchText}
          searchPlaceholder={t("searchPlaceholder")}
          exportLoading={exporting}
          onRefresh={() => void state.refresh()}
          pagination={{
            current: state.params.page,
            pageSize: state.params.limit,
            total: state.query.data?.total ?? 0,
          }}
          onPaginationChange={(
            page: { current?: number; pageSize?: number },
            tableFilters: Record<string, unknown[] | null>,
            sorter: { order?: string; field?: unknown },
          ) =>
            state.setParams((previous) => {
              const sortBy = sorter.order ? String(sorter.field) : "createdAt";
              const sortOrder = sorter.order === "ascend" ? "asc" : "desc";
              const nextFilters = { ...previous.filters };
              for (const field of fields) {
                if (!(field.key in tableFilters)) continue;
                const picked = tableFilters[field.key]?.[0];
                if (picked === undefined) delete nextFilters[field.key];
                else nextFilters[field.key] = picked as string | boolean;
              }
              const changed =
                sortBy !== (previous.sortBy ?? "createdAt") ||
                sortOrder !== (previous.sortOrder ?? "desc") ||
                page.pageSize !== previous.limit ||
                JSON.stringify(nextFilters) !==
                  JSON.stringify(previous.filters ?? {});
              return {
                ...previous,
                filters: nextFilters,
                page: changed ? 1 : page.current,
                limit: page.pageSize,
                sortBy,
                sortOrder,
              };
            })
          }
          customActions={rowActions}
          onAdd={!readOnly && can("create") ? () => setEditor(null) : undefined}
          selectedRowKeys={selectedKeys}
          onSelectChange={setSelectedKeys}
          batchOperations={!readOnly && can("delete")}
          onBatchDelete={(ids) => setPendingDelete(ids)}
          filters={fields
            .filter((field) => columnFilters(field))
            .map((field) => ({
              key: field.key,
              label: fieldLabel(field.key),
              type: "select" as const,
              operators: ["eq" as const],
              options: (columnFilters(field) ?? []).map((o) => ({
                value: o.value,
                label: o.text,
              })),
            }))}
          filterValues={filters}
          onFilterChange={setFilter}
          onClearFilters={() => state.change.filter({})}
          exportable={can("export")}
          exportFilename={resource}
          onExport={(options) => void exportFile(options)}
          importable={!readOnly && can("import")}
          importColumns={fields.map((f) => ({
            key: f.key,
            dataIndex: f.key,
            title: fieldLabel(f.key),
          }))}
          onDownloadTemplate={async () => {
            try {
              downloadBlob(
                await platform.download(`/resources/${resource}/template`),
                `${resource}_template.csv`,
              );
            } catch (error) {
              report(error);
            }
          }}
          onImport={(selected) => void validateImport(selected)}
        />
      </PageContainer>
      <ImportPreviewModal
        open={!!preview}
        report={preview}
        columns={fields.map((f) => ({ key: f.key, label: fieldLabel(f.key) }))}
        loading={importing}
        onCancel={() => setPreview(undefined)}
        onConfirm={(rows) => void importValid(rows)}
      />
      <FormModal
        open={editor !== undefined}
        title={t(editor ? "edit" : "create")}
        initialValues={toForm(editor)}
        loading={busy}
        onClose={() => setEditor(undefined)}
        onSubmit={async (values: Record<string, unknown>) => {
          const data = fromForm(values);
          try {
            if (editor)
              await state.update.mutateAsync({
                id: editor.id,
                data: { ...data, version: editor.version },
              });
            else await state.create.mutateAsync(data);
            message.success(t("saved"));
          } catch (error) {
            report(error);
            throw error;
          }
        }}
      >
        {fields.map((field) => (
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
            {field.ref ? (
              <DebounceSelect
                fetchOptions={searchRef(field)}
                placeholder={t("searchToPick")}
                showSearch
                allowClear
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
          beforeUpload={(selected) => {
            setFile(selected);
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
      <DetailModal
        open={!!viewing}
        entityName={t(`resources.${resource}`)}
        record={viewing}
        onClose={() => setViewing(undefined)}
        onEdit={
          viewing && editable(viewing, "update")
            ? (record) => setEditor(record)
            : undefined
        }
        onDelete={
          viewing && editable(viewing, "delete")
            ? (record) => setPendingDelete([record.id])
            : undefined
        }
        items={
          viewing
            ? [
                ...fields.map((field) => ({
                  key: field.key,
                  label: fieldLabel(field.key),
                  value: renderValue(field, viewing[field.key]),
                })),
                {
                  key: "version",
                  label: t("fields.version"),
                  value: String(viewing.version),
                },
                {
                  key: "createdAt",
                  label: t("fields.createdAt"),
                  value: formatDateTime(viewing.createdAt),
                },
                {
                  key: "updatedAt",
                  label: fieldLabel("updatedAt"),
                  value: formatDateTime(viewing.updatedAt),
                },
              ]
            : []
        }
      />
      <ConfirmModal
        open={!!pendingDelete}
        danger
        title={t("deleteTitle")}
        content={t("deleteBody", { count: pendingDelete?.length ?? 0 })}
        confirmText={t("delete")}
        cancelText={t("cancel")}
        loading={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(undefined)}
      />
    </AppPage>
  );
}
