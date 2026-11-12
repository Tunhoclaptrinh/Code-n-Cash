import type { ReactNode } from "react";
import { Pagination, Spin } from "antd";
import { uiText } from "../../../i18n";
import { columnId } from "./columnPrefs";
import type { DataTableColumn } from "./types";

function valueAt(record: Record<string, any>, dataIndex: unknown): unknown {
  if (dataIndex === undefined || dataIndex === null) return undefined;
  const path = Array.isArray(dataIndex) ? dataIndex : [dataIndex];
  return path.reduce<any>((node, part) => node?.[part as string], record);
}

function cell(
  column: DataTableColumn<any>,
  record: Record<string, any>,
  index: number,
): ReactNode {
  const value = valueAt(record, column.dataIndex);
  if (column.render) return column.render(value, record, index) as ReactNode;
  return value === undefined || value === null ? "—" : String(value);
}

/**
 * Narrow-screen form of a table: one card per row. The first column is the card's heading, the
 * others are label and value pairs, the actions column sits at the bottom right. Paging keeps the
 * table's own pagination (server or local).
 */
export function MobileCardList<T extends Record<string, any>>({
  columns,
  data,
  rowKey,
  loading,
  empty,
  pagination,
  onPageChange,
}: {
  columns: DataTableColumn<T>[];
  data: T[];
  rowKey: string | ((record: T) => string | number);
  loading: boolean;
  empty: ReactNode;
  /** Current page, page size and, for server paging, the total; false shows every row. */
  pagination:
    | false
    | {
        current: number;
        pageSize: number;
        total?: number;
        serverTotal: boolean;
      };
  onPageChange: (page: number, pageSize: number) => void;
}) {
  const actions = columns.find((c) => columnId(c) === "actions");
  const [head, ...rest] = columns.filter((c) => columnId(c) !== "actions");
  const keyOf = (record: T, index: number) =>
    typeof rowKey === "function"
      ? rowKey(record)
      : (record[rowKey] ?? record.id ?? index);
  const rows =
    pagination && !pagination.serverTotal
      ? data.slice(
          (pagination.current - 1) * pagination.pageSize,
          pagination.current * pagination.pageSize,
        )
      : data;
  const total = pagination ? (pagination.total ?? data.length) : data.length;
  return (
    <Spin spinning={loading}>
      <div className="cc-mcards" data-testid="mobile-cards">
        {rows.length === 0 ? (
          <div className="cc-mcards-empty">{empty}</div>
        ) : (
          rows.map((record, index) => (
            <article
              key={keyOf(record, index)}
              className="cc-mcard"
              data-testid="mobile-card"
            >
              {head ? (
                <div className="cc-mcard-head">{cell(head, record, index)}</div>
              ) : null}
              <dl className="cc-mcard-fields">
                {rest.map((column) => (
                  <div key={columnId(column)} className="cc-mcard-field">
                    <dt>
                      {typeof column.title === "function"
                        ? columnId(column)
                        : column.title}
                    </dt>
                    <dd>{cell(column, record, index)}</dd>
                  </div>
                ))}
              </dl>
              {actions ? (
                <div className="cc-mcard-actions">
                  {cell(actions, record, index)}
                </div>
              ) : null}
            </article>
          ))
        )}
        {pagination && total > pagination.pageSize ? (
          <Pagination
            size="small"
            simple
            current={pagination.current}
            pageSize={pagination.pageSize}
            total={total}
            onChange={onPageChange}
            showTotal={(count) => uiText("table.totalRecords", { count })}
            style={{ marginTop: 12, textAlign: "center" }}
          />
        ) : null}
      </div>
    </Spin>
  );
}
