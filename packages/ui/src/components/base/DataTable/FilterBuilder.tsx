import { uiText } from "../../../i18n";
import React from "react";
import { Dropdown, Select, Input, DatePicker, Tooltip, Checkbox } from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { BaseButton } from "../BaseButton";
import { FilterConfig } from "./types";
export interface FilterBuilderProps {
  filters: FilterConfig[];
  activeFilters: FilterConfig[];
  filterValues: Record<string, any>;
  operators: Record<string, string>;
  enabledFilters: Record<string, boolean>;
  onAddFilter: (key: string) => void;
  onRemoveFilter: (key: string) => void;
  onFilterChange: (key: string, value: any) => void;
  onOperatorChange: (key: string, op: string) => void;
  onToggleFilter: (key: string) => void;
  onApply?: () => void;
  onClear?: () => void;
  onCancel?: () => void;
  hideFooter?: boolean;
  applyText?: string;
}
export const OPERATOR_LABELS: Record<string, string> = {
  eq: uiText("filter.operator.eq"),
  ne: uiText("filter.operator.ne"),
  gt: uiText("filter.operator.gt"),
  gte: uiText("filter.operator.gte"),
  lt: uiText("filter.operator.lt"),
  lte: uiText("filter.operator.lte"),
  like: uiText("filter.operator.like"),
  ilike: uiText("filter.operator.ilike"),
  not_like: uiText("filter.operator.notLike"),
  in: uiText("filter.operator.in"),
  nin: uiText("filter.operator.notIn"),
};
export const FilterBuilder: React.FC<FilterBuilderProps> = ({
  filters,
  activeFilters,
  filterValues,
  operators,
  enabledFilters,
  onAddFilter,
  onRemoveFilter,
  onFilterChange,
  onOperatorChange,
  onToggleFilter,
  onApply,
  onClear,
  onCancel,
  hideFooter = false,
  applyText = uiText("filter.apply"),
}) => {
  return (
    <div className="filter-builder-container">
      <div className="active-filters-section">
        {activeFilters.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "24px 16px",
              color: "var(--text-muted, #94A3B8)",
              background: "var(--bg-surface-card, #FFFFFF)",
              borderRadius: 8,
              border: "2px dashed var(--border-subtle, #E5E7EB)",
            }}
          >
            <p style={{ margin: 0, fontSize: 13 }}>{uiText("filter.empty")}</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {activeFilters.map((filter) => {
              const label = filter.label || filter.placeholder || filter.key;
              let currentOpRaw = operators[filter.key];
              if (!currentOpRaw) {
                const operatorSuffixToOp: Record<string, string> = {
                  "": "eq",
                  _ne: "ne",
                  _gte: "gte",
                  _lte: "lte",
                  _like: "like",
                  _in: "in",
                };
                for (const [suffix, op] of Object.entries(operatorSuffixToOp)) {
                  if (
                    suffix &&
                    filterValues[`${filter.key}${suffix}`] !== undefined
                  ) {
                    currentOpRaw = op;
                    break;
                  }
                }
              }
              const currentOp = currentOpRaw || filter.defaultOperator || "eq";
              const isEnabled = enabledFilters[filter.key] !== false;
              const activeKey =
                currentOp === "eq" ? filter.key : `${filter.key}_${currentOp}`;
              return (
                <div
                  key={filter.key}
                  className={`filter-condition-item ${!isEnabled ? "disabled" : ""}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    background: "var(--bg-surface-card, #FFFFFF)",
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--border-subtle, #E5E7EB)",
                  }}
                >
                  <Checkbox
                    checked={isEnabled}
                    disabled={filter.disabled}
                    onChange={() =>
                      !filter.disabled && onToggleFilter(filter.key)
                    }
                  />

                  <div
                    style={{
                      width: 140,
                      fontWeight: 600,
                      fontSize: 13,
                      color: "#374151",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {label}
                  </div>

                  <Select
                    value={currentOp}
                    disabled={filter.disabled}
                    style={{ width: 130 }}
                    size="middle"
                    onChange={(op) => {
                      if (filter.disabled) return;
                      onOperatorChange(filter.key, op);
                    }}
                    options={(
                      filter.operators || ["eq", "ne", "like", "in"]
                    ).map((op) => ({
                      value: op,
                      label: OPERATOR_LABELS[op] || op,
                    }))}
                  />

                  <div style={{ flex: 1 }}>
                    {filter.type === "select" && (
                      <Select
                        placeholder={uiText("filter.selectValue")}
                        value={filterValues[activeKey]}
                        disabled={filter.disabled}
                        onChange={(val) =>
                          !filter.disabled && onFilterChange(filter.key, val)
                        }
                        allowClear={!filter.disabled}
                        style={{ width: "100%" }}
                        options={filter.options}
                        size="middle"
                        mode={
                          currentOp === "in" || currentOp === "nin"
                            ? "multiple"
                            : undefined
                        }
                      />
                    )}

                    {(filter.type === "input" || filter.type === "number") && (
                      <Input
                        placeholder={uiText("filter.enterValue")}
                        value={filterValues[activeKey]}
                        disabled={filter.disabled}
                        onChange={(e) =>
                          !filter.disabled &&
                          onFilterChange(filter.key, e.target.value)
                        }
                        allowClear={!filter.disabled}
                        style={{ width: "100%" }}
                        type={filter.type === "number" ? "number" : "text"}
                        size="middle"
                      />
                    )}

                    {filter.type === "date" && (
                      <DatePicker
                        placeholder={uiText("filter.selectDate")}
                        disabled={filter.disabled}
                        style={{ width: "100%" }}
                        value={
                          filterValues[activeKey]
                            ? dayjs(filterValues[activeKey])
                            : null
                        }
                        onChange={(_date, dateString) => {
                          !filter.disabled &&
                            onFilterChange(filter.key, dateString);
                        }}
                        size="middle"
                      />
                    )}
                  </div>

                  <Tooltip
                    title={
                      filter.disabled
                        ? uiText("filter.fixed")
                        : uiText("filter.remove")
                    }
                  >
                    <BaseButton
                      variant="danger"
                      size="small"
                      disabled={filter.disabled}
                      onClick={() =>
                        !filter.disabled && onRemoveFilter(filter.key)
                      }
                      icon={<DeleteOutlined />}
                    />
                  </Tooltip>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          <Dropdown
            menu={{
              items: filters
                .filter((f) => !activeFilters.find((af) => af.key === f.key))
                .map((f) => ({
                  key: f.key,
                  label: f.label || f.placeholder || f.key,
                  onClick: () => onAddFilter(f.key),
                })),
              style: { maxHeight: 260, overflowY: "auto" },
            }}
            disabled={filters.length === activeFilters.length}
            trigger={["click"]}
          >
            <BaseButton
              variant="ghost"
              size="small"
              style={{
                width: "100%",
                borderStyle: "dashed",
                background: "#FFFFFF",
                color: "#4B5563",
              }}
              icon={<PlusOutlined />}
            >
              {uiText("filter.add")}
            </BaseButton>
          </Dropdown>
        </div>
      </div>

      {!hideFooter && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 10,
            marginTop: 16,
            paddingTop: 14,
            borderTop: "1px solid #E5E7EB",
          }}
        >
          {onCancel && (
            <BaseButton
              variant="ghost"
              size="small"
              onClick={onCancel}
              style={{ minWidth: 90 }}
            >
              {uiText("action.cancel")}
            </BaseButton>
          )}
          {onClear && (
            <BaseButton
              variant="ghost"
              size="small"
              onClick={onClear}
              style={{ minWidth: 90 }}
            >
              {uiText("filter.clear")}
            </BaseButton>
          )}
          {onApply && (
            <BaseButton
              variant="primary"
              size="small"
              onClick={onApply}
              glow
              style={{ minWidth: 120 }}
            >
              {applyText}
            </BaseButton>
          )}
        </div>
      )}
    </div>
  );
};
export default FilterBuilder;
