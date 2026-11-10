import { Button, Input, Space } from "antd";
import { FilterFilled, SearchOutlined } from "@ant-design/icons";
import type { FilterDropdownProps } from "antd/es/table/interface";
import i18n from "@/i18n";

/**
 * Column filter trigger with a translated accessible name; Ant Design's default icon is announced by
 * its English icon name ("filter").
 */
export function columnFilterIcon(filtered: boolean) {
  return (
    <FilterFilled
      aria-label={i18n.t("columnSearch.filter", { ns: "common" })}
      style={{ color: filtered ? "var(--color-primary)" : undefined }}
    />
  );
}

/**
 * Text search inside one column (Base DataTable "searchable" column). With a list query the typed
 * text becomes a "contains" filter of that column's field, applied where the rows are read; give
 * `text` only for a table that filters its rows in the browser itself.
 */
export function columnSearch<T>(text?: (row: T) => string) {
  const t = (key: string) => i18n.t(key, { ns: "common" });
  return {
    filterDropdown: ({
      selectedKeys,
      setSelectedKeys,
      confirm,
      clearFilters,
    }: FilterDropdownProps) => (
      <div
        style={{ padding: 8, width: 240 }}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <Input
          autoFocus
          allowClear
          placeholder={t("columnSearch.placeholder")}
          value={String(selectedKeys[0] ?? "")}
          onChange={(e) =>
            setSelectedKeys(e.target.value ? [e.target.value] : [])
          }
          onPressEnter={() => confirm()}
          style={{ marginBottom: 8 }}
        />
        <Space>
          <Button
            type="primary"
            size="small"
            icon={<SearchOutlined />}
            onClick={() => confirm()}
          >
            {t("columnSearch.search")}
          </Button>
          <Button
            size="small"
            onClick={() => {
              clearFilters?.();
              confirm();
            }}
          >
            {t("columnSearch.reset")}
          </Button>
        </Space>
      </div>
    ),
    filterIcon: (filtered: boolean) => (
      <SearchOutlined
        aria-label={t("columnSearch.trigger")}
        style={{ color: filtered ? "var(--color-primary)" : undefined }}
      />
    ),
    ...(text
      ? {
          onFilter: (value: unknown, row: T) =>
            text(row).toLowerCase().includes(String(value).toLowerCase()),
        }
      : {}),
  };
}
