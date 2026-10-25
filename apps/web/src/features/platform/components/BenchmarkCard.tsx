import { useTranslation } from "react-i18next";
import { Alert, Descriptions, Skeleton, Space, Tooltip } from "antd";
import { InfoCircleOutlined } from "@ant-design/icons";
import { BaseButton, BaseCard } from "@codecash/ui";
import { formatDecimalString, formatNumber } from "@/shared/lib/format";
import type { Benchmark } from "../api/engine.api";

interface Props {
  /** Number of milestones in the official data, named in the subtitle. */
  milestones: number;
  data?: Benchmark;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
}

const percent = (fraction: number) => `${formatNumber(fraction * 100, 2)}%`;
const ratio = (correct: number, total: number) =>
  `${formatNumber(correct)}/${formatNumber(total)}`;

/** Results on the generated cases (test half), shown beside the public-sample KPIs. */
export function BenchmarkCard({
  milestones,
  data,
  loading,
  failed,
  onRetry,
}: Props) {
  const { t } = useTranslation("platform");
  const label = (key: string) => (
    <Space wrap size={4}>
      {t(`data.benchmark.${key}`)}
      <Tooltip title={t(`data.benchmark.hint.${key}`)}>
        <InfoCircleOutlined />
      </Tooltip>
    </Space>
  );
  const test = data?.synthetic.test;
  return (
    <BaseCard
      title={t("data.benchmark.title")}
      subtitle={t("data.benchmark.subtitle", {
        scenarios: data ? Object.keys(data.synthetic.scenarios).length : 28,
        milestones,
      })}
      bodyStyle={test ? { padding: 0 } : undefined}
    >
      {test ? (
        <Descriptions
          bordered
          size="small"
          layout="vertical"
          column={{ xs: 1, sm: 2, lg: 5 }}
          items={[
            {
              key: "cases",
              label: label("cases"),
              children: formatNumber(test.cases),
            },
            {
              key: "decisionAccuracy",
              label: label("decisionAccuracy"),
              children: t("data.benchmark.lowerBound", {
                ratio: ratio(
                  test.decisionAccuracy.correct,
                  test.decisionAccuracy.total,
                ),
                bound: percent(test.decisionAccuracy.wilson95[0]),
              }),
            },
            {
              key: "fullMatch",
              label: label("fullMatch"),
              children: t("data.benchmark.lowerBound", {
                ratio: ratio(test.fullMatch.correct, test.fullMatch.total),
                bound: percent(test.fullMatch.wilson95[0]),
              }),
            },
            {
              key: "macroF1",
              label: label("macroF1"),
              children:
                test.macroF1 === null
                  ? "—"
                  : formatDecimalString(test.macroF1.toFixed(4)),
            },
            {
              key: "unauthorizedPayment",
              label: label("unauthorizedPayment"),
              children: t("data.benchmark.upperBound", {
                ratio: ratio(
                  test.unauthorizedPayment.count,
                  test.unauthorizedPayment.total,
                ),
                bound: percent(test.unauthorizedPayment.wilson95[1]),
              }),
            },
          ]}
        />
      ) : failed ? (
        <Alert
          type="warning"
          showIcon
          title={t("data.benchmark.error")}
          action={
            <BaseButton variant="secondary" onClick={onRetry}>
              {t("data.benchmark.retry")}
            </BaseButton>
          }
        />
      ) : loading ? (
        <Space direction="vertical" size={8} style={{ width: "100%" }}>
          <Alert type="info" showIcon title={t("data.benchmark.loading")} />
          <Skeleton active paragraph={{ rows: 1 }} title={false} />
        </Space>
      ) : null}
    </BaseCard>
  );
}
