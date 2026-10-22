import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Collapse,
  Descriptions,
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
  exportToCSV,
  exportToJSON,
  useFilters,
  usePagination,
  type FilterConfig,
  type StatisticsItem,
} from "@codecash/ui";
import { platform } from "@/shared/api/platform";
import { AppPage } from "@/shared/layout/AppPage";
import { useCurrentUser } from "@/shared/auth/session";
import { formatDecimalString } from "@/shared/lib/format";

type Decision = "RELEASE" | "HOLD" | "REJECT" | "PENALTY";
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
const EVALUATORS = ["CONTRACT_OWNER", "FINANCE_APPROVER", "ADMIN_AUDITOR"];

type Row = Record<string, string>;
interface Trace {
  id: string;
  result: Record<string, unknown>;
  [key: string]: unknown;
}
interface Evaluation {
  runId: string;
  rows: Row[];
  traces: Trace[];
  summary: {
    contracts: number;
    milestones: number;
    sampleMatched: number;
    sampleTotal: number;
    invariantViolations: string[];
    payableMillion: string;
    penaltyMillion: string;
    decisions: Partial<Record<Decision, number>>;
  };
}
type Filters = {
  milestone_type?: string;
  reason_code?: string;
  contract_id?: string;
};

export default function DataPage() {
  const { t } = useTranslation("platform");
  const user = useCurrentUser();
  const cache = useQueryClient();
  const [tab, setTab] = useState<Decision | "ALL">("ALL");
  const [traceRow, setTraceRow] = useState<Row>();
  const { filters, updateFilter, clearFilters } = useFilters<Filters>({});
  const { page, pageSize, goToPage, handleTableChange } = usePagination(1, 10);
  const result = useQuery({
    queryKey: ["engine"],
    queryFn: () => platform.get<Evaluation>("/engine/decisions"),
  });
  const evaluate = useMutation({
    mutationFn: () => platform.post<Evaluation>("/engine/evaluate", {}),
    onSuccess: (data) => cache.setQueryData(["engine"], data),
  });
  const canEvaluate = EVALUATORS.includes(user.role);
  const summary = result.data?.summary;
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
      width: 120,
      title: t("data.columns.contract_id"),
      sorter: (a: Row, b: Row) => a.contract_id.localeCompare(b.contract_id),
      render: (value: string) => (
        <Typography.Text strong>{value}</Typography.Text>
      ),
    },
    {
      key: "milestone_id",
      dataIndex: "milestone_id",
      width: 120,
      title: t("data.columns.milestone_id"),
      sorter: (a: Row, b: Row) => a.milestone_id.localeCompare(b.milestone_id),
    },
    {
      key: "milestone_type",
      dataIndex: "milestone_type",
      width: 140,
      title: t("data.columns.milestone_type"),
    },
    {
      key: "predicted_decision",
      dataIndex: "predicted_decision",
      width: 130,
      title: t("data.columns.predicted_decision"),
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
            ? t("data.subtitle", {
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
            >
              {t("data.evaluate")}
            </BaseButton>
            <BaseButton
              variant="secondary"
              icon={<DownloadOutlined />}
              disabled={!result.data}
              onClick={() => exportToCSV(allRows, "submission_output.csv")}
            >
              {t("data.export")}
            </BaseButton>
            <BaseButton
              variant="secondary"
              icon={<DownloadOutlined />}
              disabled={!result.data}
              onClick={() => exportToJSON(result.data!.traces, "audit.json")}
            >
              {t("data.audit")}
            </BaseButton>
          </Space>
        }
      >
        {evaluate.isError ? (
          <Alert type="error" showIcon title={evaluate.error.message} />
        ) : null}
        {result.isError ? (
          <Alert type="error" showIcon title={result.error.message} />
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
                  children: `${summary.sampleMatched}/${summary.sampleTotal}`,
                },
                {
                  key: "invariants",
                  label: t("data.summary.invariants"),
                  children: summary.invariantViolations.length ? (
                    <Tag color="error">
                      {t("data.summary.invariantsBroken", {
                        count: summary.invariantViolations.length,
                      })}
                    </Tag>
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
