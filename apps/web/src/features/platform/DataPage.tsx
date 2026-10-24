import { TableRowActions } from "@/shared/ui/TableRowActions";
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
  PageContainer,
  downloadBlob,
  exportToCSV,
  exportToJSON,
  useAccess,
  type FilterConfig,
  type StatisticsItem,
} from "@codecash/ui";
import { platform } from "@/shared/api/platform";
import { AppPage } from "@/shared/layout/AppPage";
import { useCurrentUser } from "@/shared/auth/session";
import type { ListSpec } from "@codecash/contracts";
import { formatDecimalString } from "@/shared/lib/format";
import { localList, useListQuery } from "@/shared/lib/useListQuery";
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
  type Kpi,
  type OutputFile,
  type Share,
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
/** The engine output is one document: it is searched, filtered and paged in the browser. */
const ROWS: ListSpec<Row> = {
  fields: {
    contract_id: {
      value: (r) => r.contract_id,
      filter: "eq",
      sort: true,
      facet: true,
    },
    milestone_id: {
      value: (r) => r.milestone_id,
      filter: "contains",
      sort: true,
    },
    milestone_type: {
      value: (r) => r.milestone_type,
      filter: "eq",
      facet: true,
    },
    predicted_decision: {
      value: (r) => r.predicted_decision,
      filter: "eq",
      facet: true,
    },
    // Decimal strings compare in numeric collation: no conversion to floating point.
    payable_amount_vnd_mn: {
      value: (r) => r.payable_amount_vnd_mn,
      sort: true,
    },
    penalty_amount_vnd_mn: {
      value: (r) => r.penalty_amount_vnd_mn,
      sort: true,
    },
    reason_code: { value: (r) => r.reason_code, filter: "eq", facet: true },
  },
  search: (r) => [
    r.contract_id,
    r.milestone_id,
    r.milestone_type,
    r.reason_code,
  ],
  defaultSort: { by: "milestone_id", order: "asc" },
};

