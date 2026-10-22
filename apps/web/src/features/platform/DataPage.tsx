import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Alert,
  App as AntApp,
  Collapse,
  Descriptions,
  Dropdown,
  Space,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import {
  CheckCircleOutlined,
  DownloadOutlined,
  EyeOutlined,
  InfoCircleOutlined,
  PlayCircleOutlined,
} from "@ant-design/icons";
import {
  BaseButton,
  BaseCard,
  DataTable,
  DetailModal,
  IconButton,
  PageContainer,
  downloadBlob,
  exportToCSV,
  exportToJSON,
  useAccess,
  useFilters,
  usePagination,
  type FilterConfig,
  type StatisticsItem,
} from "@codecash/ui";
import { AppPage } from "@/shared/layout/AppPage";
import { useCurrentUser } from "@/shared/auth/session";
import { formatDecimalString } from "@/shared/lib/format";
import { columnSearch } from "@/shared/ui/columnSearch";
import {
  OUTPUT_FILES,
  downloadDatasetFile,
  evaluateDataPack,
  evaluateDataset,
  getDatasetResult,
  getDecisions,
  listDatasets,
  type Decision,
  type EngineRow as Row,
  type EvaluationSummary,
  type OutputFile,
  type Trace,
} from "./api/engine.api";
import { DATA_PACK, DatasetPanel } from "./components/DatasetPanel";

const DECISIONS: Decision[] = ["RELEASE", "PENALTY", "HOLD", "REJECT"];
const decisionColor: Record<
  Decision,
  { tag: string; bg: string; value: string }
> = {
  RELEASE: { tag: "success", bg: "rgba(16, 185, 129, 0.08)", value: "#10B981" },
  PENALTY: { tag: "orange", bg: "rgba(249, 115, 22, 0.08)", value: "#F97316" },
  HOLD: { tag: "warning", bg: "rgba(245, 158, 11, 0.08)", value: "#F59E0B" },
  REJECT: { tag: "error", bg: "rgba(239, 68, 68, 0.08)", value: "#EF4444" },
};
type Filters = {
  milestone_type?: string;
  reason_code?: string;
  contract_id?: string;
};

