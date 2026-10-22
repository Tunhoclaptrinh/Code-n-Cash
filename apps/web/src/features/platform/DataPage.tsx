import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Button,
  Col,
  Collapse,
  Descriptions,
  Drawer,
  Row,
  Select,
  Space,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import {
  CheckCircleOutlined,
  DownloadOutlined,
  InfoCircleOutlined,
  PlayCircleOutlined,
} from "@ant-design/icons";
import {
  DataTable,
  PageContainer,
  StatisticCard,
  exportToCSV,
  exportToJSON,
} from "@codecash/ui";
import { platform } from "@/shared/api/platform";
import { AppPage } from "@/shared/layout/AppPage";
import { useCurrentUser } from "@/shared/auth/session";
import { formatDecimalString } from "@/shared/lib/format";

type Decision = "RELEASE" | "HOLD" | "REJECT" | "PENALTY";
const DECISIONS: Decision[] = ["RELEASE", "PENALTY", "HOLD", "REJECT"];
const decisionColor: Record<Decision, string> = {
  RELEASE: "success",
  PENALTY: "orange",
  HOLD: "warning",
  REJECT: "error",
};
const decisionValueColor: Record<Decision, string> = {
  RELEASE: "var(--color-success-strong)",
  PENALTY: "var(--color-warning)",
  HOLD: "var(--color-warning)",
  REJECT: "var(--color-danger-strong)",
};
const EVALUATORS = ["CONTRACT_OWNER", "FINANCE_APPROVER", "ADMIN_AUDITOR"];

interface Trace {
  id: string;
  result: Record<string, unknown>;
  [key: string]: unknown;
}
interface Evaluation {
  runId: string;
  rows: Record<string, string>[];
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

export default function DataPage() {
  const { t } = useTranslation("platform");
  const user = useCurrentUser();
  const cache = useQueryClient();
  const [trace, setTrace] = useState<Trace>();
  const [decision, setDecision] = useState<Decision | "">("");
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
  const rows = useMemo(
    () =>
      (result.data?.rows ?? []).filter(
        (row) => !decision || row.predicted_decision === decision,
      ),
    [result.data, decision],
  );
  const money = (value: string) => (
    <span style={{ fontVariantNumeric: "tabular-nums" }}>
      {formatDecimalString(value)}
    </span>
  );

  const columns = [
    {
      key: "contract_id",
      dataIndex: "contract_id",
      title: t("data.columns.contract_id"),
      render: (value: string) => (
        <Typography.Text strong>{value}</Typography.Text>
      ),
    },
    {
      key: "milestone_id",
      dataIndex: "milestone_id",
      title: t("data.columns.milestone_id"),
    },
    {
      key: "milestone_type",
      dataIndex: "milestone_type",
      title: t("data.columns.milestone_type"),
    },
    {
      key: "predicted_decision",
      dataIndex: "predicted_decision",
      title: t("data.columns.predicted_decision"),
      render: (value: Decision) => (
        <Tooltip title={t(`data.decisionHint.${value}`)}>
          <Tag color={decisionColor[value]}>{value}</Tag>
        </Tooltip>
      ),
    },
    {
      key: "payable_amount_vnd_mn",
      dataIndex: "payable_amount_vnd_mn",
      title: t("data.columns.payable_amount_vnd_mn"),
      align: "right" as const,
      render: money,
    },
    {
      key: "penalty_amount_vnd_mn",
      dataIndex: "penalty_amount_vnd_mn",
      title: t("data.columns.penalty_amount_vnd_mn"),
      align: "right" as const,
      render: money,
    },
    {
      key: "reason_code",
      dataIndex: "reason_code",
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
            <Tooltip
              title={canEvaluate ? undefined : t("data.evaluateForbidden")}
            >
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                loading={evaluate.isPending}
                disabled={!canEvaluate}
                onClick={() => evaluate.mutate()}
              >
                {t("data.evaluate")}
              </Button>
            </Tooltip>
            <Button
              icon={<DownloadOutlined />}
              disabled={!result.data}
              onClick={() =>
                exportToCSV(result.data!.rows, "submission_output.csv")
              }
            >
              {t("data.export")}
            </Button>
            <Button
              icon={<DownloadOutlined />}
              disabled={!result.data}
              onClick={() => exportToJSON(result.data!.traces, "audit.json")}
            >
              {t("data.audit")}
            </Button>
          </Space>
        }
      >
        {evaluate.isError ? (
          <Alert type="error" showIcon title={evaluate.error.message} />
        ) : null}
        {result.isError ? (
          <Alert type="error" showIcon title={result.error.message} />
        ) : null}
        <Row gutter={[16, 16]}>
          {DECISIONS.map((key) => (
            <Col key={key} xs={12} lg={6}>
              <StatisticCard
                loading={result.isPending}
                title={key}
                value={summary?.decisions[key] ?? 0}
                valueColor={decisionValueColor[key]}
                subText={t(`data.decisionHint.${key}`)}
              />
            </Col>
          ))}
        </Row>
        {summary ? (
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
        ) : null}
        <DataTable
          rowKey="milestone_id"
          columns={columns}
          dataSource={rows}
          loading={result.isPending}
          searchFields={["contract_id", "milestone_id", "reason_code"]}
          extra={
            <Select
              value={decision}
              onChange={setDecision}
              style={{ minWidth: 200 }}
              options={[
                { value: "", label: t("data.allDecisions") },
                ...DECISIONS.map((value) => ({ value, label: value })),
              ]}
            />
          }
          onView={(row) =>
            setTrace(
              result.data?.traces.find((x) => x.id === row.audit_trace_id),
            )
          }
        />
      </PageContainer>
      <Drawer
        open={!!trace}
        onClose={() => setTrace(undefined)}
        title={`${t("data.trace")} · ${String(trace?.result.milestone_id ?? "")}`}
        size="large"
      >
        {trace ? <TraceDetails trace={trace} /> : null}
      </Drawer>
    </AppPage>
  );
}

function TraceDetails({ trace }: { trace: Trace }) {
  const { t } = useTranslation("platform");
  const r = trace.result;
  const list = (value: unknown) =>
    Array.isArray(value) && value.length ? value.join(", ") : "—";
  const decision = r.decision as Decision;
  return (
    <Space orientation="vertical" size={16} style={{ width: "100%" }}>
      <Descriptions
        column={1}
        bordered
        size="small"
        items={[
          {
            key: "decision",
            label: t("data.traceFields.decision"),
            children: <Tag color={decisionColor[decision]}>{decision}</Tag>,
          },
          {
            key: "reason",
            label: t("data.traceFields.reason"),
            children: (
              <Typography.Text code>{String(r.reason_code)}</Typography.Text>
            ),
          },
          {
            key: "rule",
            label: t("data.traceFields.rule"),
            children: String(r.rule_id ?? "—"),
          },
          {
            key: "payable",
            label: t("data.traceFields.payable"),
            children: formatDecimalString(String(r.payable)),
          },
          {
            key: "penalty",
            label: t("data.traceFields.penalty"),
            children: formatDecimalString(String(r.penalty)),
          },
          {
            key: "evidence",
            label: t("data.traceFields.evidence"),
            children: list(r.evidence),
          },
          {
            key: "missing",
            label: t("data.traceFields.missing"),
            children: list(r.missing),
          },
        ]}
      />
      <Collapse
        items={[
          {
            key: "raw",
            label: t("data.traceFields.raw"),
            children: (
              <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 12 }}>
                {JSON.stringify(trace, null, 2)}
              </pre>
            ),
          },
        ]}
      />
    </Space>
  );
}
