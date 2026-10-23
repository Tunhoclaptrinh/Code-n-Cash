import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  Alert,
  Button,
  Col,
  Descriptions,
  Input,
  Row,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { BaseCard, PageContainer } from "@codecash/ui";
import type { DecisionFacts, IntegrityReport } from "@codecash/contracts";
import { ApiError } from "@/shared/api/client";
import { verifyIntegrity } from "@/shared/api/domain";
import { AppPage } from "@/shared/layout/AppPage";
import { formatDateTime, formatDecimalString } from "@/shared/lib/format";
import { DecisionTag } from "@/shared/ui/DomainTags";
import { PageState } from "@/shared/ui/PageState";

type Mismatch = IntegrityReport["decisions"]["mismatches"][number];
type EvidenceProblem = IntegrityReport["evidence"]["problems"][number];
type SealedTable = NonNullable<IntegrityReport["dataPack"]>["tables"][number];

const short = (hash: string) => `${hash.slice(0, 12)}…${hash.slice(-6)}`;

/**
 * Integrity check for controllers: the audit log hash chain, the evidence recorded in the app and
 * every stored decision against a fresh engine run (spec 14.5, risk R08). It writes nothing.
 */
export default function IntegrityPage() {
  const { t } = useTranslation("audit");
  const [anchorText, setAnchorText] = useState("");
  const [anchor, setAnchor] = useState("");
  const report = useQuery({
    queryKey: ["integrity", anchor],
    queryFn: () => verifyIntegrity(anchor || undefined),
  });
  const errorCode =
    report.error instanceof ApiError ? report.error.code : undefined;
  return (
    <AppPage
      guide="integrity"
      active="integrity"
      breadcrumb={[{ label: t("integrity.title") }]}
      extra={
        <Button
          icon={<ReloadOutlined />}
          loading={report.isFetching}
          onClick={() => void report.refetch()}
          data-testid="integrity-rerun"
        >
          {t("integrity.rerun")}
        </Button>
      }
    >
      <PageContainer>
        {report.isError ? (
          <Alert
            type="error"
            showIcon
            title={t(`integrity.errors.${errorCode ?? "UNKNOWN"}`, {
              defaultValue: t("integrity.errors.UNKNOWN"),
            })}
            action={
              anchor ? (
                <Button size="small" onClick={() => setAnchor("")}>
                  {t("integrity.chain.anchor.clear")}
                </Button>
              ) : undefined
            }
          />
        ) : null}
        {report.isPending ? <PageState kind="loading" /> : null}
        {report.data ? (
          <Report
            data={report.data}
            anchorControl={
              <Space.Compact style={{ width: "100%", maxWidth: 560 }}>
                <Input
                  value={anchorText}
                  placeholder={t("integrity.chain.anchor.placeholder")}
                  onChange={(event) => setAnchorText(event.target.value)}
                  onPressEnter={() => setAnchor(anchorText.trim())}
                  aria-label={t("integrity.chain.anchor.label")}
                />
                <Button onClick={() => setAnchor(anchorText.trim())}>
                  {t("integrity.chain.anchor.check")}
                </Button>
              </Space.Compact>
            }
          />
        ) : null}
      </PageContainer>
    </AppPage>
  );
}

function Verdict({ ok }: { ok: boolean }) {
  const { t } = useTranslation("audit");
  return (
    <Tag
      color={ok ? "success" : "error"}
      style={{ margin: 0 }}
      data-testid={ok ? "verdict-ok" : "verdict-broken"}
    >
      {t(ok ? "integrity.ok" : "integrity.broken")}
    </Tag>
  );
}

