import { TableRowActions } from "@/shared/ui/TableRowActions";
import { DemoFormFill } from "@/shared/ui/DemoFillButton";
import { resourceDemoInput } from "./lib/demoInput";
import { SigningRolePicker } from "@/shared/ui/SigningRolePicker";
import { useMemo, useState, type Key, type ReactNode } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
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
} from "@ant-design/icons";
import {
  BaseButton,
  ConfirmModal,
  DataTable,
  DebounceSelect,
  DetailModal,
  PageContainer,
  FormModal,
  useAccess,
  useResource,
  parseImportFile,
  downloadBlob,
} from "@codecash/ui";
import { ApiError as HttpError } from "@codecash/api-client";
import type {
  Entity,
  ImportValidationReport,
  Origin,
  ResourceDefinition,
  ResourceField,
} from "@codecash/contracts";
import { fieldProblem } from "@codecash/contracts";
import { platform } from "@/shared/api/platform";
import { useCurrentUser } from "@/shared/auth/session";
import { AppPage } from "@/shared/layout/AppPage";
import { formatDateTime, formatNumber } from "@/shared/lib/format";
import { OriginTag } from "@/shared/ui/DomainTags";
import { ImportPreviewModal } from "@/shared/ui/ImportPreviewModal";
import { AuditDetails } from "@/shared/ui/AuditDetails";
import { TechnicalDetails } from "@/shared/ui/TechnicalInfo";
import { STAT_TONE, type StatTone } from "@/shared/ui/statTone";
import { statSpan } from "@/shared/lib/statLayout";

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

/** The field whose values head a resource's list as statistic tiles (one count per value). */
const STAT_FIELD: Record<string, string> = {
  organizations: "kind",
  users: "role",
  "milestone-templates": "workflowTemplate",
};
const TILE_TONES: StatTone[] = [
  "blue",
  "green",
  "violet",
  "amber",
  "sky",
  "orange",
  "indigo",
  "red",
];

/** One page per resource: switching tabs starts with fresh search, filters, sort and selection. */
export default function ResourcePage() {
  const { resource = "organizations" } = useParams();
  return <ResourceView key={resource} resource={resource} />;
}

