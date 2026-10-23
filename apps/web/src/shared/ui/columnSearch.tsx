import { Button, Input, Space } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import type { FilterDropdownProps } from "antd/es/table/interface";
import i18n from "@/i18n";

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
