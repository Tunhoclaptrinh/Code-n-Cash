import React from "react";
import type { ColumnType } from "antd/es/table";
import type { StatisticsItem } from "../types";
export interface FilterOption {
  label: string;
  value: any;
}
export interface FilterConfig {
  key: string;
  label?: string;
  placeholder?: string;
  type?: "select" | "input" | "date" | "date-range" | "number";
  options?: FilterOption[];
  operators?: (
    | "eq"
    | "ne"
    | "gt"
    | "gte"
    | "lt"
    | "lte"
    | "like"
    | "not_like"
    | "in"
    | "nin"
    | "ilike"
  )[];
  defaultOperator?:
    | "eq"
    | "ne"
    | "gt"
    | "gte"
    | "lt"
    | "lte"
    | "like"
    | "not_like"
    | "in"
    | "nin"
    | "ilike";
  colSpan?: number;
  hidden?: boolean;
  disabled?: boolean;
}
export interface DataTableColumn<T = any> extends ColumnType<T> {
  sortable?: boolean;
  resizable?: boolean;
  searchable?: boolean;
  minWidth?: number;
  maxWidth?: number;
  required?: boolean;
  hidden?: boolean;
  exportHidden?: boolean;
}
export interface DataTableProps<T = any> {
  data?: T[];
  dataSource?: T[];
  loading?: boolean;
  columns?: DataTableColumn<T>[];
  importColumns?: DataTableColumn<T>[];
  onAdd?: () => void;
  creatable?:
    | boolean
    | {
        accessible: boolean;
        behavior?: "hide" | "disable";
      };
  onView?: (record: T) => void;
  onEdit?: (record: T) => void;
  onDelete?: (id: any) => void;
  onRefresh?: () => void;
  pagination?:
    | {
        current?: number;
        pageSize?: number;
        total?: number;
        [key: string]: any;
      }
    | false;
  onPaginationChange?: (pagination: any, filters: any, sorter: any) => void;
  searchable?: boolean;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearch?: (value: string) => void;
  hideGlobalSearch?: boolean;
  headerContent?: React.ReactNode;
  statistics?: React.ReactNode;
  statisticsData?: StatisticsItem[];
  statisticsTitle?: React.ReactNode;
  filters?: FilterConfig[];
  filterValues?: any;
  onFilterChange?: (key: string, value: any) => void;
  onClearFilters?: () => void;
  onFilterReset?: () => void;
  fieldLabelMap?: Record<string, string>;
  customValueMap?: Record<string, string>;
  sortable?: boolean;
  defaultSort?: any;
  showActions?: boolean;
  actionsWidth?: number;
  customActions?: (record: T) => React.ReactNode;
  actionColumnProps?: any;
  actionPosition?: "left" | "right";
  batchOperations?:
    | boolean
    | {
        accessible: boolean;
        behavior?: "hide" | "disable";
      };
  onBatchDelete?: (keys: any[]) => void;
  selectedRowKeys?: any[];
  onSelectChange?: (keys: any[], rows?: any[]) => void;
  batchActions?: any[];
  importable?:
    | boolean
    | {
        accessible: boolean;
        behavior?: "hide" | "disable";
      };
  importLoading?: boolean;
  exportable?:
    | boolean
    | {
        accessible: boolean;
        behavior?: "hide" | "disable";
      };
  exportLoading?: boolean;
  exportFilename?: string;
  onImport?: (file: File) => void;
  onValidateImport?: (file: File) => Promise<any>;
  onDownloadTemplate?: (options?: any) => void;
  onExport?: (options?: any) => void;
  title?: React.ReactNode;
  subtitle?: string;
  extra?: React.ReactNode;
  rowKey?: string | ((record: T) => string);
  size?: "small" | "middle" | "large";
  bordered?: boolean;
  scroll?: any;
  emptyText?: string;
  rowSelection?: any;
  showAlert?: boolean;
  alertMessage?: string;
  alertType?: "success" | "info" | "warning" | "error";
  saveColumnWidths?: boolean;
  columnResizeKey?: string;
  onColumnResize?: (key: string, width: number) => void;
  hideCard?: boolean;
  tabs?: {
    key: string;
    label: React.ReactNode;
  }[];
  activeTab?: string;
  onTabChange?: (key: string) => void;
  searchFields?: (keyof T | string)[];
  [key: string]: any;
}