export default function DataPage() {
  const { t } = useTranslation("platform");
  const user = useCurrentUser();
  const { message } = AntApp.useApp();
  const { hasPermission } = useAccess(user);
  const cache = useQueryClient();
  const [source, setSource] = useState(DATA_PACK);
  const [tab, setTab] = useState<Decision | "ALL">("ALL");
  const [traceRow, setTraceRow] = useState<Row>();
  const { filters, updateFilter, clearFilters } = useFilters<Filters>({});
  const { page, pageSize, goToPage, handleTableChange } = usePagination(1, 10);
  const canManage = hasPermission("engine:datasets");
  const datasets = useQuery({
    queryKey: ["engine", "datasets", user.id],
    queryFn: listDatasets,
    enabled: canManage,
  });
  const dataset = datasets.data?.find((d) => d.id === source);
  const official = source === DATA_PACK;
  const result = useQuery({
    queryKey: ["engine", "result", user.id, source],
    queryFn: () => (official ? getDecisions() : getDatasetResult(source)),
    enabled: official || !!dataset?.lastRun,
  });
  const evaluate = useMutation({
    mutationFn: () => (official ? evaluateDataPack() : evaluateDataset(source)),
    onSuccess: async (data) => {
      cache.setQueryData(["engine", "result", user.id, source], data);
      if (!official) await datasets.refetch();
    },
  });
  const canEvaluate = official
    ? hasPermission("engine:evaluate")
    : canManage && !!dataset?.report.ok;
  const summary = result.data?.summary;
  const changeSource = (next: string) => {
    setSource(next);
    setTab("ALL");
    clearFilters();
    goToPage(1);
    evaluate.reset();
  };
  const download = async (file: OutputFile) => {
    if (!result.data) return;
    if (!official) {
      try {
        downloadBlob(await downloadDatasetFile(source, file), file);
      } catch (error) {
        message.error(error instanceof Error ? error.message : String(error));
      }
    } else if (file === "submission_output.csv")
      exportToCSV(result.data.rows, file);
    else
      exportToJSON(
        file === "audit.json" ? result.data.traces : result.data.summary,
        file,
      );
  };
  const allRows = useMemo(() => result.data?.rows ?? [], [result.data]);
  const rows = useMemo(
    () =>
      allRows.filter(
        (row) =>
          (tab === "ALL" || row.predicted_decision === tab) &&
          (Object.keys(filters) as (keyof Filters)[]).every(
            (key) => !filters[key] || row[key] === filters[key],
          ),
      ),
    [allRows, tab, filters],
  );
  const trace = traceRow
    ? result.data?.traces.find((x) => x.id === traceRow.audit_trace_id)
    : undefined;
  const money = (value: string) => (
    <span style={{ fontVariantNumeric: "tabular-nums" }}>
      {formatDecimalString(value)}
    </span>
  );
  const distinct = (key: string) =>
    [...new Set(allRows.map((row) => row[key]))]
      .sort()
      .map((value) => ({ value, label: value }));

  const changeTab = (key: string) => {
    setTab(key as Decision | "ALL");
    goToPage(1);
  };
  const statistics: StatisticsItem[] = DECISIONS.map((key) => ({
    title: (
      <Tooltip title={t(`data.decisionHint.${key}`)}>
        <span>{key}</span>
      </Tooltip>
    ),
    value: summary?.decisions[key] ?? 0,
    backgroundColor: decisionColor[key].bg,
    valueColor: decisionColor[key].value,
    selected: tab === key,
    onClick: () => changeTab(tab === key ? "ALL" : key),
  }));
  const filterConfig: FilterConfig[] = [
    {
      key: "milestone_type",
      label: t("data.columns.milestone_type"),
      type: "select",
      options: distinct("milestone_type"),
    },
    {
      key: "reason_code",
      label: t("data.columns.reason_code"),
      type: "select",
      options: distinct("reason_code"),
    },
    {
      key: "contract_id",
      label: t("data.columns.contract_id"),
      type: "select",
      options: distinct("contract_id"),
    },
  ];

  const columns = [
    {
      key: "contract_id",
      dataIndex: "contract_id",
      width: 140,
      title: t("data.columns.contract_id"),
      sorter: (a: Row, b: Row) => a.contract_id.localeCompare(b.contract_id),
      ...columnSearch<Row>((row) => row.contract_id),
      render: (value: string) => (
        <Typography.Text strong>{value}</Typography.Text>
      ),
    },
    {
      key: "milestone_id",
      dataIndex: "milestone_id",
      width: 140,
      title: t("data.columns.milestone_id"),
      sorter: (a: Row, b: Row) => a.milestone_id.localeCompare(b.milestone_id),
      ...columnSearch<Row>((row) => row.milestone_id),
    },
    {
      key: "milestone_type",
      dataIndex: "milestone_type",
      width: 170,
      title: t("data.columns.milestone_type"),
      filters: distinct("milestone_type").map(({ value }) => ({
        text: value,
        value,
      })),
      filterSearch: true,
      onFilter: (value: unknown, row: Row) => row.milestone_type === value,
    },
    {
      key: "predicted_decision",
      dataIndex: "predicted_decision",
      width: 150,
      title: t("data.columns.predicted_decision"),
      filters: DECISIONS.map((value) => ({ text: value, value })),
      onFilter: (value: unknown, row: Row) => row.predicted_decision === value,
      render: (value: Decision) => (
        <Tooltip title={t(`data.decisionHint.${value}`)}>
          <Tag color={decisionColor[value].tag}>{value}</Tag>
        </Tooltip>
      ),
    },
    {
      key: "payable_amount_vnd_mn",
      dataIndex: "payable_amount_vnd_mn",
      width: 170,
      title: t("data.columns.payable_amount_vnd_mn"),
      align: "right" as const,
      render: money,
    },
    {
      key: "penalty_amount_vnd_mn",
      dataIndex: "penalty_amount_vnd_mn",
      width: 160,
      title: t("data.columns.penalty_amount_vnd_mn"),
      align: "right" as const,
      render: money,
    },
    {
      key: "reason_code",
      dataIndex: "reason_code",
      width: 230,
      title: t("data.columns.reason_code"),
      filters: distinct("reason_code").map(({ value }) => ({
        text: value,
        value,
      })),
      filterSearch: true,
      onFilter: (value: unknown, row: Row) => row.reason_code === value,
      render: (value: string) => (
        <Typography.Text code style={{ whiteSpace: "nowrap" }}>
          {value}
        </Typography.Text>
      ),
    },
  ];

  return (
    <AppPage active="data" breadcrumb={[{ label: t("data.title") }]}>
      <PageContainer
        title={t("data.title")}
        subtitle={
          summary
            ? t(dataset ? "data.subtitleDataset" : "data.subtitle", {
                name: dataset?.name,
                milestones: summary.milestones,
                contracts: summary.contracts,
              })
            : undefined
        }
        extra={
          <Space wrap>
            <BaseButton
              variant="primary"
              icon={<PlayCircleOutlined />}
              loading={evaluate.isPending}
              disabled={!canEvaluate}
              tooltip={canEvaluate ? undefined : t("data.evaluateForbidden")}
              onClick={() => evaluate.mutate()}
              data-testid="data-evaluate"
            >
              {t("data.evaluate")}
            </BaseButton>
            <Dropdown
              disabled={!result.data}
              trigger={["click"]}
              menu={{
                items: OUTPUT_FILES.map((file) => ({
                  key: file,
                  icon: <DownloadOutlined />,
                  label: t(`data.downloadItems.${file}`),
                  onClick: () => void download(file),
                })),
              }}
            >
              <BaseButton
                variant="secondary"
                icon={<DownloadOutlined />}
                disabled={!result.data}
                data-testid="data-download"
              >
                {t("data.download")}
              </BaseButton>
            </Dropdown>
          </Space>
        }
      >
        {canManage ? (
          <DatasetPanel
            source={source}
            datasets={datasets.data ?? []}
            loading={datasets.isPending}
            canManage={canManage}
            onSourceChange={changeSource}
            onChanged={() => datasets.refetch()}
          />
        ) : null}
        {evaluate.isError ? (
          <Alert type="error" showIcon title={evaluate.error.message} />
        ) : null}
        {result.isError ? (
          <Alert type="error" showIcon title={result.error.message} />
        ) : null}
        {dataset?.report.ok && !dataset.lastRun && !evaluate.isPending ? (
          <Alert type="info" showIcon title={t("data.source.runFirst")} />
        ) : null}
        {summary?.source?.kind === "dataset" ? (
          <SourceNotes summary={summary} />
        ) : null}
        {summary ? (
          <BaseCard bodyStyle={{ padding: 0 }}>
            <Descriptions
              bordered
              size="small"
              layout="vertical"
              column={{ xs: 1, sm: 2, lg: 5 }}
              items={[
                {
                  key: "payable",
                  label: t("data.summary.payable"),
                  children: money(summary.payableMillion),
                },
                {
                  key: "penalty",
                  label: t("data.summary.penalty"),
                  children: money(summary.penaltyMillion),
                },
                {
                  key: "sample",
                  label: (
                    <Space size={4}>
                      {t("data.summary.sample")}
                      <Tooltip
                        title={t("data.summary.sampleHint", {
                          total: summary.sampleTotal,
                          milestones: summary.milestones,
                        })}
                      >
                        <InfoCircleOutlined />
                      </Tooltip>
                    </Space>
                  ),
                  children: summary.sampleTotal ? (
                    `${summary.sampleMatched}/${summary.sampleTotal}`
                  ) : (
                    <Typography.Text type="secondary">
                      {t("data.summary.noLabels")}
                    </Typography.Text>
                  ),
                },
                {
                  key: "invariants",
                  label: t("data.summary.invariants"),
                  children: summary.invariantViolations.length ? (
                    <Tooltip
                      title={summary.invariantViolations
                        .slice(0, 10)
                        .join("; ")}
                    >
                      <Tag color="error">
                        {t("data.summary.invariantsBroken", {
                          count: summary.invariantViolations.length,
                        })}
                      </Tag>
                    </Tooltip>
                  ) : (
                    <Tag color="success" icon={<CheckCircleOutlined />}>
                      {t("data.summary.invariantsOk")}
                    </Tag>
                  ),
                },
                {
                  key: "run",
                  label: t("data.summary.run"),
                  children: (
                    <Typography.Text code copyable>
                      {result.data?.runId}
                    </Typography.Text>
                  ),
                },
              ]}
            />
          </BaseCard>
        ) : null}
        <DataTable<Row>
          rowKey="milestone_id"
          columns={columns}
          dataSource={rows}
          loading={result.isPending || evaluate.isPending}
          statisticsData={statistics}
          tabs={[
            { key: "ALL", label: t("data.allDecisions") },
            ...DECISIONS.map((key) => ({ key, label: key })),
          ]}
          activeTab={tab}
          onTabChange={changeTab}
          searchFields={["contract_id", "milestone_id", "reason_code"]}
          filters={filterConfig}
          filterValues={filters}
          onFilterChange={(key, value) => {
            updateFilter(key as keyof Filters, value || undefined);
            goToPage(1);
          }}
          onClearFilters={clearFilters}
          onRefresh={() => void result.refetch()}
          pagination={{ current: page, pageSize }}
          onPaginationChange={handleTableChange}
          exportable
          exportFilename="data-pack-results"
          onView={(row) => setTraceRow(row)}
          customActions={(row) => (
            <IconButton
              icon={<EyeOutlined />}
              tooltip={t("data.trace")}
              onClick={() => setTraceRow(row)}
            />
          )}
        />
      </PageContainer>
      <DetailModal
        open={!!traceRow}
        width={760}
        title={
          traceRow
            ? `${t("data.trace")} · ${traceRow.contract_id} · ${traceRow.milestone_id}`
            : undefined
        }
        record={traceRow}
        onClose={() => setTraceRow(undefined)}
        items={trace ? traceItems(t, trace) : []}
      >
        {trace ? (
          <Collapse
            style={{ marginTop: 16 }}
            items={[
              {
                key: "raw",
                label: t("data.traceFields.raw"),
                children: (
                  <pre
                    style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 12 }}
                  >
                    {JSON.stringify(trace, null, 2)}
                  </pre>
                ),
              },
            ]}
          />
        ) : null}
      </DetailModal>
    </AppPage>
  );
}

