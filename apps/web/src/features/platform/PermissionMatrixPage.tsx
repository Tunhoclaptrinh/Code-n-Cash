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
  IconButton,
  PageContainer,
  exportToCSV,
  exportToJSON,
  useFilters,
  usePagination,
  type FilterConfig,
  type StatisticsItem,
} from "@codecash/ui";
import type {
  Entity,
  PermissionMatrix,
  PermissionScope,
  Role,
} from "@codecash/contracts";
import { platform } from "@/shared/api/platform";
import { AppPage } from "@/shared/layout/AppPage";

interface Row {
  key: string;
  module: string;
  grants: Partial<Record<Role, PermissionScope>>;
}
type Filters = { role?: Role; scope?: PermissionScope };

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
  ADMIN_AUDITOR: { bg: "rgba(239, 68, 68, 0.08)", value: "#EF4444" },
  SUPPLIER: { bg: "rgba(245, 158, 11, 0.08)", value: "#F59E0B" },
};

/**
 * Read-only view of the permission matrix the API enforces. Changing it is a specification
 * change with a second approver (SoD-4), so there are no edit controls here.
 */
export default function PermissionMatrixPage() {
  const { t } = useTranslation("platform");
  const { t: tc } = useTranslation("common");
  const [tab, setTab] = useState("ALL");
  const [detail, setDetail] = useState<Row>();
  const { filters, updateFilter, clearFilters } = useFilters<Filters>({});
  const { page, pageSize, goToPage, handleTableChange } = usePagination(1, 20);
  const matrix = useQuery({
    queryKey: ["permissions"],
    queryFn: () => platform.get<PermissionMatrix>("/permissions"),
  });
  const users = useQuery({
    queryKey: ["resource", "users", "permission-holders"],
    queryFn: () => platform.resource<Entity>("users").list({ limit: 100 }),
  });
  const roles = matrix.data?.roles ?? [];
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
  const visible = rows.filter(
    (row) =>
      (tab === "ALL" || row.module === tab) &&
      (!filters.role || row.grants[filters.role]) &&
      (!filters.scope || Object.values(row.grants).includes(filters.scope)),
  );
  const holders = (row: Row) =>
    (users.data?.items ?? []).filter(
      (user) => row.grants[user.role as Role] && user.active !== false,
    );
  const name = (key: string) =>
    t(`permissions.items.${key}`, { defaultValue: key });
  const roleName = (role: Role) => tc(`roles.${role}.name`);

  const changeTab = (key: string) => {
    setTab(key);
    goToPage(1);
  };
  const statistics: StatisticsItem[] = [
    {
      title: t("permissions.columns.permission"),
      value: rows.length,
      backgroundColor: "var(--bg-surface-alt)",
      valueColor: "var(--text-primary)",
      colSpan: { xs: 12, md: 8, xl: 4 },
      onClick: () => updateFilter("role", undefined),
    },
    ...roles.map((role) => ({
      title: roleName(role),
      value: rows.filter((row) => row.grants[role]).length,
      backgroundColor: roleColor[role].bg,
      valueColor: roleColor[role].value,
      selected: filters.role === role,
      colSpan: { xs: 12, md: 8, xl: 4 },
      onClick: () => {
        updateFilter("role", filters.role === role ? undefined : role);
        goToPage(1);
      },
    })),
  ];
  const filterConfig: FilterConfig[] = [
    {
      key: "role",
      label: t("permissions.grantedTo"),
      type: "select",
      options: roles.map((role) => ({ value: role, label: roleName(role) })),
    },
    {
      key: "scope",
      label: t("permissions.scopeLabel"),
      type: "select",
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
      key: "key",
      dataIndex: "key",
      title: t("permissions.columns.permission"),
      width: 280,
      sorter: (a: Row, b: Row) => a.key.localeCompare(b.key),
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
      key: "module",
      dataIndex: "module",
      title: t("permissions.columns.module"),
      width: 150,
      filters: (matrix.data?.modules ?? []).map((m) => ({
        text: t(`permissions.modules.${m.key}`),
        value: m.key,
      })),
      onFilter: (value: unknown, row: Row) => row.module === value,
      render: (module: string) => (
        <Tag style={{ margin: 0 }}>{t(`permissions.modules.${module}`)}</Tag>
      ),
    },
    ...roles.map((role) => ({
      key: role,
      title: roleName(role),
      align: "center" as const,
      width: 140,
      filters: [
        { text: t("permissions.grantedTo"), value: "granted" },
        { text: t("permissions.notGranted"), value: "none" },
      ],
      onFilter: (value: unknown, row: Row) =>
        value === "granted" ? !!row.grants[role] : !row.grants[role],
      render: (_: unknown, row: Row) => grantCell(row.grants[role]),
    })),
    {
      key: "holders",
      title: t("permissions.columns.holders"),
      align: "right" as const,
      width: 120,
      render: (_: unknown, row: Row) => holders(row).length,
    },
  ];

  const exportRows = (list: Row[]) =>
    list.map((row) => ({
      [t("permissions.columns.permission")]: name(row.key),
      key: row.key,
      [t("permissions.columns.module")]: t(`permissions.modules.${row.module}`),
      ...Object.fromEntries(
        roles.map((role) => [
          roleName(role),
          row.grants[role] ? t(`permissions.scope.${row.grants[role]}`) : "",
        ]),
      ),
    }));

  return (
    <AppPage
      active="platform"
      breadcrumb={[
        { label: t("title"), to: "/platform/organizations" },
        { label: t("permissions.title") },
      ]}
    >
      <PageContainer
        title={t("permissions.title")}
        subtitle={t("permissions.subtitle", { count: rows.length })}
      >
        <Alert type="info" showIcon title={t("permissions.source")} />
        {matrix.isError ? (
          <Alert type="error" showIcon title={matrix.error.message} />
        ) : null}
        <DataTable<Row>
          rowKey="key"
          dataSource={visible}
          columns={columns}
          loading={matrix.isPending}
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
          searchFields={["key"]}
          filters={filterConfig}
          filterValues={filters}
          onFilterChange={(key, value) => {
            updateFilter(key as keyof Filters, value || undefined);
            goToPage(1);
          }}
          onClearFilters={clearFilters}
          onRefresh={() => {
            void matrix.refetch();
            void users.refetch();
          }}
          pagination={{ current: page, pageSize }}
          onPaginationChange={handleTableChange}
          exportable
          onExport={(options) => {
            const list = exportRows(
              options.scope === "page"
                ? visible.slice((page - 1) * pageSize, page * pageSize)
                : options.scope === "custom"
                  ? visible.slice(0, options.limit)
                  : visible,
            );
            if (options.format === "json")
              exportToJSON(list, "permission-matrix");
            else exportToCSV(list, "permission-matrix");
          }}
          customActions={(row) => (
            <IconButton
              icon={<EyeOutlined />}
              tooltip={t("permissions.detail")}
              onClick={() => setDetail(row)}
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
