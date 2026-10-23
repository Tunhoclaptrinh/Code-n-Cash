import { Descriptions, Table, Tag, Typography } from "antd";
import { useTranslation } from "react-i18next";

/** Reusable view of the sealed transaction metadata and redacted before/after values. */
export function AuditDetails({ entry }: { entry: Record<string, unknown> }) {
  const { t } = useTranslation("audit");
  const changes = (entry.changes ?? []) as Array<{
    resource: string;
    recordId: string;
    operation: string;
    fields: Record<string, { before: unknown; after: unknown }>;
  }>;
  const rows = changes.flatMap((change, index) =>
    Object.entries(change.fields).map(([field, value]) => ({
      key: `${index}:${field}`,
      resource: change.resource,
      recordId: change.recordId,
      operation: change.operation,
      field,
      ...value,
    })),
  );
  const show = (value: unknown) =>
    value === null || value === undefined
      ? "—"
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  const cell = (value: unknown) => (
    <Typography.Text
      style={{
        display: "block",
        maxWidth: 400,
        overflowWrap: "anywhere",
        whiteSpace: "pre-wrap",
      }}
    >
      {show(value)}
    </Typography.Text>
  );
  return (
    <>
      <Descriptions
        column={1}
        size="small"
        items={[
          "transactionId",
          "requestId",
          "seq",
          "hash",
          "outcome",
          "errorCode",
        ]
          .filter((key) => entry[key] !== undefined)
          .map((key) => ({
            key,
            label: t(`auditDetail.${key}`),
            children: (
              <Typography.Text copyable style={{ overflowWrap: "anywhere" }}>
                {show(entry[key])}
              </Typography.Text>
            ),
          }))}
      />
      <Table
        size="small"
        pagination={{ pageSize: 10 }}
        dataSource={rows}
        scroll={{ x: 850 }}
        columns={[
          {
            title: t("auditDetail.record"),
            render: (_, row) => (
              <>
                <Tag>{row.operation}</Tag>
                {row.resource} · {row.recordId}
              </>
            ),
          },
          { title: t("auditDetail.field"), dataIndex: "field" },
          { title: t("auditDetail.before"), dataIndex: "before", render: cell },
          { title: t("auditDetail.after"), dataIndex: "after", render: cell },
        ]}
        locale={{ emptyText: t("auditDetail.noChanges") }}
      />
    </>
  );
}
