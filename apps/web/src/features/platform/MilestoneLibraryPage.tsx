import { useMemo } from "react";
import { Alert, Space, Table, Tag, Typography } from "antd";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { DataTable, PageContainer } from "@codecash/ui";
import type { ListSpec, MilestoneLibraryVersion } from "@codecash/contracts";
import { trustApi } from "@/shared/api/trust";
import { useCurrentUser } from "@/shared/auth/session";
import { AppPage } from "@/shared/layout/AppPage";
import { formatDateTime } from "@/shared/lib/format";
import { localList, useListQuery } from "@/shared/lib/useListQuery";
import { STAT_TONE } from "@/shared/ui/statTone";
import { TrackingCode } from "@/shared/ui/TechnicalInfo";

type Row = MilestoneLibraryVersion & { key: string; milestoneType: string };

const spec: ListSpec<Row> = {
  fields: {
    milestoneType: {
      value: (row) => row.milestoneType,
      sort: true,
      filter: "eq",
      facet: true,
    },
    number: { value: (row) => row.number, sort: true },
    contracts: { value: (row) => row.contracts, sort: true },
    origin: {
      value: (row) => (row.firstSeen.ruleVersionId ? "VERSION" : "DATA_PACK"),
      filter: "eq",
      facet: true,
    },
  },
  search: (row) => [
    row.milestoneType,
    row.requiredEvents.join(" "),
    row.firstSeen.ruleVersionName ?? "",
    ...row.usedBy.map((use) => use.workflowName ?? use.workflowTemplate),
  ],
  defaultSort: { by: "milestoneType", order: "asc" },
};

/**
 * The milestone library (idea from Contract Smart): each milestone type with every definition it
 * has had (documents, penalty, approval and rules), where each is used and how many contracts are
 * evaluated under it. Read-only: a new definition comes from a rule version, which is previewed,
 * proven safe and published by a second person; contracts keep the version they pinned.
 */
