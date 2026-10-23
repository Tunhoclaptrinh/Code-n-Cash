import React from "react";
import type { ButtonProps as AntButtonProps } from "antd";
import type { FormInstance } from "antd";
import type { SelectProps } from "antd/es/select";
export * from "./DataTable/types";
export type ButtonVariant =
  "brand" | "primary" | "secondary" | "gold" | "danger" | "ghost" | "success";
export interface BaseButtonProps extends Omit<
  AntButtonProps,
  "type" | "variant"
> {
  variant?: ButtonVariant;
  tooltip?: string;
  glow?: boolean;
}
export interface BaseCardProps {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  extra?: React.ReactNode;
  actions?: React.ReactNode[];
  loading?: boolean;
  bordered?: boolean;
  hoverable?: boolean;
  glow?: boolean;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  bodyStyle?: React.CSSProperties;
  onClick?: () => void;
}
export interface CardGridProps<T = any> {
  data?: T[];
  loading?: boolean;
  renderCard: (item: T, index: number) => React.ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  colProps?: Record<string, number>;
  gutter?: [number, number];
  keyExtractor?: (item: T, index: number) => string | number;
}
export interface TrendInfo {
  value: number | string;
  isIncrease?: boolean;
  label?: string;
}
export interface StatisticCardProps {
  title: React.ReactNode;
  value: number | string;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  precision?: number;
  icon?: React.ReactNode;
  iconBg?: string;
  trend?: TrendInfo;
  tag?: {
    text: string;
    color?: string;
  };
  subText?: React.ReactNode;
  valueColor?: string;
  loading?: boolean;
  extra?: React.ReactNode;
  onClick?: () => void;
  style?: React.CSSProperties;
}
export interface StatisticsItem {
  title: React.ReactNode;
  value: number | string;
  icon?: React.ReactNode;
  status?: string;
  onClick?: () => void;
  backgroundColor?: string;
  valueColor?: string;
  selected?: boolean;
  colSpan?: Record<string, number>;
}
export interface StatisticsCardProps {
  title?: React.ReactNode;
  data?: StatisticsItem[];
  loading?: boolean;
  containerStyle?: React.CSSProperties;
  cardStyle?: React.CSSProperties;
  colSpan?: Record<string, number>;
  hideCard?: boolean;
  rowGutter?: number;
  borderleft?: boolean;
  statShadow?: boolean;
}
export interface BreadcrumbItem {
  title: string;
  path?: string;
}
export interface PageContainerTab {
  key: string;
  tab: React.ReactNode;
}
export interface PageContainerProps {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  tooltip?: string | React.ReactNode;
  icon?: React.ReactNode;
  avatarBg?: string;
  breadcrumbs?: BreadcrumbItem[];
  extra?: React.ReactNode;
  tags?: React.ReactNode;
  tabs?: PageContainerTab[];
  activeTabKey?: string;
  onTabChange?: (key: string) => void;
  children: React.ReactNode;
  style?: React.CSSProperties;
  contentStyle?: React.CSSProperties;
  loading?: boolean;
}
export interface FormFooterProps {
  submitText?: string;
  cancelText?: string;
  resetText?: string;
  loading?: boolean;
  disabled?: boolean;
  align?: "center" | "left" | "right" | "space-between";
  onCancel?: () => void;
  onSubmit?: () => void;
  onReset?: () => void;
  extra?: React.ReactNode;
  style?: React.CSSProperties;
}
export interface FormModalProps<T = any> {
  form?: FormInstance<T>;
  open: boolean;
  title?: React.ReactNode;
  entityName?: string;
  isEditing?: boolean;
  icon?: React.ReactNode;
  initialValues?: Partial<T>;
  loading?: boolean;
  width?: number | string;
  submitText?: string;
  cancelText?: string;
  resetText?: string;
  footerAlign?: "center" | "left" | "right" | "space-between";
  footer?: React.ReactNode | null;
  onClose: () => void;
  onSubmit: (values: T) => Promise<void> | void;
  onReset?: () => void;
  children: React.ReactNode | ((form: FormInstance<T>) => React.ReactNode);
}
export interface FormDrawerProps<T = any> {
  open: boolean;
  title: React.ReactNode;
  icon?: React.ReactNode;
  initialValues?: Partial<T>;
  loading?: boolean;
  width?: number | string;
  submitText?: string;
  cancelText?: string;
  onClose: () => void;
  onSubmit: (values: T) => Promise<void> | void;
  children: React.ReactNode | ((form: FormInstance<T>) => React.ReactNode);
}
export interface ConfirmModalProps {
  open: boolean;
  title: string;
  content: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}
export interface ActionDrawerProps {
  open: boolean;
  title: React.ReactNode;
  onClose: () => void;
  width?: number | string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}
export interface DebounceSelectProps<ValueType = any> extends Omit<
  SelectProps<ValueType | ValueType[]>,
  "options" | "children"
> {
  fetchOptions: (search: string) => Promise<ValueType[]>;
  debounceTimeout?: number;
}
export interface TabSwitcherProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}
export interface StatusTagProps {
  status: string;
  text?: string;
  customLabel?: string;
}
export interface BadgeStatusProps {
  status: "processing" | "success" | "error" | "warning" | "default";
  text: string;
}
export interface EmptyStateProps {
  icon?: React.ReactNode;
  title?: string;
  description?: string;
  actionText?: string;
  onAction?: () => void;
}
export interface LoadingStateProps {
  tip?: string;
  size?: "small" | "default" | "large";
  minHeight?: number | string;
}
