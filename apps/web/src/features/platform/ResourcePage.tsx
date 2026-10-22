import { useMemo, useState, type Key, type ReactNode } from "react";
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
  DetailModal,
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
  const { message } = AntApp.useApp();
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
  const [viewing, setViewing] = useState<Entity>();
  const [pendingDelete, setPendingDelete] = useState<Key[]>();
  const [deleting, setDeleting] = useState(false);
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

  // Row actions follow the UniFlow base: one primary icon, the rest in a menu.
  const menuFor = (record: Entity): MenuProps["items"] => [
    {
      key: "detail",
      icon: <EyeOutlined />,
      label: t("detail"),
      onClick: () => setViewing(record),
    },
    ...(resource === "users"
      ? [
          {
            key: "password",
            icon: <KeyOutlined />,
            label: t("resetPassword"),
            onClick: () => setPasswordTarget(record),
          },
        ]
      : []),
    ...(resource === "documents"
      ? [
          {
            key: "download",
            icon: <DownloadOutlined />,
            label: t("download"),
            onClick: () => void download(record),
          },
        ]
      : []),
    ...(readOnly
      ? []
      : [
          { type: "divider" as const },
          {
            key: "delete",
            icon: <DeleteOutlined />,
            label: t("delete"),
            danger: true,
            onClick: () => setPendingDelete([record.id]),
          },
        ]),
  ];
  const rowActions = (record: Entity) => (
    <Space size={4}>
      {readOnly ? (
        <IconButton
          icon={
            resource === "documents" ? <DownloadOutlined /> : <EyeOutlined />
          }
          tooltip={resource === "documents" ? t("download") : t("detail")}
          onClick={() =>
            resource === "documents"
              ? void download(record)
              : setViewing(record)
          }
        />
      ) : (
        <IconButton
          icon={<EditOutlined />}
          tooltip={t("edit")}
          onClick={() => setEditor(record)}
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
            <BaseButton
              variant="primary"
              icon={<CloudUploadOutlined />}
              onClick={() => setUploadOpen(true)}
            >
              {t("upload")}
            </BaseButton>
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
          onView={(record) => setViewing(record)}
          onAdd={readOnly ? undefined : () => setEditor(null)}
          selectedRowKeys={selectedKeys}
          onSelectChange={setSelectedKeys}
          batchOperations={!readOnly}
          onBatchDelete={(ids) => setPendingDelete(ids)}
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
      <DetailModal
        open={!!viewing}
        entityName={t(`resources.${resource}`)}
        record={viewing}
        onClose={() => setViewing(undefined)}
        onEdit={readOnly ? undefined : (record) => setEditor(record)}
        onDelete={
          readOnly ? undefined : (record) => setPendingDelete([record.id])
        }
        items={
          viewing
            ? [
                ...(definition?.fields ?? []).map((field) => ({
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
