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
  eq: uiText("sd71bdec1da"),
  ne: uiText("s3bc6bae133"),
  gt: uiText("s179aa466ff"),
  gte: uiText("s0c07cd31e1"),
  lt: uiText("sca70d4be08"),
  lte: uiText("s40f300d6e5"),
  like: uiText("s7bb114417f"),
  ilike: uiText("s998bae0cdc"),
  not_like: uiText("s968ed4be99"),
  in: uiText("sd2d2c342ca"),
  nin: uiText("s846d51d088"),
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
  applyText = uiText("s97819907a6"),
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
            <p style={{ margin: 0, fontSize: 13 }}>{uiText("s691e64ab83")}</p>
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
                        placeholder={uiText("sa02d0bbea7")}
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
                        placeholder={uiText("s469b116391")}
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
                        placeholder={uiText("sa4d14e6bfb")}
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
                        ? uiText("seb417ffdf6")
                        : uiText("s9176cddf30")
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
              {uiText("s8d05648afd")}
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
              {uiText("s34ca764caf")}
            </BaseButton>
          )}
          {onClear && (
            <BaseButton
              variant="ghost"
              size="small"
              onClick={onClear}
              style={{ minWidth: 90 }}
            >
              {uiText("sd89e6c532f")}
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
