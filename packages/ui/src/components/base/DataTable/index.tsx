import { uiText } from "../../../i18n";
import { useState } from "react";
import {
  Table,
  Space,
  Input,
  Modal,
  Badge,
  Dropdown,
  Tooltip,
  Alert,
  Card,
  Tabs,
} from "antd";
import {
  PlusOutlined,
  UploadOutlined,
  DownloadOutlined,
  FilterOutlined,
  ReloadOutlined,
  SearchOutlined,
  EyeOutlined,
  EditOutlined,
  DeleteOutlined,
  DownOutlined,
} from "@ant-design/icons";
import { BaseButton } from "../BaseButton";
import { IconButton } from "../IconButton";
import { EmptyState } from "../EmptyState";
import { StatisticsCard } from "../StatisticCard";
import { FilterBuilder } from "./FilterBuilder";
import { ExportModal } from "./ExportModal";
import { ImportModal } from "./ImportModal";
import { DataTableProps, DataTableColumn } from "./types";
import { exportToCSV, exportToJSON } from "../../../utils/export";
export const DataTable = <T extends Record<string, any>>({
  data,
  dataSource,
  loading = false,
  columns = [],
  importColumns,
  onAdd,
  creatable,
  onView,
  onEdit,
  onDelete,
  onRefresh,
  pagination,
  onPaginationChange,
  searchable = true,
  searchPlaceholder = uiText("sf696346284"),
  searchValue,
  onSearch,
  hideGlobalSearch = false,
  headerContent,
  statistics,
  statisticsData,
  statisticsTitle,
  filters = [],
  filterValues = {},
  onFilterChange,
  onClearFilters,
  fieldLabelMap,
  customValueMap,
  showActions = false,
  actionsWidth = 120,
  customActions,
  batchOperations,
  onBatchDelete,
  selectedRowKeys: controlledSelectedRowKeys,
  onSelectChange,
  batchActions = [],
  importable,
  importLoading = false,
  exportable,
  exportLoading = false,
  exportFilename = "data-export",
  onImport,
  onValidateImport,
  onDownloadTemplate,
  onExport,
  title,
  subtitle,
  extra,
  rowKey = "_id",
  size = "middle",
  bordered = false,
  scroll,
  emptyText,
  rowSelection: customRowSelection,
  showAlert = false,
  alertMessage,
  alertType = "info",
  hideCard = false,
  tabs,
  activeTab,
  onTabChange,
  searchFields = [],
  ...antTableProps
}: DataTableProps<T>) => {
  const [localPagination, setLocalPagination] = useState({
    current: 1,
    pageSize: 10,
  });
  const [internalSearchText, setInternalSearchText] = useState(
    searchValue || "",
  );
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState<any[]>([]);
  const [operators, setOperators] = useState<Record<string, string>>({});
  const [enabledFilters, setEnabledFilters] = useState<Record<string, boolean>>(
    {},
  );
  const [internalSelectedRowKeys, setInternalSelectedRowKeys] = useState<any[]>(
    [],
  );
  const rawData = dataSource || data || [];
  const filteredData = rawData.filter((item) => {
    if (onSearch) return true;
    const query = (searchValue !== undefined ? searchValue : internalSearchText)
      .trim()
      .toLowerCase();
    if (!query) return true;
    if (searchFields.length > 0) {
      return searchFields.some((field) => {
        const val = item[field];
        return (
          val !== undefined &&
          val !== null &&
          String(val).toLowerCase().includes(query)
        );
      });
    }
    return Object.values(item).some(
      (val) =>
        val !== undefined &&
        val !== null &&
        String(val).toLowerCase().includes(query),
    );
  });
  const activeSelectedRowKeys =
    controlledSelectedRowKeys || internalSelectedRowKeys;
  const handleSelectChange = (keys: any[], rows: any[]) => {
    if (onSelectChange) {
      onSelectChange(keys, rows);
    } else {
      setInternalSelectedRowKeys(keys);
    }
  };
  const rowSelection =
    customRowSelection ||
    (batchOperations
      ? {
          selectedRowKeys: activeSelectedRowKeys,
          onChange: handleSelectChange,
        }
      : undefined);
  const tableColumns: DataTableColumn<T>[] = [...columns];
  if (
    (showActions || onView || onEdit || onDelete || customActions) &&
    !tableColumns.find((c) => c.key === "actions")
  ) {
    tableColumns.push({
      title: uiText("sfed024b82c"),
      key: "actions",
      width: actionsWidth,
      fixed: "right",
      render: (_: any, record: T) => {
        if (customActions) return customActions(record);
        const recKey =
          typeof rowKey === "function"
            ? rowKey(record)
            : record[rowKey] || record.id || record._id;
        return (
          <Space size={4}>
            {onView && (
              <IconButton
                icon={<EyeOutlined />}
                tooltip={uiText("se30c937169")}
                onClick={() => onView(record)}
              />
            )}
            {onEdit && (
              <IconButton
                icon={<EditOutlined />}
                tooltip={uiText("sb59e6523fc")}
                color="#fcc20f"
                hoverColor="#d49e07"
                onClick={() => onEdit(record)}
              />
            )}
            {onDelete && (
              <IconButton
                icon={<DeleteOutlined />}
                tooltip={uiText("sd9f091e36a")}
                danger
                onClick={() => onDelete(recKey)}
              />
            )}
          </Space>
        );
      },
    });
  }
  const addFilterCondition = (key: string) => {
    const config = filters.find((f) => f.key === key);
    if (config && !activeFilters.find((f) => f.key === key)) {
      setActiveFilters((prev) => [...prev, config]);
      setEnabledFilters((prev) => ({ ...prev, [key]: true }));
      setOperators((prev) => ({
        ...prev,
        [key]: config.defaultOperator || "eq",
      }));
    }
  };
  const removeFilterCondition = (key: string) => {
    setActiveFilters((prev) => prev.filter((f) => f.key !== key));
    if (onFilterChange) onFilterChange(key, undefined);
  };
  const handleApplyCustomFilters = () => {
    setFilterModalOpen(false);
  };
  const handleClearFilters = () => {
    setActiveFilters([]);
    setEnabledFilters({});
    setOperators({});
    if (onClearFilters) onClearFilters();
    setFilterModalOpen(false);
  };
  const handleExportDefault = (options: any) => {
    if (onExport) {
      onExport(options);
    } else {
      const current =
        typeof pagination === "object"
          ? (pagination.current ?? localPagination.current)
          : localPagination.current;
      const size =
        typeof pagination === "object"
          ? (pagination.pageSize ?? localPagination.pageSize)
          : localPagination.pageSize;
      const scoped =
        options.scope === "page"
          ? filteredData.slice((current - 1) * size, current * size)
          : options.scope === "custom"
            ? filteredData.slice(0, options.limit)
            : filteredData;
      const rows = options.columns?.length
        ? scoped.map((record) =>
            Object.fromEntries(
              options.columns.map((key: string) => [key, record[key]]),
            ),
          )
        : scoped;
      if (options.format === "json") exportToJSON(rows, exportFilename);
      else exportToCSV(rows, exportFilename);
    }
  };
  const batchActionsMenu = {
    items: [
      ...(onBatchDelete
        ? [
            {
              key: "batch-delete",
              icon: <DeleteOutlined style={{ color: "#EF4444" }} />,
              label: uiText("s3248a567ff", {
                v0: activeSelectedRowKeys.length,
              }),
              onClick: () => onBatchDelete(activeSelectedRowKeys),
              danger: true,
            },
          ]
        : []),
      ...batchActions,
    ],
  };
  const totalCount =
    pagination &&
    typeof pagination === "object" &&
    typeof pagination.total === "number"
      ? pagination.total
      : filteredData.length;
  const showAddBtn = creatable !== false && !!onAdd;
  const showImportBtn = !!importable || !!onImport;
  const showExportBtn = !!exportable || !!onExport;
  const showBatchBtn = !!batchOperations && activeSelectedRowKeys.length > 0;
  const showFilterBtn = filters && filters.length > 0;
  const renderContent = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {statistics ? (
        <div style={{ padding: "16px 20px 0 20px" }}>{statistics}</div>
      ) : statisticsData && statisticsData.length > 0 ? (
        <div style={{ padding: "16px 20px 0 20px" }}>
          <StatisticsCard
            title={statisticsTitle}
            data={statisticsData}
            rowGutter={12}
            hideCard={true}
            borderleft={false}
            statShadow={false}
          />
        </div>
      ) : null}

      {(headerContent || (tabs && tabs.length > 0)) && (
        <div style={{ padding: "0 20px", borderBottom: "1px solid #E5E7EB" }}>
          {headerContent}
          {tabs && tabs.length > 0 && (
            <Tabs
              activeKey={activeTab}
              onChange={onTabChange}
              items={tabs}
              style={{ marginBottom: -16 }}
            />
          )}
        </div>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 10,
          padding: "0 20px",
        }}
      >
        <Space wrap size="small">
          {showAddBtn && (
            <BaseButton variant="primary" onClick={onAdd} size="small" glow>
              <PlusOutlined />
              {uiText("sb64afef142")}
            </BaseButton>
          )}

          {showImportBtn && (
            <BaseButton
              variant="ghost"
              size="small"
              onClick={() => setImportModalOpen(true)}
              loading={importLoading}
              icon={<UploadOutlined />}
            >
              {uiText("sd6fbc9d2bd")}
            </BaseButton>
          )}

          {showExportBtn && (
            <BaseButton
              variant="ghost"
              size="small"
              onClick={() => setExportModalOpen(true)}
              loading={exportLoading}
              icon={<DownloadOutlined />}
            >
              {uiText("sf3e4fadb9e")}
            </BaseButton>
          )}

          {extra}

          {showBatchBtn && (
            <Badge count={activeSelectedRowKeys.length}>
              <Dropdown menu={batchActionsMenu} trigger={["click"]}>
                <BaseButton variant="ghost" size="small">
                  {uiText("s2cb1c469c4")}
                  <DownOutlined style={{ fontSize: 10, marginLeft: 4 }} />
                </BaseButton>
              </Dropdown>
            </Badge>
          )}
        </Space>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          {searchable && !hideGlobalSearch && (
            <Input
              placeholder={searchPlaceholder}
              value={internalSearchText}
              onChange={(e) => {
                const val = e.target.value;
                setInternalSearchText(val);
                if (onSearch) onSearch(val);
              }}
              style={{ width: 200, height: 32, borderRadius: 6 }}
              allowClear
              prefix={<SearchOutlined style={{ color: "#9CA3AF" }} />}
            />
          )}

          {showFilterBtn && (
            <Badge dot={activeFilters.length > 0}>
              <BaseButton
                variant="ghost"
                size="small"
                onClick={() => setFilterModalOpen(true)}
                icon={<FilterOutlined />}
              >
                {uiText("s75051abc1e")}
              </BaseButton>
            </Badge>
          )}

          {onRefresh && (
            <Tooltip title={uiText("s61b0561227")}>
              <BaseButton
                variant="ghost"
                size="small"
                onClick={onRefresh}
                loading={loading}
                icon={<ReloadOutlined />}
              >
                {uiText("s61b0561227")}
              </BaseButton>
            </Tooltip>
          )}

          <div
            style={{
              height: 32,
              padding: "0 12px",
              borderRadius: 6,
              background: "var(--bg-surface-card, #FFFFFF)",
              border: "1px solid var(--border-subtle, #E5E7EB)",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text-secondary, #4B5563)",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            {uiText("sc73de6b489")}
            <span style={{ color: "#315bea", fontWeight: 800 }}>
              {totalCount}
            </span>
          </div>
        </div>
      </div>

      {showAlert && alertMessage && (
        <div style={{ padding: "0 20px" }}>
          <Alert title={alertMessage} type={alertType} showIcon closable />
        </div>
      )}

      <Table
        className="main-table"
        rowKey={rowKey}
        columns={tableColumns as any}
        dataSource={filteredData}
        loading={loading}
        size={size}
        bordered={bordered}
        rowSelection={rowSelection}
        pagination={
          pagination !== false
            ? {
                showSizeChanger: true,
                showQuickJumper: true,
                pageSizeOptions: ["10", "20", "50", "100"],
                showTotal: (total: number) =>
                  uiText("s759d7c0fc5", { v0: total }),
                ...(pagination || {}),
              }
            : false
        }
        onChange={(page, filters, sorter) => {
          setLocalPagination({
            current: page.current ?? 1,
            pageSize: page.pageSize ?? 10,
          });
          onPaginationChange?.(page, filters, sorter);
        }}
        scroll={scroll || { x: 1000 }}
        locale={{
          emptyText: (
            <EmptyState
              title={emptyText || uiText("s0638beb9c4")}
              description={uiText("s09bd2a87c4")}
            />
          ),
        }}
        {...antTableProps}
      />

      <Modal
        open={filterModalOpen}
        onCancel={() => setFilterModalOpen(false)}
        title={uiText("s7babe198d6")}
        width={680}
        footer={null}
        destroyOnHidden
      >
        <FilterBuilder
          filters={filters.filter((f) => !f.hidden)}
          activeFilters={activeFilters}
          filterValues={filterValues}
          operators={operators}
          enabledFilters={enabledFilters}
          onAddFilter={addFilterCondition}
          onRemoveFilter={removeFilterCondition}
          onFilterChange={onFilterChange || (() => {})}
          onOperatorChange={(key, op) =>
            setOperators((p) => ({ ...p, [key]: op }))
          }
          onToggleFilter={(key) =>
            setEnabledFilters((p) => ({ ...p, [key]: !p[key] }))
          }
          onApply={handleApplyCustomFilters}
          onClear={handleClearFilters}
          onCancel={() => setFilterModalOpen(false)}
        />
      </Modal>

      <ExportModal
        visible={exportModalOpen}
        onCancel={() => setExportModalOpen(false)}
        onOk={(options) => {
          handleExportDefault(options);
          setExportModalOpen(false);
        }}
        loading={exportLoading}
        totalRecords={totalCount}
        columns={columns as any}
        fieldLabelMap={fieldLabelMap}
      />

      <ImportModal
        visible={importModalOpen}
        onCancel={() => setImportModalOpen(false)}
        columns={importColumns || (columns as any)}
        onImport={(file) => {
          if (onImport) onImport(file);
          setImportModalOpen(false);
        }}
        onDownloadTemplate={onDownloadTemplate}
        loading={importLoading}
        entityName={typeof title === "string" ? title : uiText("s64e00d431c")}
      />
    </div>
  );
  return (
    <div className="data-table-wrapper">
      {hideCard ? (
        renderContent()
      ) : (
        <Card
          title={
            title ? (
              <div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{title}</div>
                {subtitle && (
                  <div
                    style={{ color: "#6B7280", fontSize: 12, fontWeight: 400 }}
                  >
                    {subtitle}
                  </div>
                )}
              </div>
            ) : null
          }
          style={{
            borderRadius: 12,
            border: "1px solid #E5E7EB",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
            overflow: "hidden",
          }}
          styles={{ body: { padding: 0 } }}
        >
          {renderContent()}
        </Card>
      )}
    </div>
  );
};
export default DataTable;
