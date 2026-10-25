import { TableRowActions } from "@/shared/ui/TableRowActions";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Alert, Empty, Tag, Tooltip, Typography } from "antd";
import {
  CheckCircleFilled,
  EyeOutlined,
  MinusOutlined,
} from "@ant-design/icons";
import {
  DataTable,
  DetailModal,
  PageContainer,
  type FilterConfig,
  type StatisticsItem,
} from "@codecash/ui";
import type {
  Entity,
  ListSpec,
  PermissionMatrix,
  PermissionScope,
  Role,
} from "@codecash/contracts";
import { platform } from "@/shared/api/platform";
import { useCurrentUser } from "@/shared/auth/session";
import { AppPage } from "@/shared/layout/AppPage";
import { localList, useListQuery } from "@/shared/lib/useListQuery";
import { columnSearch } from "@/shared/ui/columnSearch";

interface Row {
  key: string;
  module: string;
  grants: Partial<Record<Role, PermissionScope>>;
}

const scopeColor: Record<PermissionScope, string> = {
  all: "purple",
  org: "blue",
  own: "cyan",
  assigned: "gold",
};
const roleColor: Record<Role, { bg: string; value: string }> = {
  CONTRACT_OWNER: { bg: "rgba(49, 91, 234, 0.08)", value: "#315bea" },
  LEGAL_REVIEWER: { bg: "rgba(99, 102, 241, 0.08)", value: "#6366F1" },
  FINANCE_APPROVER: { bg: "rgba(16, 185, 129, 0.08)", value: "#10B981" },
  SECONDARY_APPROVER: { bg: "rgba(14, 165, 233, 0.08)", value: "#0EA5E9" },
  ADMIN_AUDITOR: { bg: "rgba(239, 68, 68, 0.08)", value: "#EF4444" },
  SYSTEM_ADMIN: { bg: "rgba(249, 115, 22, 0.08)", value: "#F97316" },
  AUDITOR: { bg: "rgba(139, 92, 246, 0.08)", value: "#8B5CF6" },
  SUPPLIER: { bg: "rgba(245, 158, 11, 0.08)", value: "#F59E0B" },
};

/**
 * Read-only view of the permission matrix the API enforces. Changing it is a specification
 * change with a second approver (SoD-4), so there are no edit controls here.
 */