function ResourceView({ resource }: { resource: string }) {
  const navigate = useNavigate();
  const { t } = useTranslation("platform");
  const { t: tc } = useTranslation("common");
  const { t: td } = useTranslation("domain");
  const { t: ta } = useTranslation("audit");
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
  // Paging, debounced search, filters (several values each) and sort: the shared list state.
  const state = useResource(resource, service);
  const [exporting, setExporting] = useState(false);
  const definitions = useQuery({
    queryKey: ["definitions"],
    queryFn: () => platform.get<ResourceDefinition[]>("/resources"),
  });
  const organizations = useQuery({
    queryKey: ["resource", "organizations", "lookup"],
    queryFn: () =>
      platform.resource<Entity>("organizations").list({ page: 1, limit: 100 }),
    // Without the lookup, organisation columns show their codes.
    enabled: hasPermission("organizations:read"),
  });
  const uploadDrafts = useQuery({
    queryKey: ["resource", "contract-drafts", "upload-lookup", user.id],
    queryFn: () =>
      platform
        .resource<Entity>("contract-drafts")
        .list({ page: 1, limit: 100 }),
    enabled: uploadOpen && hasPermission("documents:upload"),
  });
  const uploadDraft = uploadDrafts.data?.items.find(
    (row) => row.state === "DRAFT",
  );
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
  const filters = state.filters;
  const busy = state.create.isPending || state.update.isPending;

  // One light count per value of the tile field (limit 1: only the total is read).
  const statField = fields.find((f) => f.key === STAT_FIELD[resource]);
  const statCounts = useQueries({
    queries: (statField?.options ?? []).map((value) => ({
      queryKey: ["resource", resource, "stat", statField?.key, value],
      queryFn: () =>
        service.list({
          page: 1,
          limit: 1,
          filters: { [statField!.key]: value },
        }),
    })),
  });

  /** A field's name on this resource: an override when the shared word misleads (users.title). */
  const fieldLabel = (key: string) =>
    t(`fieldOverrides.${resource}.${key}`, {
      defaultValue: t(`fields.${key}`, { defaultValue: key }),
    });
  const fieldHint = (key: string) =>
    t(`fieldHints.${resource}.${key}`, { defaultValue: "" }) || undefined;
  const importable = !readOnly && can("import");
  /** Platform roles read a digest of the audit chain: what and when, never who (spec 2.2). */
  const auditDigest = resource === "audit" && !items.some((x) => x.actorId);
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
    if (field.key === "signerRoles")
      return String(value)
        .split(";")
        .map((role, index) => `${index + 1}. ${tc(`roles.${role}.name`)}`)
        .join(" → ");
    if (field.ref)
      return (
        <Typography.Text ellipsis={{ tooltip: refName(value) }}>
          {refName(value)}
        </Typography.Text>
      );
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
    if (field.key === "milestoneType")
      return (
        <span>
          {td(`milestoneType.${value}`, { defaultValue: String(value) })}{" "}
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {String(value)}
          </Typography.Text>
        </span>
      );
    if (field.key === "requiredEvents")
      return (
        <Space size={[4, 4]} wrap>
          {String(value)
            .split(";")
            .filter(Boolean)
            .map((code) => (
              <Tag key={code} style={{ margin: 0 }}>
                {td(`eventType.${code}`, { defaultValue: code })}
              </Tag>
            ))}
        </Space>
      );
    if (resource === "settings" && field.key === "name") {
      const hint = t(`settingKeys.${value}.hint`, { defaultValue: "" });
      return (
        <span>
          <Typography.Text strong>
            {t(`settingKeys.${value}.label`, { defaultValue: String(value) })}
          </Typography.Text>
          <br />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {String(value)}
            {hint ? ` · ${hint}` : ""}
          </Typography.Text>
        </span>
      );
    }
    if (resource === "audit" && field.key === "action")
      return (
        <span>
          {ta(`actionCodes.${value}`, { defaultValue: String(value) })}
          <br />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {String(value)}
          </Typography.Text>
        </span>
      );
    if (resource === "audit" && field.key === "resource")
      return t(`auditResources.${value}`, {
        defaultValue: t(`resources.${value}`, { defaultValue: String(value) }),
      });
    return (
      <Typography.Text ellipsis={{ tooltip: String(value) }}>
        {String(value)}
      </Typography.Text>
    );
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

  /** Width by what a field holds, so the common screen widths need no sideways scrolling. */
  const widthOf = (field: ResourceField) =>
    resource === "settings" && field.key === "name"
      ? 340
      : ["name", "displayName", "description"].includes(field.key) ||
          (field.key === "title" && resource !== "users")
        ? 220
        : field.key === "requiredEvents"
          ? 260
          : field.key === "signerRoles"
            ? 300
            : field.type === "email" || field.ref
              ? 200
              : field.type === "select"
                ? 150
                : field.type === "boolean" || field.type === "number"
                  ? 110
                  : ["code", "sha256", "recordId", "taxCode"].includes(
                        field.key,
                      )
                    ? 130
                    : 180;
  const shownFields = fields.filter(
    (field) =>
      // Long text is read in the detail view, not squeezed into a cell.
      field.type !== "textarea" && !(auditDigest && field.key === "actorId"),
  );
  const columns = [
    ...(resource === "audit"
      ? [
          {
            key: "createdAt",
            dataIndex: "createdAt",
            title: t("fields.at"),
            width: 170,
            sorter: true,
            render: (value: string) => (value ? formatDateTime(value) : "—"),
          },
          {
            key: "seq",
            dataIndex: "seq",
            title: t("fields.seq"),
            width: 80,
            align: "right" as const,
            render: (value: unknown) => (value ? `#${value}` : "—"),
          },
        ]
      : []),
    ...shownFields.map((field) => {
      const options = columnFilters(field);
      return {
        ...state.column(field.key),
        dataIndex: field.key,
        title: fieldLabel(field.key),
        width: widthOf(field),
        sorter: true,
        ...(field.type === "number" ? { align: "right" as const } : {}),
        ...(options
          ? {
              filters: options,
              filterSearch: !!field.ref,
            }
          : {}),
        render: (value: unknown) => renderValue(field, value),
      };
    }),
    ...(resource === "audit"
      ? [
          {
            key: "hash",
            dataIndex: "hash",
            title: t("fields.hash"),
            width: 150,
            render: (value: unknown) =>
              value ? (
                <Typography.Text code style={{ fontSize: 12 }}>
                  {String(value).slice(0, 10)}…
                </Typography.Text>
              ) : (
                "—"
              ),
          },
        ]
      : []),
    ...(items.some((item) => item.origin)
      ? [
          {
            key: "origin",
            dataIndex: "origin",
            title: fieldLabel("origin"),
            width: 130,
            render: (value: Origin | undefined) =>
              value ? <OriginTag origin={value} /> : "—",
          },
        ]
      : []),
    ...(resource === "audit"
      ? []
      : [
          {
            key: "updatedAt",
            dataIndex: "updatedAt",
            title: fieldLabel("updatedAt"),
            width: 150,
            sorter: true,
            render: (value: string) => (value ? formatDateTime(value) : "—"),
          },
        ]),
  ];
  const tableWidth =
    columns.reduce((sum, column) => sum + (column.width ?? 180), 0) + 104 + 48;

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
    <TableRowActions
      primary={{
        label: editable(record, "update") ? t("edit") : t("detail"),
        icon: editable(record, "update") ? <EditOutlined /> : <EyeOutlined />,
        tone: editable(record, "update") ? "primary" : "neutral",
        onClick: () =>
          editable(record, "update") ? setEditor(record) : setViewing(record),
      }}
      menu={menuFor(record)}
      moreLabel={t("moreActions")}
    />
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
        {resource === "contract-drafts" && !readOnly && can("update") ? (
          <Alert type="info" showIcon title={t("managedDraftsNote")} />
        ) : null}
        {auditDigest ? (
          <Alert type="info" showIcon title={t("auditDigestNote")} />
        ) : null}
        <DataTable<Entity>
          statisticsData={
            statField
              ? (statField.options ?? []).map((value, index, all) => {
                  const tone = STAT_TONE[TILE_TONES[index % TILE_TONES.length]];
                  const selected =
                    filters[statField.key]?.length === 1 &&
                    filters[statField.key]?.[0] === value;
                  return {
                    key: value,
                    title: optionLabel(statField, value),
                    value: statCounts[index]?.data?.total ?? "—",
                    backgroundColor: tone.bg,
                    valueColor: tone.value,
                    selected,
                    colSpan: statSpan(index, all.length),
                    onClick: () =>
                      state.setFilter(statField.key, selected ? null : [value]),
                    testId: `resource-stat-${value}`,
                  };
                })
              : undefined
          }
          mobileCards
          columnSettings={{ storageKey: `resource-${resource}` }}
          hideCard
          // The resources are tabs of one table: each tab is a different list, read from the server.
          // Only the resources this role may read appear as tabs.
          tabs={definitions.data
            ?.filter((d) => hasPermission(`${d.name}:read`))
            .map((d) => ({
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
          scroll={{ x: tableWidth }}
          columns={columns}
          emptyText={
            state.params.search || Object.keys(filters).length
              ? undefined
              : t("emptyResource", { name: t(`resources.${resource}`) })
          }
          {...state.table}
          loading={state.query.isPending}
          searchPlaceholder={t("searchPlaceholder")}
          exportLoading={exporting}
          actionsWidth={104}
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
          exportable={can("export")}
          exportFilename={resource}
          onExport={(options) => void exportFile(options)}
          importable={importable}
          importColumns={fields.map((f) => ({
            key: f.key,
            dataIndex: f.key,
            title: fieldLabel(f.key),
          }))}
          onDownloadTemplate={
            importable
              ? async () => {
                  try {
                    downloadBlob(
                      await platform.download(
                        `/resources/${resource}/template`,
                      ),
                      `${resource}_template.csv`,
                    );
                  } catch (error) {
                    report(error);
                  }
                }
              : undefined
          }
          onImport={
            importable ? (selected) => void validateImport(selected) : undefined
          }
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
        width={
          resource === "contract-templates"
            ? 860
            : fields.length > 3
              ? 720
              : 520
        }
        title={t(editor ? "edit" : "create")}
        // A new account or template starts active; everything else starts empty.
        initialValues={
          editor === null && fields.some((f) => f.key === "active")
            ? { active: true }
            : toForm(editor)
        }
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
        <div
          data-testid="resource-form-fields"
          // Two columns of short fields; long ones (text, lists) take the whole row.
          style={{
            display: "grid",
            gridTemplateColumns:
              fields.length > 3
                ? "repeat(auto-fit, minmax(min(100%, 300px), 1fr))"
                : "minmax(0, 1fr)",
            columnGap: 24,
            ...(resource === "contract-templates"
              ? {
                  maxHeight: "62dvh",
                  overflowY: "auto",
                  scrollbarGutter: "stable",
                  paddingRight: 12,
                }
              : {}),
          }}
        >
          <div style={{ gridColumn: "1 / -1", marginBottom: 12 }}>
            <DemoFormFill
              values={(current) =>
                resourceDemoInput(
                  resource,
                  organizations.data?.items ?? [],
                  t,
                  current,
                )
              }
              disabled={busy}
            />
          </div>
          {fields.map((field) => (
            <Form.Item
              key={field.key}
              style={
                field.type === "textarea" ||
                ["signerRoles", "requiredEvents", "description"].includes(
                  field.key,
                )
                  ? { gridColumn: "1 / -1" }
                  : undefined
              }
              name={field.key}
              label={fieldLabel(field.key)}
              required={!!field.required}
              extra={fieldHint(field.key)}
              valuePropName={field.type === "boolean" ? "checked" : "value"}
              validateTrigger={["onChange", "onBlur"]}
              rules={[
                {
                  validator: async (_, value: unknown) => {
                    const code = fieldProblem(
                      field,
                      field.ref &&
                        value &&
                        typeof value === "object" &&
                        "value" in value
                        ? value.value
                        : value,
                    );
                    if (code)
                      throw new Error(
                        tc(
                          `forms.${code.startsWith("REQUIRED") ? "required" : field.type === "email" ? "email" : "invalid"}`,
                          { field: fieldLabel(field.key) },
                        ),
                      );
                  },
                },
              ]}
            >
              {field.key === "signerRoles" ? (
                <SigningRolePicker />
              ) : field.type === "textarea" ? (
                <Input.TextArea
                  rows={8}
                  maxLength={field.maxLength}
                  showCount
                />
              ) : field.ref ? (
                <DebounceSelect
                  fetchOptions={searchRef(field)}
                  placeholder={t("searchToPick")}
                  showSearch
                  allowClear
                />
              ) : field.type === "select" ? (
                <Select
                  placeholder={tc("forms.choose", {
                    field: fieldLabel(field.key),
                  })}
                  options={field.options?.map((value) => ({
                    label: optionLabel(field, value),
                    value,
                  }))}
                />
              ) : field.type === "boolean" ? (
                <Switch />
              ) : field.type === "number" ? (
                <InputNumber
                  min={field.min ?? 0}
                  max={field.max}
                  precision={field.integer ? 0 : undefined}
                  placeholder={tc("forms.enter", {
                    field: fieldLabel(field.key),
                  })}
                  style={{ width: "100%" }}
                />
              ) : (
                <Input
                  placeholder={t(`placeholders.${field.key}`, {
                    defaultValue: tc("forms.enter", {
                      field: fieldLabel(field.key),
                    }),
                  })}
                  maxLength={field.maxLength ?? 2000}
                />
              )}
            </Form.Item>
          ))}
        </div>
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
          label={
            <Space wrap>
              {t("draftId")}
              <DemoFormFill
                disabled={!uploadDraft}
                values={{ draftId: uploadDraft?.code ?? uploadDraft?.id }}
              />
            </Space>
          }
          rules={[
            {
              required: true,
              whitespace: true,
              message: tc("forms.required", { field: t("draftId") }),
            },
          ]}
        >
          <Input placeholder={t("placeholders.draftId")} maxLength={80} />
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
          label={
            <Space wrap>
              {t("newPassword")}
              <DemoFormFill
                values={() => ({ password: `${crypto.randomUUID()}!Aa1` })}
              />
            </Space>
          }
          rules={[
            { required: true },
            { min: 12, max: 128, message: t("passwordTooShort") },
          ]}
        >
          <Input.Password
            placeholder={t("placeholders.password")}
            maxLength={128}
            autoComplete="new-password"
          />
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
                ...(resource === "audit"
                  ? [
                      {
                        key: "auditDetails",
                        label: t("detail"),
                        value: <AuditDetails entry={viewing} />,
                      },
                    ]
                  : []),
                ...fields.map((field) => ({
                  key: field.key,
                  label: fieldLabel(field.key),
                  value:
                    field.type === "textarea" ? (
                      <Typography.Paragraph
                        style={{ whiteSpace: "pre-wrap", margin: 0 }}
                        ellipsis={{ rows: 6, expandable: true }}
                      >
                        {String(viewing[field.key] ?? "—")}
                      </Typography.Paragraph>
                    ) : (
                      renderValue(field, viewing[field.key])
                    ),
                  span:
                    field.type === "textarea" ||
                    ["signerRoles", "requiredEvents", "description"].includes(
                      field.key,
                    )
                      ? 2
                      : undefined,
                })),
                // Record bookkeeping, kept apart from the business fields.
                {
                  key: "system",
                  label: t("systemInfo"),
                  span: 2,
                  value: (
                    <TechnicalDetails
                      items={[
                        { key: "id", label: "ID", value: viewing.id },
                        {
                          key: "origin",
                          label: fieldLabel("origin"),
                          value: viewing.origin ? (
                            <OriginTag origin={viewing.origin as Origin} />
                          ) : null,
                        },
                        {
                          key: "version",
                          label: t("fields.version"),
                          value: viewing.version
                            ? String(viewing.version)
                            : null,
                        },
                        {
                          key: "createdAt",
                          label: t("fields.createdAt"),
                          value: viewing.createdAt
                            ? formatDateTime(viewing.createdAt)
                            : null,
                        },
                        {
                          key: "updatedAt",
                          label: fieldLabel("updatedAt"),
                          value: viewing.updatedAt
                            ? formatDateTime(viewing.updatedAt)
                            : null,
                        },
                      ]}
                    />
                  ),
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
