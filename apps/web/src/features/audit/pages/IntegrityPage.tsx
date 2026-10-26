import { DemoFillButton } from "@/shared/ui/DemoFillButton";
import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
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
import { AnchorPanel } from "../components/AnchorPanel";

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
                <DemoFillButton
                  disabled={!!anchorText.trim() || !report.data?.chain.head}
                  onClick={() => {
                    const head = report.data?.chain.head;
                    if (head) setAnchorText(`${head.seq}:${head.hash}`);
                  }}
                >
                  {t("integrity.chain.anchor.loadCurrent")}
                </DemoFillButton>
                <Button onClick={() => setAnchor(anchorText.trim())}>
                  {t("integrity.chain.anchor.check")}
                </Button>
              </Space.Compact>
            }
          />
        ) : null}
      </PageContainer>
      <AnchorPanel />
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
        {t("lite.checkedAt", { time: formatDateTime(data.checkedAt) })}
      </Typography.Text>
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <BaseCard
            title={t("integrity.chain.title")}
            extra={
              <Verdict
                ok={
                  chain.ok &&
                  (!chain.lastAnchor || chain.lastAnchor.result === "MATCH")
                }
              />
            }
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
                ...(chain.unsealed
                  ? [
                      {
                        key: "unsealed",
                        label: t("integrity.chain.unsealed"),
                        children: chain.unsealed,
                      },
                    ]
                  : []),
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
                ...(chain.firstBroken
                  ? [
                      {
                        key: "broken",
                        label: t("integrity.chain.firstBroken"),
                        children: (
                          <Typography.Text type="danger">
                            #{chain.firstBroken.seq} ·{" "}
                            {t(
                              `integrity.chain.problems.${chain.firstBroken.problem}`,
                            )}{" "}
                            · {chain.firstBroken.id}
                          </Typography.Text>
                        ),
                      },
                    ]
                  : []),
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
                {
                  key: "lastAnchor",
                  label: t("integrity.chain.lastAnchor.label"),
                  children: chain.lastAnchor ? (
                    <Space wrap size={[8, 4]}>
                      <Tag
                        color={
                          chain.lastAnchor.result === "MATCH"
                            ? "success"
                            : "error"
                        }
                        style={{ margin: 0 }}
                      >
                        {t(`integrity.chain.anchor.${chain.lastAnchor.result}`)}
                      </Tag>
                      <Typography.Text type="secondary">
                        {t("integrity.chain.lastAnchor.value", {
                          seq: chain.lastAnchor.seq,
                          at: formatDateTime(chain.lastAnchor.anchoredAt),
                        })}
                      </Typography.Text>
                    </Space>
                  ) : (
                    <Typography.Text type="secondary">
                      {t("integrity.chain.lastAnchor.none")}
                    </Typography.Text>
                  ),
                },
                ...(chain.continuesFrom
                  ? [
                      {
                        key: "continuesFrom",
                        label: t("integrity.chain.continuesFrom"),
                        children: (
                          <Typography.Text
                            code
                            copyable={{ text: chain.continuesFrom.headHash }}
                          >
                            {chain.continuesFrom.archive} ·{" "}
                            {short(chain.continuesFrom.headHash)}
                          </Typography.Text>
                        ),
                      },
                    ]
                  : []),
              ]}
            />
            <div style={{ marginTop: 12 }}>{anchorControl}</div>
          </BaseCard>
        </Col>
        <Col xs={24} xl={12}>
          <BaseCard
            title={t("integrity.evidence.title")}
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
                ...(evidence.unsealed
                  ? [
                      {
                        key: "unsealed",
                        label: t("integrity.evidence.unsealed"),
                        children: evidence.unsealed,
                      },
                    ]
                  : []),
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
            extra={
              data.dataPack ? (
                <Verdict ok={data.dataPack.tables.every((x) => x.ok)} />
              ) : undefined
            }
          >
            {data.dataPack ? (
              <>
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
            extra={
              <Verdict
                ok={
                  !decisions.mismatches.length && !decisions.sealProblems.length
                }
              />
            }
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
                  key: "sealed",
                  label: t("integrity.decisions.sealed"),
                  children: `${decisions.sealed}/${decisions.checked}`,
                },
                ...(decisions.sealProblems.length
                  ? [
                      {
                        key: "sealProblems",
                        label: t("integrity.decisions.sealProblems"),
                        children: (
                          <Space wrap size={[8, 4]}>
                            {decisions.sealProblems.map((p) => (
                              <Typography.Text
                                key={p.milestoneId}
                                type="danger"
                              >
                                {p.contractId} ·{" "}
                                {td("milestoneNo", { no: p.sequence })}
                              </Typography.Text>
                            ))}
                          </Space>
                        ),
                      },
                    ]
                  : []),
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
                    // The integrity checker cannot open contracts; the parties look them up.
                    render: (_, m) =>
                      `${m.contractId} · ${td("milestoneNo", { no: m.sequence })}`,
                  },
                  ...(decisions.mismatches.some((m) => m.stored)
                    ? [
                        {
                          key: "stored",
                          title: t("integrity.decisions.columns.stored"),
                          render: (_: unknown, m: Mismatch) =>
                            facts(m.stored ?? null),
                        },
                        {
                          key: "fresh",
                          title: t("integrity.decisions.columns.fresh"),
                          render: (_: unknown, m: Mismatch) =>
                            facts(m.fresh ?? null),
                        },
                      ]
                    : []),
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
    </Space>
  );
}