/** What the engine did with an uploaded dataset: generated template, scope file. */
function SourceNotes({ summary }: { summary: EvaluationSummary }) {
  const { t } = useTranslation("platform");
  const source = summary.source!;
  const unknown = source.unknownScopeIds ?? [];
  return (
    <Space direction="vertical" size={8} style={{ width: "100%" }}>
      {source.generatedTemplate ? (
        <Alert type="info" showIcon title={t("data.source.templateHint")} />
      ) : null}
      {source.scopeRows ? (
        <Alert
          type="info"
          showIcon
          title={t("data.source.scopeHint", { count: source.scopeRows })}
        />
      ) : null}
      {unknown.length ? (
        <Alert
          type="warning"
          showIcon
          title={t("data.source.unknownScope", {
            count: unknown.length,
            ids: unknown.slice(0, 10).join(", "),
          })}
        />
      ) : null}
    </Space>
  );
}

function traceItems(t: (key: string) => string, trace: Trace) {
  const r = trace.result;
  const list = (value: unknown) =>
    Array.isArray(value) && value.length ? value.join(", ") : "—";
  const decision = r.decision as Decision;
  return [
    {
      key: "decision",
      label: t("data.traceFields.decision"),
      value: <Tag color={decisionColor[decision].tag}>{decision}</Tag>,
    },
    {
      key: "reason",
      label: t("data.traceFields.reason"),
      value: <Typography.Text code>{String(r.reason_code)}</Typography.Text>,
    },
    {
      key: "rule",
      label: t("data.traceFields.rule"),
      value: String(r.rule_id ?? "—"),
    },
    {
      key: "payable",
      label: t("data.traceFields.payable"),
      value: formatDecimalString(String(r.payable)),
    },
    {
      key: "penalty",
      label: t("data.traceFields.penalty"),
      value: formatDecimalString(String(r.penalty)),
    },
    {
      key: "evidence",
      label: t("data.traceFields.evidence"),
      value: list(r.evidence),
    },
    {
      key: "missing",
      label: t("data.traceFields.missing"),
      value: list(r.missing),
      span: 2,
    },
  ];
}
