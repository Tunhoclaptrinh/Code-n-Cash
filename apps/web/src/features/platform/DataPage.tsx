import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Button,
  Card,
  Statistic,
  Row,
  Col,
  Tag,
  Alert,
  Drawer,
  Descriptions,
  Space,
} from "antd";
import { useState } from "react";
import { DataTable, exportToCSV, exportToJSON } from "@codecash/ui";
import { platform } from "@/shared/api/platform";
import { AppShell } from "@/shared/layout/AppShell";
import { useCurrentUser } from "@/shared/auth/session";
interface Evaluation {
  runId: string;
  rows: Record<string, string>[];
  traces: Record<string, unknown>[];
  summary: {
    contracts: number;
    milestones: number;
    sampleMatched: number;
    sampleTotal: number;
    decisions: Record<string, number>;
  };
}
export default function DataPage() {
  const { t } = useTranslation("platform");
  const user = useCurrentUser();
  const cache = useQueryClient();
  const [trace, setTrace] = useState<Record<string, unknown>>();
  const result = useQuery({
    queryKey: ["engine"],
    queryFn: () => platform.get<Evaluation>("/engine/decisions"),
  });
  const evaluate = useMutation({
    mutationFn: () => platform.post<Evaluation>("/engine/evaluate", {}),
    onSuccess: (data) => cache.setQueryData(["engine"], data),
  });
  const columns = [
    "contract_id",
    "milestone_id",
    "milestone_type",
    "predicted_decision",
    "payable_amount_vnd_mn",
    "penalty_amount_vnd_mn",
    "reason_code",
  ].map((key) => ({
    key,
    dataIndex: key,
    title: t(`data.columns.${key}`),
    render: (value: string) =>
      key === "predicted_decision" ? (
        <Tag
          color={
            {
              RELEASE: "success",
              HOLD: "warning",
              REJECT: "error",
              PENALTY: "orange",
            }[value]
          }
        >
          {value}
        </Tag>
      ) : (
        value
      ),
  }));
  return (
    <AppShell active="data" breadcrumb={[{ label: t("data.title") }]}>
      <Space style={{ marginBottom: 24 }}>
        <Button
          type="primary"
          loading={evaluate.isPending}
          disabled={
            !["CONTRACT_OWNER", "FINANCE_APPROVER", "ADMIN_AUDITOR"].includes(
              user.role,
            )
          }
          onClick={() => evaluate.mutate()}
        >
          {t("data.evaluate")}
        </Button>
        <Button
          disabled={!result.data}
          onClick={() =>
            exportToCSV(result.data!.rows, "submission_output.csv")
          }
        >
          {t("data.export")}
        </Button>
        <Button
          disabled={!result.data}
          onClick={() => exportToJSON(result.data!.traces, "audit.json")}
        >
          {t("data.audit")}
        </Button>
      </Space>
      {result.isError ? (
        <Alert type="error" title={result.error.message} />
      ) : null}
      {result.data?.summary ? (
        <Row gutter={16}>
          {Object.entries(result.data.summary.decisions).map(([key, value]) => (
            <Col key={key} xs={12} lg={6}>
              <Card>
                <Statistic title={key} value={value} />
              </Card>
            </Col>
          ))}
        </Row>
      ) : null}
      <DataTable
        rowKey="milestone_id"
        columns={columns}
        dataSource={result.data?.rows ?? []}
        loading={result.isPending}
        searchFields={["contract_id", "milestone_id", "reason_code"]}
        onView={(row) =>
          setTrace(result.data?.traces.find((x) => x.id === row.audit_trace_id))
        }
      />
      <Drawer
        open={!!trace}
        onClose={() => setTrace(undefined)}
        title={t("data.trace")}
        size="large"
      >
        <Descriptions
          column={1}
          items={Object.entries(trace ?? {}).map(([key, value]) => ({
            key,
            label: key,
            children: (
              <pre style={{ whiteSpace: "pre-wrap" }}>
                {JSON.stringify(value, null, 2)}
              </pre>
            ),
          }))}
        />
      </Drawer>
    </AppShell>
  );
}