export default function PermissionMatrixPage() {
  const user = useCurrentUser();
  const { t } = useTranslation("platform");
  const { t: tc } = useTranslation("common");
  const [detail, setDetail] = useState<Row>();
  const matrix = useQuery({
    queryKey: ["permissions", user.id],
    queryFn: () => platform.get<PermissionMatrix>("/permissions"),
  });
  // Every account, page by page (the API serves at most 100 per page), to count holders exactly.
  const users = useQuery({
    queryKey: ["resource", "users", user.id, "permission-holders"],
    queryFn: async () => {
      const all: Entity[] = [];
      for (let page = 1; ; page++) {
        const part = await platform
          .resource<Entity>("users")
          .list({ page, limit: 100 });
        all.push(...part.items);
        if (all.length >= part.total || !part.items.length) return all;
      }
    },
    retry: false,
  });
  const roles = useMemo(() => matrix.data?.roles ?? [], [matrix.data]);
  const rows = useMemo<Row[]>(
    () =>
      (matrix.data?.modules ?? []).flatMap((module) =>
        module.permissions.map((permission) => ({
          key: permission.key,
          module: module.key,
          grants: permission.grants,
        })),
      ),
    [matrix.data],
  );
  const holders = (row: Row) =>
    (users.data ?? []).filter(
      (user) => row.grants[user.role as Role] && user.active !== false,
    );
  const name = (key: string) =>
    t(`permissions.items.${key}`, { defaultValue: key });
  const roleName = (role: Role) => tc(`roles.${role}.name`);
  // The matrix is one document; the list engine searches, filters and pages it in the browser.
  const spec = useMemo<ListSpec<Row>>(
    () => ({
      fields: {
        key: {
          value: (r) =>
            `${r.key} ${t(`permissions.items.${r.key}`, { defaultValue: r.key })}`,
          filter: "contains",
          sort: true,
        },
        module: { value: (r) => r.module, filter: "eq", facet: true },
        role: {
          value: (r) => Object.keys(r.grants),
          filter: "eq",
          facet: true,
        },
        scope: {
          value: (r) => [...new Set(Object.values(r.grants))],
          filter: "eq",
        },
        ...Object.fromEntries(
          roles.map((role) => [
            role,
            {
              value: (r: Row) => (r.grants[role] ? "granted" : "none"),
              filter: "eq" as const,
            },
          ]),
        ),
      },
      search: (r) => [
        r.key,
        t(`permissions.items.${r.key}`, { defaultValue: r.key }),
        t(`permissions.modules.${r.module}`),
      ],
      defaultSort: { by: "key", order: "asc" },
    }),
    [roles, t],
  );
  const list = useListQuery<Row>({
    auditExport: "permissions",
    key: ["permissions", "table", user.id, matrix.dataUpdatedAt],
    fetch: localList(rows, spec),
    pageSize: 20,
    sort: { by: "key", order: "asc" },
  });
  const { filters, setFilter } = list;
  const tab = filters.module?.length === 1 ? String(filters.module[0]) : "ALL";
  const changeTab = (key: string) =>
    setFilter("module", key === "ALL" ? undefined : [key]);
  const statistics: StatisticsItem[] = [
    {
      title: t("permissions.columns.permission"),
      value: rows.length,
      backgroundColor: "var(--bg-surface-alt)",
      valueColor: "var(--text-primary)",
      colSpan: { xs: 12, md: 8, xl: 4 },
      selected: !filters.role,
      onClick: () => setFilter("role", undefined),
    },
    ...roles.map((role) => ({
      title: roleName(role),
      value: rows.filter((row) => row.grants[role]).length,
      backgroundColor: roleColor[role].bg,
      valueColor: roleColor[role].value,
      selected: filters.role?.[0] === role,
      colSpan: { xs: 12, md: 8, xl: 4 },
      onClick: () =>
        setFilter("role", filters.role?.[0] === role ? undefined : [role]),
    })),
  ];
  const filterConfig: FilterConfig[] = [
    {
      key: "role",
      label: t("permissions.grantedTo"),
      type: "select",
      operators: ["eq"],
      options: roles.map((role) => ({ value: role, label: roleName(role) })),
    },
    {
      key: "scope",
      label: t("permissions.scopeLabel"),
      type: "select",
      operators: ["eq"],
      options: (["all", "org", "own", "assigned"] as const).map((scope) => ({
        value: scope,
        label: t(`permissions.scope.${scope}`),
      })),
    },
  ];
  const grantCell = (scope: PermissionScope | undefined) =>
    scope ? (
      <Tooltip title={t(`permissions.scopeHint.${scope}`)}>
        <Tag
          color={scopeColor[scope]}
          icon={<CheckCircleFilled />}
          style={{ margin: 0 }}
        >
          {t(`permissions.scope.${scope}`)}
        </Tag>
      </Tooltip>
    ) : (
      <Tooltip title={t("permissions.notGranted")}>
        <MinusOutlined style={{ color: "var(--text-muted)" }} />
      </Tooltip>
    );

  const columns = [
    {
      ...list.column("key"),
      dataIndex: "key",
      title: t("permissions.columns.permission"),
      width: 280,
      sorter: true,
      ...columnSearch(),
      render: (key: string, row: Row) => (
        <div style={{ cursor: "pointer" }} onClick={() => setDetail(row)}>
          <Typography.Text strong>{name(key)}</Typography.Text>
          <div>
            <Typography.Text type="secondary" code style={{ fontSize: 11.5 }}>
              {key}
            </Typography.Text>
          </div>
        </div>
      ),
    },
    {
      ...list.column("module"),
      dataIndex: "module",
      title: t("permissions.columns.module"),
      width: 150,
      filters: (matrix.data?.modules ?? []).map((m) => ({
        text: t(`permissions.modules.${m.key}`),
        value: m.key,
      })),
      filterMultiple: false,
      render: (module: string) => (
        <Tag style={{ margin: 0 }}>{t(`permissions.modules.${module}`)}</Tag>
      ),
    },
    ...roles.map((role) => ({
      ...list.column(role),
      title: roleName(role),
      align: "center" as const,
      width: 140,
      filters: [
        { text: t("permissions.grantedTo"), value: "granted" },
        { text: t("permissions.notGranted"), value: "none" },
      ],
      filterMultiple: false,
      render: (_: unknown, row: Row) => grantCell(row.grants[role]),
    })),
    {
      key: "holders",
      title: t("permissions.columns.holders"),
      align: "right" as const,
      width: 120,
      render: (_: unknown, row: Row) =>
        users.isSuccess ? holders(row).length : "—",
    },
  ];

  const onExport = list.exporter(
    columns,
    {
      key: (row) => ({
        [t("permissions.columns.permission")]: name(row.key),
        key: row.key,
      }),
      module: (row) => t(`permissions.modules.${row.module}`),
      ...Object.fromEntries(
        roles.map((role) => [
          role,
          (row: Row) =>
            row.grants[role] ? t(`permissions.scope.${row.grants[role]}`) : "",
        ]),
      ),
      holders: (row) => (users.isSuccess ? holders(row).length : ""),
    },
    "permission-matrix",
  );

  return (
    <AppPage
      guide="admin"
      active="platform"
      breadcrumb={[
        { label: t("title"), to: "/platform/organizations" },
        { label: t("permissions.title") },
      ]}
    >
      <PageContainer>
        {matrix.isError ? (
          <Alert type="error" showIcon title={matrix.error.message} />
        ) : null}
        <DataTable<Row>
          rowKey="key"
          columns={columns}
          {...list.table}
          loading={list.table.loading || matrix.isPending}
          statisticsData={statistics}
          tabs={[
            { key: "ALL", label: t("permissions.allModules") },
            ...(matrix.data?.modules ?? []).map((m) => ({
              key: m.key,
              label: t(`permissions.modules.${m.key}`),
            })),
          ]}
          activeTab={tab}
          onTabChange={changeTab}
          searchPlaceholder={t("permissions.searchPlaceholder")}
          filters={filterConfig}
          onRefresh={() => {
            void matrix.refetch();
            void users.refetch();
          }}
          exportable
          exportFilename="permission-matrix"
          onExport={(options) => void onExport(options)}
          actionsWidth={96}
          customActions={(row) => (
            <TableRowActions
              primary={{
                label: t("permissions.detail"),
                icon: <EyeOutlined />,
                onClick: () => setDetail(row),
              }}
            />
          )}
        />
      </PageContainer>
      <DetailModal
        open={!!detail}
        title={detail ? name(detail.key) : undefined}
        record={detail}
        width={720}
        onClose={() => setDetail(undefined)}
        items={
          detail
            ? [
                {
                  key: "key",
                  label: t("permissions.columns.permission"),
                  value: <Typography.Text code>{detail.key}</Typography.Text>,
                },
                {
                  key: "module",
                  label: t("permissions.columns.module"),
                  value: t(`permissions.modules.${detail.module}`),
                },
                ...roles.map((role) => ({
                  key: role,
                  label: roleName(role),
                  value: grantCell(detail.grants[role]),
                })),
              ]
            : []
        }
      >
        {detail ? (
          <>
            <Typography.Title level={5}>
              {t("permissions.usersHolding")}
            </Typography.Title>
            {holders(detail).length ? (
              holders(detail).map((user) => (
                <div
                  key={user.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "6px 0",
                    borderTop: "1px solid var(--border-divider)",
                  }}
                >
                  <span>
                    <Typography.Text strong>
                      {String(user.displayName)}
                    </Typography.Text>{" "}
                    <Typography.Text type="secondary">
                      {String(user.email)}
                    </Typography.Text>
                  </span>
                  <Tag style={{ margin: 0 }}>{roleName(user.role as Role)}</Tag>
                </div>
              ))
            ) : (
              <Empty description={t("permissions.noHolders")} />
            )}
          </>
        ) : null}
      </DetailModal>
    </AppPage>
  );
}
