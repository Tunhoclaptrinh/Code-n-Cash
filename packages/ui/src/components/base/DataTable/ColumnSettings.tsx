import { Checkbox, Popover, Space, Typography } from "antd";
import { TableOutlined } from "@ant-design/icons";
import { uiText } from "../../../i18n";
import { BaseButton } from "../BaseButton";
import { columnId } from "./columnPrefs";
import type { DataTableColumn } from "./types";

/**
 * Toolbar control to show or hide columns. The first column (what the row is) and columns marked
 * `required` always stay; the actions column is not listed.
 */
export function ColumnSettings({
  columns,
  hidden,
  onChange,
}: {
  columns: DataTableColumn<any>[];
  hidden: string[];
  onChange: (hidden: string[]) => void;
}) {
  const listed = columns.filter((c) => columnId(c) !== "actions" && !c.hidden);
  const locked = (c: DataTableColumn<any>, index: number) =>
    index === 0 || !!c.required;
  const shownCount = listed.filter((c) => !hidden.includes(columnId(c))).length;
  const content = (
    <div style={{ minWidth: 220 }} data-testid="column-settings-panel">
      <Space orientation="vertical" size={6} style={{ width: "100%" }}>
        {listed.map((column, index) => {
          const id = columnId(column);
          return (
            <Checkbox
              key={id}
              checked={!hidden.includes(id)}
              disabled={locked(column, index)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? hidden.filter((h) => h !== id)
                    : [...hidden, id],
                )
              }
              data-testid={`column-toggle-${id}`}
            >
              {typeof column.title === "function" ? id : column.title}
            </Checkbox>
          );
        })}
      </Space>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 10,
          paddingTop: 8,
          borderTop: "1px solid var(--border-subtle, #E5E7EB)",
        }}
      >
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {uiText("table.columnsShown", {
            shown: shownCount,
            total: listed.length,
          })}
        </Typography.Text>
        <Typography.Link
          disabled={!hidden.length}
          onClick={() => onChange([])}
          style={{ fontSize: 13 }}
        >
          {uiText("table.columnsReset")}
        </Typography.Link>
      </div>
    </div>
  );
  return (
    <Popover
      trigger="click"
      placement="bottomRight"
      title={uiText("table.columns")}
      content={content}
    >
      <BaseButton
        variant="ghost"
        size="small"
        icon={<TableOutlined />}
        aria-label={uiText("table.columns")}
        data-testid="column-settings"
      >
        {uiText("table.columns")}
        {hidden.length ? ` (${shownCount}/${listed.length})` : ""}
      </BaseButton>
    </Popover>
  );
}