export default function DataPage() {
  const { t } = useTranslation("platform");
  const user = useCurrentUser();
  const { message } = AntApp.useApp();
  const { hasPermission } = useAccess(user);
  const cache = useQueryClient();
  const [source, setSource] = useState(DATA_PACK);
  const [traceRow, setTraceRow] = useState<Row>();
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
    } else {
      try {
        await platform.post("/exports", {
          source: "engine",
          count: result.data.rows.length,
          format: file.endsWith(".csv") ? "csv" : "json",
          scope: "all",
          columns: [file],
        });
      } catch {
        void message.error(t("error"));
        return;
      }
      if (file === "submission_output.csv") exportToCSV(result.data.rows, file);
      else
        exportToJSON(
          file === "audit.json" ? result.data.traces : result.data.summary,
          file,
        );
    }
  };
  const allRows = useMemo(() => result.data?.rows ?? [], [result.data]);
  const list = useListQuery<Row>({
    // A new run or another source is another document: the key changes with it.
    auditExport: "engine",
    key: [
      "engine",
      "table",
      user.id,
      source,
      result.data?.runId ?? "",
      result.dataUpdatedAt,
    ],
    fetch: localList(allRows, ROWS),
    sort: ROWS.defaultSort,
  });
  const { filters, setFilter } = list;
  const facets = list.data?.facets ?? {};
  const tab =
    filters.predicted_decision?.length === 1
      ? String(filters.predicted_decision[0])
      : "ALL";
  const trace = traceRow
    ? result.data?.traces.find((x) => x.id === traceRow.audit_trace_id)
    : undefined;
  const money = (value: string) => (
    <span style={{ fontVariantNumeric: "tabular-nums" }}>
      {formatDecimalString(value)}
    </span>
  );
  const distinct = (key: string) =>
    (facets[key] ?? []).map((f) => ({ value: f.value, label: f.value }));

  const changeTab = (key: string) =>
    setFilter("predicted_decision", key === "ALL" ? undefined : [key]);
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
      operators: ["eq"],
      options: distinct("milestone_type"),
    },
    {
      key: "reason_code",
      label: t("data.columns.reason_code"),
      type: "select",
      operators: ["eq"],
      options: distinct("reason_code"),
    },
    {
      key: "contract_id",
      label: t("data.columns.contract_id"),
      type: "select",
      operators: ["eq"],
      options: distinct("contract_id"),
    },
  ];

  const columns = [
    {
      ...list.column("contract_id"),
      dataIndex: "contract_id",
      width: 140,
      title: t("data.columns.contract_id"),
      sorter: true,
      filters: distinct("contract_id").map(({ value }) => ({
        text: value,
        value,
      })),
      filterMultiple: false,
      filterSearch: true,
      render: (value: string) => (
        <Typography.Text strong>{value}</Typography.Text>
      ),
    },
    {
      ...list.column("milestone_id"),
      dataIndex: "milestone_id",
      width: 140,
      title: t("data.columns.milestone_id"),
      sorter: true,
      ...columnSearch(),
    },
    {
      ...list.column("milestone_type"),
      dataIndex: "milestone_type",
      width: 170,
      title: t("data.columns.milestone_type"),
      filters: distinct("milestone_type").map(({ value }) => ({
        text: value,
        value,
      })),
      filterMultiple: false,
      filterSearch: true,
    },
    {
      ...list.column("predicted_decision"),
      dataIndex: "predicted_decision",
      width: 150,
      title: t("data.columns.predicted_decision"),
      filters: DECISIONS.map((value) => ({ text: value, value })),
      filterMultiple: false,
      render: (value: Decision) => (
        <Tooltip title={t(`data.decisionHint.${value}`)}>
          <Tag color={decisionColor[value].tag}>{value}</Tag>
        </Tooltip>
      ),
    },
    {
      ...list.column("payable_amount_vnd_mn"),
      dataIndex: "payable_amount_vnd_mn",
      width: 170,
      title: t("data.columns.payable_amount_vnd_mn"),
      align: "right" as const,
      sorter: true,
      render: money,
    },
    {
      ...list.column("penalty_amount_vnd_mn"),
      dataIndex: "penalty_amount_vnd_mn",
      width: 160,
      title: t("data.columns.penalty_amount_vnd_mn"),
      align: "right" as const,
      sorter: true,
      render: money,
    },
    {
      ...list.column("reason_code"),
      dataIndex: "reason_code",
      width: 230,
      title: t("data.columns.reason_code"),
      filters: distinct("reason_code").map(({ value }) => ({
        text: value,
        value,
      })),
      filterMultiple: false,
      filterSearch: true,
      render: (value: string) => (
        <Typography.Text code style={{ whiteSpace: "nowrap" }}>
          {value}
        </Typography.Text>
      ),
    },
  ];

  return (
    <AppPage
      guide="data"
      active="data"
      breadcrumb={[{ label: t("data.title") }]}
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
      <PageContainer>
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
                    <Space wrap size={4}>
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
        {summary?.kpi ? <KpiCard summary={summary} kpi={summary.kpi} /> : null}
        <DataTable<Row>
          rowKey="milestone_id"
          columns={columns}
          {...list.table}
          loading={list.table.loading || result.isPending || evaluate.isPending}
          onRefresh={() => void result.refetch()}
          statisticsData={statistics}
          tabs={[
            { key: "ALL", label: t("data.allDecisions") },
            ...DECISIONS.map((key) => ({ key, label: key })),
          ]}
          activeTab={tab}
          onTabChange={changeTab}
          searchPlaceholder={t("data.searchPlaceholder")}
          filters={filterConfig}
          exportable
          exportFilename="data-pack-results"
          onExport={(options) =>
            void list.exporter(
              columns,
              Object.fromEntries(
                columns.map((c) => [
                  String(c.key),
                  (r: Row) => r[String(c.key)],
                ]),
              ),
              "data-pack-results",
            )(options)
          }
          onView={(row) => setTraceRow(row)}
          actionsWidth={72}
          customActions={(row) => (
            <TableRowActions
              primary={{
                label: t("data.trace"),
                icon: <EyeOutlined />,
                onClick: () => setTraceRow(row),
              }}
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

/** KPIs of spec section 15 as the engine measured them, each with the set it was measured on. */
function KpiCard({ summary, kpi }: { summary: EvaluationSummary; kpi: Kpi }) {
  const { t } = useTranslation("platform");
  const ratio = (share: Share | null) =>
    share ? (
      `${share.count}/${share.total}`
    ) : (
      <Typography.Text type="secondary">
        {t("data.summary.noLabels")}
      </Typography.Text>
    );
  const label = (key: string) => (
    <Space wrap size={4}>
      {t(`data.kpi.${key}`)}
      <Tooltip title={t(`data.kpi.hint.${key}`)}>
        <InfoCircleOutlined />
      </Tooltip>
    </Space>
  );
  const processing = kpi.processing;
  return (
    <BaseCard
      title={t("data.kpi.title")}
      subtitle={t("data.kpi.subtitle", {
        labelled: kpi.labelled,
        milestones: summary.milestones,
      })}
      bodyStyle={{ padding: 0 }}
    >
      <Descriptions
        bordered
        size="small"
        layout="vertical"
        column={{ xs: 1, sm: 2, lg: 4 }}
        items={[
          {
            key: "decisionAccuracy",
            label: label("decisionAccuracy"),
            children: ratio(kpi.decisionAccuracy),
          },
          {
            key: "macroF1",
            label: label("macroF1"),
            children: kpi.macroF1 ?? ratio(null),
          },
          {
            key: "unauthorizedPayment",
            label: label("unauthorizedPayment"),
            children: ratio(kpi.unauthorizedPayment),
          },
          {
            key: "overHold",
            label: label("overHold"),
            children: ratio(kpi.overHold),
          },
          {
            key: "amountAccuracy",
            label: label("amountAccuracy"),
            children: kpi.amountAccuracy
              ? t("data.kpi.amountValue", {
                  ratio: `${kpi.amountAccuracy.count}/${kpi.amountAccuracy.total}`,
                  error: formatDecimalString(kpi.amountAccuracy.maxAbsError),
                })
              : ratio(null),
          },
          {
            key: "coverage",
            label: label("coverage"),
            children: ratio(kpi.coverage),
          },
          {
            key: "traceability",
            label: label("traceability"),
            children: ratio(kpi.traceability),
          },
          {
            key: "processing",
            label: label("processing"),
            children: (
              <Tooltip title={processing.machine}>
                <span>
                  {t("data.kpi.processingValue", {
                    total: formatDecimalString(processing.totalMs),
                    median: processing.medianMs ?? "—",
                    p95: processing.p95Ms ?? "—",
                  })}
                </span>
              </Tooltip>
            ),
          },
        ]}
      />
    </BaseCard>
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
