import { Alert, Col, Empty, Row, Space, Table, Tag, Typography } from "antd";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { BaseCard, PageContainer, StatisticCard } from "@codecash/ui";
import type { DashboardView, Decision } from "@codecash/contracts";
import { getDashboard } from "@/shared/api/domain";
import { AppPage } from "@/shared/layout/AppPage";
import { formatDateTime, formatDecimalString } from "@/shared/lib/format";
import { ContractStatusTag, DecisionTag } from "@/shared/ui/DomainTags";
import { PageState } from "@/shared/ui/PageState";

type ContractSummary = DashboardView["contracts"][number];
type Attention = DashboardView["attention"][number];

const DECISIONS: Decision[] = ["RELEASE", "PENALTY", "HOLD", "REJECT"];
const ATTENTION_COLOR: Record<Attention["kind"], string> = {
  OPEN_DISPUTE: "error",
  DUE_SOON: "warning",
  SEQUENCE_WARNING: "gold",
  LOW_CONFIDENCE: "processing",
};
/** Near real time: the overview refreshes on its own while it is open. */
const REFRESH_MS = 30_000;

/** Many-contract overview: counts, money by state and the milestones that need a person now. */
export default function DashboardPage() {
  const { t } = useTranslation("dashboard");
  const { t: td } = useTranslation("domain");
  const view = useQuery({
    queryKey: ["dashboard"],
    queryFn: getDashboard,
    refetchInterval: REFRESH_MS,
  });
  const data = view.data;
  const million = (value: string) =>
    t("million", { value: formatDecimalString(value) });
  return (
    <AppPage active="dashboard" breadcrumb={[{ label: t("title") }]}>
      <PageContainer>
        {view.isLoading ? (
          <PageState kind="loading" />
        ) : view.isError || !data ? (
          <PageState kind="error" onRetry={() => void view.refetch()} />
        ) : (
          <Space orientation="vertical" size={16} style={{ width: "100%" }}>
            <Typography.Text type="secondary">
              {t("updated", { at: formatDateTime(data.generatedAt) })}
            </Typography.Text>
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={12} xl={6}>
                <StatisticCard
                  title={t("cards.contracts")}
                  value={data.contractCount}
                  subText={t("cards.attention", {
                    count: data.attentionCount,
                  })}
                />
              </Col>
              <Col xs={24} sm={12} xl={6}>
                <StatisticCard
                  title={t("cards.payable")}
                  value={million(data.amounts.payableMillion)}
                  subText={t("cards.paid", {
                    value: formatDecimalString(data.amounts.paidMillion),
                  })}
                />
              </Col>
              <Col xs={24} sm={12} xl={6}>
                <StatisticCard
                  title={t("cards.held")}
                  value={million(data.amounts.heldMillion)}
                  subText={t("cards.planned", {
                    value: formatDecimalString(data.amounts.plannedMillion),
                  })}
                />
              </Col>
              <Col xs={24} sm={12} xl={6}>
                <StatisticCard
                  title={t("cards.penalty")}
                  value={million(data.amounts.penaltyMillion)}
                />
              </Col>
            </Row>
            <Row gutter={[16, 16]}>
              <Col xs={24} xl={10}>
                <BaseCard title={t("decisions.title")}>
                  <Space wrap size={[12, 8]}>
                    {DECISIONS.map((decision) => (
                      <Space key={decision} size={6}>
                        <DecisionTag decision={decision} />
                        <Typography.Text strong>
                          {data.byDecision[decision] ?? 0}
                        </Typography.Text>
                      </Space>
                    ))}
                  </Space>
                  <Space wrap size={[12, 8]} style={{ marginTop: 16 }}>
                    {Object.entries(data.byStatus).map(([status, count]) => (
                      <Space key={status} size={6}>
                        <ContractStatusTag
                          status={status as ContractSummary["status"]}
                        />
                        <Typography.Text strong>{count}</Typography.Text>
                      </Space>
                    ))}
                  </Space>
                </BaseCard>
              </Col>
              <Col xs={24} xl={14}>
                <BaseCard
                  title={t("attention.title", {
                    count: data.attentionCount,
                  })}
                >
                  {data.attention.length ? (
                    <Space orientation="vertical" size={6}>
                      {data.attention.map((item, index) => (
                        <Space
                          key={`${item.contractId}-${item.sequence}-${item.kind}-${index}`}
                          wrap
                          size={8}
                        >
                          <Tag color={ATTENTION_COLOR[item.kind]}>
                            {t(`attention.kind.${item.kind}`)}
                          </Tag>
                          <Link
                            to={`/contracts/${item.contractId}/milestones/${item.sequence}/decision`}
                          >
                            {item.contractId} ·{" "}
                            {td("milestoneNo", { no: item.sequence })}
                          </Link>
                          {item.dueDate ? (
                            <Typography.Text type="secondary">
                              {t("attention.due", { date: item.dueDate })}
                            </Typography.Text>
                          ) : null}
                        </Space>
                      ))}
                    </Space>
                  ) : (
                    <Empty description={t("attention.none")} />
                  )}
                </BaseCard>
              </Col>
            </Row>
            <BaseCard title={t("contracts.title")}>
              {data.contractCount === 0 ? (
                <Alert type="info" showIcon title={t("contracts.none")} />
              ) : (
                <Table<ContractSummary>
                  size="small"
                  rowKey="contractId"
                  pagination={false}
                  scroll={{ x: "max-content" }}
                  dataSource={data.contracts}
                  columns={[
                    {
                      key: "contract",
                      title: t("contracts.columns.contract"),
                      render: (_, row) => (
                        <Link to={`/contracts/${row.contractId}`}>
                          {row.contractId} · {row.title}
                        </Link>
                      ),
                    },
                    {
                      key: "status",
                      title: t("contracts.columns.status"),
                      render: (_, row) => (
                        <ContractStatusTag status={row.status} />
                      ),
                    },
                    {
                      key: "held",
                      title: t("contracts.columns.held"),
                      render: (_, row) => `${row.held}/${row.milestones}`,
                    },
                    {
                      key: "disputes",
                      title: t("contracts.columns.disputes"),
                      dataIndex: "openDisputes",
                    },
                    {
                      key: "payable",
                      title: t("contracts.columns.payable"),
                      render: (_, row) =>
                        formatDecimalString(row.payableMillion),
                    },
                  ]}
                />
              )}
            </BaseCard>
          </Space>
        )}
      </PageContainer>
    </AppPage>
  );
}