export default function MilestoneLibraryPage() {
  const { t } = useTranslation("trust");
  const { t: td } = useTranslation("domain");
  const { t: tp } = useTranslation("platform");
  const user = useCurrentUser();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["milestone-library", user.id],
    queryFn: trustApi.milestoneLibrary,
  });
  const rows = useMemo<Row[]>(
    () =>
      (query.data ?? []).flatMap((entry) =>
        entry.versions.map((version) => ({
          ...version,
          key: `${entry.milestoneType}-${version.number}`,
          milestoneType: entry.milestoneType,
        })),
      ),
    [query.data],
  );
  const fetch = useMemo(() => localList(rows, spec), [rows]);
  const list = useListQuery<Row>({
    syncUrl: true,
    key: ["milestone-library-list", user.id, query.dataUpdatedAt],
    fetch,
    sort: spec.defaultSort,
  });
  const fromVersions = rows.filter((row) => row.firstSeen.ruleVersionId);
  const tiles = [
    {
      title: t("library.stats.types"),
      value: query.data?.length ?? 0,
      tone: STAT_TONE.blue,
    },
    {
      title: t("library.stats.versions"),
      value: rows.length,
      tone: STAT_TONE.indigo,
    },
    {
      title: t("library.stats.fromVersions"),
      value: fromVersions.length,
      tone: STAT_TONE.amber,
      filter: "VERSION",
    },
  ];
  return (
    <AppPage
      active="platform"
      guide="admin"
      breadcrumb={[{ label: tp("libraryTitle") }]}
    >
      <PageContainer>
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          title={t("library.notice")}
        />
        <DataTable<Row>
          mobileCards
          columnSettings={{ storageKey: "milestone-library" }}
          hideCard
          rowKey="key"
          emptyText={t("library.empty")}
          {...list.table}
          loading={query.isFetching || list.table.loading}
          onRefresh={() =>
            void client.invalidateQueries({ queryKey: ["milestone-library"] })
          }
          searchPlaceholder={t("library.search")}
          statisticsData={tiles.map((tile) => ({
            colSpan: { xs: 12, sm: 8, md: 8 },
            title: tile.title,
            value: tile.value,
            backgroundColor: tile.tone.bg,
            valueColor: tile.tone.value,
            ...(tile.filter
              ? {
                  selected: list.filters.origin?.[0] === tile.filter,
                  onClick: () =>
                    list.setFilter(
                      "origin",
                      list.filters.origin?.[0] === tile.filter
                        ? undefined
                        : [tile.filter],
                    ),
                }
              : {}),
          }))}
          columns={[
            {
              key: "milestoneType",
              dataIndex: "milestoneType",
              title: t("library.columns.milestone"),
              sorter: true,
              render: (_: unknown, row: Row) => (
                <Space orientation="vertical" size={0}>
                  <b>{td(`milestoneType.${row.milestoneType}`)}</b>
                  <TrackingCode code={row.milestoneType} />
                </Space>
              ),
            },
            {
              key: "number",
              dataIndex: "number",
              title: t("library.columns.version"),
              sorter: true,
              width: 100,
              render: (_: unknown, row: Row) => (
                <Tag color={row.firstSeen.ruleVersionId ? "gold" : "blue"}>
                  {t("library.versionNo", { n: row.number })}
                </Tag>
              ),
            },
            {
              key: "documents",
              title: t("library.columns.documents"),
              render: (_: unknown, row: Row) => (
                <Space size={[4, 4]} wrap>
                  {row.requiredEvents.map((type) => (
                    <Tag key={type}>{td(`eventType.${type}`)}</Tag>
                  ))}
                </Space>
              ),
            },
            {
              key: "terms",
              title: t("library.columns.terms"),
              render: (_: unknown, row: Row) => (
                <Space size={[4, 4]} wrap>
                  <Tag color={row.latePenalty ? "orange" : undefined}>
                    {t(
                      row.latePenalty ? "library.penalty" : "library.noPenalty",
                    )}
                  </Tag>
                  <Tag>{t(`library.approval.${row.approval}`)}</Tag>
                  <Tag>
                    {t("library.ruleCount", { count: row.rules.length })}
                  </Tag>
                </Space>
              ),
            },
            {
              key: "firstSeen",
              title: t("library.columns.firstSeen"),
              render: (_: unknown, row: Row) =>
                row.firstSeen.ruleVersionId ? (
                  <Space orientation="vertical" size={0}>
                    <span>{row.firstSeen.ruleVersionName}</span>
                    {row.firstSeen.at ? (
                      <Typography.Text type="secondary">
                        {formatDateTime(row.firstSeen.at)}
                      </Typography.Text>
                    ) : null}
                  </Space>
                ) : (
                  t("library.dataPack")
                ),
            },
            {
              key: "changes",
              title: t("library.columns.changes"),
              render: (_: unknown, row: Row) =>
                row.changes.length ? (
                  <Space size={[4, 4]} wrap>
                    <Typography.Text type="secondary">
                      {t("library.basedOn", { n: row.basedOn })}
                    </Typography.Text>
                    {row.changes.map((change) => (
                      <Tag key={change} color="purple">
                        {t(`library.changes.${change}`)}
                      </Tag>
                    ))}
                  </Space>
                ) : (
                  "—"
                ),
            },
            {
              key: "contracts",
              dataIndex: "contracts",
              title: t("library.columns.contracts"),
              sorter: true,
              width: 110,
              align: "right" as const,
            },
          ]}
          expandable={{
            expandedRowRender: (row: Row) => (
              <Space orientation="vertical" size={12} style={{ width: "100%" }}>
                <div>
                  <Typography.Text strong>
                    {t("library.usedBy")}
                  </Typography.Text>
                  <ul style={{ margin: "4px 0 0", paddingLeft: 20 }}>
                    {row.usedBy.map((use, index) => (
                      <li key={index}>
                        {use.ruleVersionName ?? t("library.dataPack")}
                        {" · "}
                        {use.workflowName ?? use.workflowTemplate}
                        {" · "}
                        {t("library.stage", { n: use.sequence })}
                        {use.status !== "DATA_PACK" ? (
                          <Tag style={{ marginLeft: 8 }}>
                            {t(`rules.states.${use.status}`)}
                          </Tag>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
                <Table
                  size="small"
                  pagination={false}
                  rowKey={(rule) => rule.rule_id}
                  dataSource={row.rules}
                  scroll={{ x: 760 }}
                  columns={[
                    {
                      key: "priority",
                      dataIndex: "priority",
                      title: t("library.rules.priority"),
                      width: 80,
                    },
                    {
                      key: "name",
                      dataIndex: "rule_name",
                      title: t("library.rules.name"),
                    },
                    {
                      key: "condition",
                      title: t("library.rules.condition"),
                      render: (_: unknown, rule: Record<string, string>) => (
                        <Typography.Text code>
                          {rule.condition_expression}
                        </Typography.Text>
                      ),
                    },
                    {
                      key: "decision",
                      title: t("library.rules.decision"),
                      render: (_: unknown, rule: Record<string, string>) =>
                        td(`decision.${rule.decision}`, {
                          defaultValue: rule.decision,
                        }),
                    },
                  ]}
                />
              </Space>
            ),
          }}
        />
      </PageContainer>
    </AppPage>
  );
}