function Report({
  data,
  anchorControl,
}: {
  data: IntegrityReport;
  anchorControl: ReactNode;
}) {
  const { t } = useTranslation("audit");
  const { t: td } = useTranslation("domain");
  const { chain, evidence, decisions } = data;
  const facts = (value: DecisionFacts | null) =>
    value ? (
      <Space size={4} wrap>
        <DecisionTag decision={value.decision} />
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {td(`reason.${value.reasonCode}`)} · {value.ruleId} ·{" "}
          {formatDecimalString(value.payableMillion)} /{" "}
          {formatDecimalString(value.penaltyMillion)}
        </Typography.Text>
      </Space>
    ) : (
      t("integrity.decisions.missing")
    );
  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Typography.Text type="secondary">
        {t("integrity.checkedAt", { time: formatDateTime(data.checkedAt) })}
      </Typography.Text>
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <BaseCard
            title={t("integrity.chain.title")}
            subtitle={t("integrity.chain.subtitle")}
            extra={<Verdict ok={chain.ok} />}
          >
            <Descriptions
              size="small"
              column={1}
              items={[
                {
                  key: "sealed",
                  label: t("integrity.chain.sealed"),
                  children: chain.sealed,
                },
                {
                  key: "unsealed",
                  label: t("integrity.chain.unsealed"),
                  children: chain.unsealed,
                },
                {
                  key: "head",
                  label: t("integrity.chain.head"),
                  children: chain.head ? (
                    <Typography.Text
                      code
                      copyable={{
                        text: `${chain.head.seq}:${chain.head.hash}`,
                      }}
                    >
                      #{chain.head.seq} · {short(chain.head.hash)}
                    </Typography.Text>
                  ) : (
                    "—"
                  ),
                },
                {
                  key: "broken",
                  label: t("integrity.chain.firstBroken"),
                  children: chain.firstBroken ? (
                    <Typography.Text type="danger">
                      #{chain.firstBroken.seq} ·{" "}
                      {t(
                        `integrity.chain.problems.${chain.firstBroken.problem}`,
                      )}{" "}
                      · {chain.firstBroken.id}
                    </Typography.Text>
                  ) : (
                    t("integrity.chain.none")
                  ),
                },
                ...(chain.anchor
                  ? [
                      {
                        key: "anchor",
                        label: t("integrity.chain.anchor.result"),
                        children: (
                          <Tag
                            color={
                              chain.anchor === "MATCH" ? "success" : "error"
                            }
                            style={{ margin: 0 }}
                          >
                            {t(`integrity.chain.anchor.${chain.anchor}`)}
                          </Tag>
                        ),
                      },
                    ]
                  : []),
              ]}
            />
            <Typography.Paragraph
              type="secondary"
              style={{ margin: "12px 0 8px" }}
            >
              {t("integrity.chain.anchor.hint")}
            </Typography.Paragraph>
            {anchorControl}
          </BaseCard>
        </Col>
        <Col xs={24} xl={12}>
          <BaseCard
            title={t("integrity.evidence.title")}
            subtitle={t("integrity.evidence.subtitle")}
            extra={<Verdict ok={!evidence.problems.length} />}
          >
            <Descriptions
              size="small"
              column={1}
              items={[
                {
                  key: "sealed",
                  label: t("integrity.evidence.sealed"),
                  children: evidence.sealed,
                },
                {
                  key: "unsealed",
                  label: t("integrity.evidence.unsealed"),
                  children: evidence.unsealed,
                },
              ]}
            />
            {evidence.problems.length ? (
              <Table<EvidenceProblem>
                size="small"
                rowKey="eventId"
                pagination={false}
                style={{ marginTop: 12 }}
                dataSource={evidence.problems}
                columns={[
                  {
                    key: "event",
                    title: t("integrity.evidence.columns.event"),
                    render: (_, p) => (
                      <Typography.Text code>{p.eventId}</Typography.Text>
                    ),
                  },
                  {
                    key: "contract",
                    title: t("integrity.evidence.columns.contract"),
                    render: (_, p) => p.contractId ?? "—",
                  },
                  {
                    key: "problem",
                    title: t("integrity.evidence.columns.problem"),
                    render: (_, p) => (
                      <Typography.Text type="danger">
                        {t(`integrity.evidence.problems.${p.problem}`)}
                      </Typography.Text>
                    ),
                  },
                ]}
              />
            ) : null}
          </BaseCard>
        </Col>
        <Col xs={24} xl={12}>
          <BaseCard
            title={t("integrity.dataPack.title")}
            subtitle={t("integrity.dataPack.subtitle")}
            extra={
              data.dataPack ? (
                <Verdict ok={data.dataPack.tables.every((x) => x.ok)} />
              ) : undefined
            }
          >
            {data.dataPack ? (
              <>
                <Typography.Paragraph type="secondary">
                  {t("integrity.dataPack.sealedAt", {
                    time: formatDateTime(data.dataPack.sealedAt),
                  })}
                </Typography.Paragraph>
                <Table<SealedTable>
                  size="small"
                  rowKey="name"
                  pagination={false}
                  dataSource={data.dataPack.tables}
                  columns={[
                    {
                      key: "name",
                      title: t("integrity.dataPack.columns.table"),
                      render: (_, x) => (
                        <Typography.Text code>
                          {/* Data Pack file name, e.g. payment-rules → payment_rules.csv */}
                          {x.name.replace("-", "_")}.csv
                        </Typography.Text>
                      ),
                    },
                    {
                      key: "rows",
                      title: t("integrity.dataPack.columns.rows"),
                      render: (_, x) =>
                        x.rows === x.sealedRows
                          ? x.rows
                          : `${x.sealedRows} → ${x.rows}`,
                    },
                    {
                      key: "ok",
                      title: t("integrity.dataPack.columns.result"),
                      render: (_, x) => (
                        <Typography.Text type={x.ok ? "success" : "danger"}>
                          {t(
                            x.ok
                              ? "integrity.dataPack.same"
                              : "integrity.dataPack.changed",
                          )}
                        </Typography.Text>
                      ),
                    },
                  ]}
                />
              </>
            ) : (
              <Typography.Text type="secondary">
                {t("integrity.dataPack.none")}
              </Typography.Text>
            )}
          </BaseCard>
        </Col>
        <Col xs={24} xl={12}>
          <BaseCard
            title={t("integrity.decisions.title")}
            subtitle={t("integrity.decisions.subtitle")}
            extra={<Verdict ok={!decisions.mismatches.length} />}
          >
            <Descriptions
              size="small"
              column={1}
              items={[
                {
                  key: "matched",
                  label: t("integrity.decisions.matched"),
                  children: `${decisions.matched}/${decisions.checked}`,
                },
                {
                  key: "run",
                  label: t("integrity.decisions.run"),
                  children: (
                    <Typography.Text code copyable>
                      {decisions.runId}
                    </Typography.Text>
                  ),
                },
                {
                  key: "fingerprint",
                  label: t("integrity.decisions.fingerprint"),
                  children: (
                    <Typography.Text
                      code
                      copyable={{ text: decisions.fingerprint }}
                    >
                      {short(decisions.fingerprint)}
                    </Typography.Text>
                  ),
                },
              ]}
            />
            {decisions.mismatches.length ? (
              <Table<Mismatch>
                size="small"
                rowKey="milestoneId"
                pagination={{ pageSize: 10, hideOnSinglePage: true }}
                scroll={{ x: "max-content" }}
                style={{ marginTop: 12 }}
                dataSource={decisions.mismatches}
                columns={[
                  {
                    key: "milestone",
                    title: t("integrity.decisions.columns.milestone"),
                    render: (_, m) => (
                      <Link
                        to={`/contracts/${m.contractId}/milestones/${m.sequence}/decision`}
                      >
                        {m.contractId} · {td("milestoneNo", { no: m.sequence })}
                      </Link>
                    ),
                  },
                  {
                    key: "stored",
                    title: t("integrity.decisions.columns.stored"),
                    render: (_, m) => facts(m.stored),
                  },
                  {
                    key: "fresh",
                    title: t("integrity.decisions.columns.fresh"),
                    render: (_, m) => facts(m.fresh),
                  },
                  {
                    key: "frozen",
                    title: t("integrity.decisions.columns.frozen"),
                    render: (_, m) =>
                      m.frozen ? (
                        <Tag>{t("integrity.decisions.frozen")}</Tag>
                      ) : (
                        "—"
                      ),
                  },
                ]}
              />
            ) : null}
          </BaseCard>
        </Col>
      </Row>
      <Alert type="info" showIcon title={t("integrity.note")} />
    </Space>
  );
}
