import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Button, Space, Select, Tag } from "antd";
import { DataTable, PageContainer } from "@codecash/ui";
import { formatDateTime } from "@/shared/lib/format";
import {
  actorName,
  contractReference,
  describeAction,
  downloadCsv,
  filterActivity,
  toCsv,
} from "../lib/activityText";
import type {
  ActivityCategory,
  ActivityEntry,
  ActivityFilters,
} from "../types";
import { DateFilter } from "./DateFilter";
const categories: ActivityCategory[] = [
  "SYSTEM",
  "APPROVAL",
  "EVIDENCE",
  "DISPUTE",
  "SIGN",
];
export function ActivityLogView({
  entries,
  defaultRange,
}: {
  entries: ActivityEntry[];
  defaultRange: { from: string; to: string };
}) {
  const { t } = useTranslation("audit");
  const [filters, setFilters] = useState<ActivityFilters>({
    contractCode: "",
    actorId: "",
    category: "",
    from: defaultRange.from,
    to: defaultRange.to,
  });
  const update = (patch: Partial<ActivityFilters>) =>
    setFilters((p) => ({ ...p, ...patch }));
  const visible = useMemo(
    () =>
      filterActivity(entries, filters).sort((a, b) => b.at.localeCompare(a.at)),
    [entries, filters],
  );
  const contracts = [...new Set(entries.map((x) => x.contractCode))];
  const actors = [
    ...new Map(
      entries.map((x) => [
        x.actor.id,
        { value: x.actor.id, label: actorName(t, x) },
      ]),
    ).values(),
  ];
  const columns = [
    {
      key: "at",
      dataIndex: "at",
      title: t("table.columns.time"),
      render: formatDateTime,
    },
    {
      key: "actor",
      title: t("table.columns.actor"),
      render: (_: unknown, e: ActivityEntry) => (
        <>
          {actorName(t, e)}
          <div>{t(`actorRoles.${e.actor.role}`)}</div>
        </>
      ),
    },
    {
      key: "category",
      dataIndex: "category",
      title: t("table.columns.category"),
      render: (c: ActivityCategory) => <Tag>{t(`categories.${c}`)}</Tag>,
    },
    {
      key: "action",
      title: t("table.columns.action"),
      render: (_: unknown, e: ActivityEntry) => describeAction(t, e.action),
    },
    {
      key: "contract",
      title: t("table.columns.contract"),
      render: (_: unknown, e: ActivityEntry) => (
        <Link to={`/contracts/${e.contractCode}`}>
          {contractReference(t, e)}
        </Link>
      ),
    },
  ];
  const exportCsv = () =>
    downloadCsv(
      t("export.fileName"),
      toCsv([
        [
          t("table.columns.time"),
          t("table.columns.actor"),
          t("table.actorRoleColumn"),
          t("table.columns.category"),
          t("table.columns.action"),
          t("table.columns.contract"),
        ],
        ...visible.map((e) => [
          formatDateTime(e.at),
          actorName(t, e),
          t(`actorRoles.${e.actor.role}`),
          t(`categories.${e.category}`),
          describeAction(t, e.action),
          contractReference(t, e),
        ]),
      ]),
    );
  return (
    <PageContainer
      title={t("title")}
      subtitle={t("subtitle")}
      extra={<Button onClick={exportCsv}>{t("export.button")}</Button>}
    >
      <DataTable<ActivityEntry>
        headerContent={
          <Space wrap style={{ marginBottom: 16 }}>
            <Select
              value={filters.contractCode}
              onChange={(contractCode) => update({ contractCode })}
              options={[
                { value: "", label: t("filters.allContracts") },
                ...contracts.map((value) => ({ value, label: value })),
              ]}
            />
            <Select
              value={filters.actorId}
              onChange={(actorId) => update({ actorId })}
              options={[{ value: "", label: t("filters.all") }, ...actors]}
            />
            <Select
              value={filters.category}
              onChange={(category) => update({ category })}
              options={[
                { value: "", label: t("filters.all") },
                ...categories.map((value) => ({
                  value,
                  label: t(`categories.${value}`),
                })),
              ]}
            />
            <DateFilter
              id="log-from"
              label={t("filters.from")}
              value={filters.from}
              max={filters.to}
              onChange={(from) => update({ from })}
            />
            <DateFilter
              id="log-to"
              label={t("filters.to")}
              value={filters.to}
              min={filters.from}
              onChange={(to) => update({ to })}
            />
          </Space>
        }
        dataSource={visible}
        columns={columns}
        rowKey="id"
        searchable={false}
      />
    </PageContainer>
  );
}
