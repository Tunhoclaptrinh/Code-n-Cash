import { DemoFillButton } from "@/shared/ui/DemoFillButton";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  App as AntApp,
  Button,
  Col,
  Descriptions,
  Input,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Timeline,
  Tooltip,
  Typography,
} from "antd";
import { CheckCircleFilled, CloseCircleFilled } from "@ant-design/icons";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import type {
  ClassifiedEvent,
  ExceptionRequest,
  MilestoneDetail,
  RuleOutcome,
  TimelinePoint,
} from "@codecash/contracts";
import { ApiError } from "@/shared/api/client";
import {
  decideException,
  getMilestoneDetail,
  getMilestoneTimeline,
  proposeException,
  transferToAccounting,
} from "@/shared/api/domain";
import { useCurrentUser } from "@/shared/auth/session";
import { AppPage } from "@/shared/layout/AppPage";
import {
  actorName,
  contractTitle,
  describeNext,
  eventClassTone,
  statusTone,
} from "@/shared/lib/domain";
import {
  formatDate,
  formatDateTime,
  formatDecimalString,
} from "@/shared/lib/format";
import {
  DecisionTag,
  MilestoneStatusTag,
  OriginTag,
} from "@/shared/ui/DomainTags";
import { ContractSideLayout } from "@/shared/ui/ContractSideLayout";
import { PageState } from "@/shared/ui/PageState";
import { Panel } from "@/shared/ui/Panel";
import {
  TechnicalDetails,
  TechnicalList,
  TrackingCode,
} from "@/shared/ui/TechnicalInfo";
import { ToneTag, type Tone } from "@/shared/ui/ToneTag";
import styles from "./MilestoneDecisionPage.module.css";

const outcomeColor: Record<RuleOutcome, string> = {
  NOT_MATCHED: "default",
  MATCHED: "success",
  NOT_EVALUATED: "default",
};

/** `EVENT:INVOICE` → "Hoá đơn", `APPROVAL_QUORUM:2` → "Đủ 2 vai trò phê duyệt". */
function tokenText(t: TFunction, token: string) {
  const [kind, arg] = token.split(":");
  if (kind === "EVENT") return t("domain:eventType." + arg);
  if (kind === "APPROVAL_QUORUM")
    return t("milestones:decision.tokens.quorum", { count: Number(arg) });
  return t(`milestones:decision.tokens.${kind}`, { defaultValue: token });
}

/** Milestone decision with its full trace: rule, facts, events, amounts and status history (spec 14.5). */
export default function MilestoneDecisionPage() {
  const { t } = useTranslation("milestones");
  const { t: td } = useTranslation("domain");
  const params = useParams();
  const contractId = params.contractId ?? "";
  const sequence = Number(params.milestoneNo);
  const view = useQuery({
    queryKey: ["milestones", "decision", contractId, sequence],
    queryFn: () => getMilestoneDetail(contractId, sequence),
  });
  const data = view.data;
  return (
    <AppPage
      guide="decision"
      active="contracts"
      breadcrumb={[
        { label: contractId, to: `/contracts/${contractId}` },
        {
          label: data
            ? t("decision.breadcrumb", {
                no: sequence,
                name: td(`milestoneType.${data.milestone.type}`),
              })
            : String(sequence),
        },
      ]}
    >
      {view.isPending ? <PageState kind="loading" /> : null}
      {view.isError ? (
        <PageState kind="error" onRetry={() => void view.refetch()} />
      ) : null}
      {data ? <DecisionContent data={data} /> : null}
    </AppPage>
  );
}

function DecisionContent({ data }: { data: MilestoneDetail }) {
  const { t, i18n } = useTranslation("milestones");
  const { t: td } = useTranslation("domain");
  const { t: tc } = useTranslation("common");
  const { message } = AntApp.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { contract, milestone, evaluation, money, actions } = data;
  const base = `/contracts/${contract.id}/milestones/${milestone.sequence}`;
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["milestones"] });
  const failed = (error: unknown) =>
    message.error(
      td(`errors.${error instanceof ApiError ? error.code : "UNKNOWN"}`, {
        defaultValue: td("errors.UNKNOWN"),
      }),
    );
  const transfer = useMutation({
    mutationFn: () =>
      transferToAccounting({
        contractId: contract.id,
        sequence: milestone.sequence,
      }),
    onSuccess: async () => {
      message.success(t("decision.transferred"));
      await refresh();
    },
    onError: failed,
  });

  return (
    <ContractSideLayout
      contractId={contract.id}
      focus={`${td("milestoneNo", { no: milestone.sequence })} · ${td(`milestoneType.${milestone.type}`)}`}
    >
      <Space direction="vertical" size={20} style={{ width: "100%" }}>
        <Panel as="div" className={styles.banner}>
          <div className={styles.bannerText}>
            <div className={styles.bannerMeta}>
              {t("decision.meta", {
                contractId: contract.id,
                title: contractTitle(contract),
                supplier: contract.supplier.name,
              })}{" "}
              · {contract.buyer.name}
            </div>
            <div className={styles.bannerHeadline}>
              <h2>{td(`reason.${evaluation.reasonCode}`)}</h2>
              <DecisionTag decision={evaluation.decision} />
              <MilestoneStatusTag status={milestone.status} />
            </div>
            <Space size={12} wrap>
              <TrackingCode code={milestone.id} />
              <TrackingCode code={evaluation.reasonCode} />
            </Space>
            <div className={styles.bannerSummary}>
              {t("decision.summaryLine", {
                rule: evaluation.ruleId,
                payable: formatDecimalString(evaluation.payableMillion),
                penalty: formatDecimalString(evaluation.penaltyMillion),
              })}
            </div>
            <Typography.Text>
              {t("decision.next")} <b>{describeNext(td, milestone.next)}</b>
            </Typography.Text>
            <TechnicalDetails
              items={[
                {
                  key: "run",
                  label: tc("technical.run"),
                  value: t("decision.runLine", {
                    run: evaluation.runId,
                    at: formatDateTime(evaluation.evaluatedAt),
                    spec: evaluation.specVersion,
                    confidence: evaluation.confidence,
                  }),
                },
                {
                  key: "source",
                  label: tc("technical.source"),
                  value: <OriginTag origin={milestone.origin} />,
                },
              ]}
            />
          </div>
          <div className={styles.bannerActions}>
            <Space wrap>
              {actions.submit ? (
                <Button
                  type="primary"
                  onClick={() =>
                    navigate(
                      `/submissions/${contract.id}/${milestone.sequence}`,
                    )
                  }
                >
                  {t("decision.actions.submit")}
                </Button>
              ) : null}
              {actions.approve || actions.reject ? (
                <Button
                  type="primary"
                  onClick={() =>
                    navigate(`/approvals/${contract.id}/${milestone.sequence}`)
                  }
                >
                  {t("decision.actions.approve")}
                </Button>
              ) : null}
              {actions.resolveDispute || actions.openDispute ? (
                <Button
                  {...(actions.resolveDispute
                    ? { color: "green" as const, variant: "solid" as const }
                    : {
                        color: "orange" as const,
                        variant: "outlined" as const,
                      })}
                  onClick={() => navigate(`${base}/dispute`)}
                >
                  {actions.resolveDispute
                    ? t("decision.actions.resolveDispute")
                    : t("decision.actions.openDispute")}
                </Button>
              ) : null}
              {actions.transfer ? (
                <Button
                  color="green"
                  variant="solid"
                  loading={transfer.isPending}
                  onClick={() => transfer.mutate()}
                  data-testid="transfer-payment"
                >
                  {t("decision.actions.transfer")}
                </Button>
              ) : null}
              <Button onClick={() => window.print()}>
                {t("decision.actions.export")}
              </Button>
            </Space>
          </div>
        </Panel>

        {data.payment ? (
          <Alert
            type="success"
            showIcon
            title={t("decision.payment.title", {
              amount: formatDecimalString(data.payment.amountMillion),
              by: data.payment.transferredBy,
              at: formatDateTime(data.payment.transferredAt),
            })}
            description={t("decision.payment.body", { id: data.payment.id })}
          />
        ) : null}
        {evaluation.issues.length || evaluation.notes.length ? (
          <Alert
            type="warning"
            showIcon
            title={t("decision.issues")}
            description={[...evaluation.issues, ...evaluation.notes].join(
              " · ",
            )}
          />
        ) : null}

        <Row gutter={[20, 20]}>
          <Col xs={24}>
            <Panel className={styles.panel}>
              <h2>{t("decision.conditions.title")}</h2>
              <Space direction="vertical" size={6} style={{ width: "100%" }}>
                {evaluation.conditionsMet.map((token) => (
                  <span key={token}>
                    <CheckCircleFilled
                      style={{ color: "var(--color-success-strong)" }}
                    />{" "}
                    {tokenText(t, token)}
                  </span>
                ))}
                {evaluation.missingConditions.map((token) => (
                  <span key={token}>
                    <CloseCircleFilled
                      style={{ color: "var(--color-danger-strong)" }}
                    />{" "}
                    {tokenText(t, token)}
                  </span>
                ))}
              </Space>
              <Descriptions
                size="small"
                column={1}
                style={{ marginTop: 16 }}
                items={[
                  {
                    key: "events",
                    label: t("decision.facts.requiredEvents"),
                    children: `${milestone.requirements.filter((r) => r.state === "VALID").length}/${milestone.requirements.length}`,
                  },
                  {
                    key: "missing",
                    label: t("decision.facts.missing"),
                    children:
                      evaluation.missing
                        .map((type) => td(`eventType.${type}`))
                        .join(", ") || "—",
                  },
                  {
                    key: "unauthorized",
                    label: t("decision.facts.unauthorized"),
                    children: evaluation.unauthorized.join(", ") || "0",
                  },
                  {
                    key: "duplicates",
                    label: t("decision.facts.duplicates"),
                    children:
                      evaluation.duplicates
                        .map(([dup, of]) => `${dup} → ${of}`)
                        .join(", ") || "0",
                  },
                  {
                    key: "dispute",
                    label: t("decision.facts.openDispute"),
                    children:
                      evaluation.openDisputeIds.join(", ") ||
                      t("decision.facts.none"),
                  },
                  {
                    key: "rejections",
                    label: t("decision.facts.rejections"),
                    children: evaluation.validRejectionCount,
                  },
                  {
                    key: "approvals",
                    label: t("decision.facts.approvals"),
                    children: evaluation.approvalRequired
                      ? t("decision.facts.approvalValue", {
                          done: evaluation.validApprovalCount,
                          quorum: evaluation.quorum,
                          roles: milestone.approvalRoles
                            .map((role) => td(`approvalRole.${role}`))
                            .join(", "),
                        })
                      : t("decision.facts.noApproval"),
                  },
                  {
                    key: "voided",
                    label: t("decision.facts.voided"),
                    children: evaluation.voided.join(", ") || "0",
                  },
                ]}
              />
            </Panel>
          </Col>
          <Col xs={24}>
            <Panel className={styles.panel}>
              <h2>{t("decision.amounts.title")}</h2>
              <Descriptions
                size="small"
                column={1}
                items={[
                  {
                    key: "planned",
                    label: t("decision.amounts.milestoneValue"),
                    children: formatDecimalString(money.plannedMillion),
                  },
                  {
                    key: "due",
                    label: t("decision.amounts.deadline"),
                    children: money.dueDate
                      ? t("decision.amounts.deadlineValue", {
                          due: formatDate(money.dueDate),
                          grace: money.graceDays,
                          deadline: formatDate(money.deadline),
                        })
                      : t("decision.amounts.noDue"),
                  },
                  {
                    key: "completed",
                    label: t("decision.amounts.completed"),
                    children: money.completedAt
                      ? formatDateTime(money.completedAt)
                      : t("decision.amounts.notCompleted"),
                  },
                  {
                    key: "late",
                    label: t("decision.amounts.lateDays"),
                    children: t("decision.amounts.lateDaysValue", {
                      count: money.daysLate,
                    }),
                  },
                  {
                    key: "rate",
                    label: t("decision.amounts.rate"),
                    children: money.latePenalty
                      ? t("decision.amounts.rateValue", {
                          rate: money.penaltyRatePct,
                          cap: money.maxPenaltyPct,
                          capAmount: formatDecimalString(money.capMillion),
                        })
                      : t("decision.amounts.noPenalty"),
                  },
                  {
                    key: "raw",
                    label: t("decision.amounts.raw"),
                    children: money.rawPenaltyMillion,
                  },
                  {
                    key: "penalty",
                    label: t("decision.amounts.penalty"),
                    children: (
                      <b>{formatDecimalString(money.penaltyMillion)}</b>
                    ),
                  },
                  {
                    key: "payable",
                    label: t("decision.amounts.payable"),
                    children: (
                      <b>{formatDecimalString(money.payableMillion)}</b>
                    ),
                  },
                ]}
              />
              <div className={styles.panelNote}>
                {t("decision.amounts.note")}
              </div>
            </Panel>
          </Col>
          <Col xs={24}>
            <Panel className={styles.panel}>
              <h2>
                {t("decision.rules.title", {
                  scope: milestone.releaseRuleCode,
                })}
              </h2>
              <Table
                size="small"
                rowKey="id"
                pagination={false}
                dataSource={data.rules}
                scroll={{ x: "max-content" }}
                rowClassName={(rule) =>
                  rule.outcome === "MATCHED" ? "codecash-row-selected" : ""
                }
                columns={[
                  {
                    key: "priority",
                    title: t("decision.rules.priority"),
                    render: (_, r) => <b>{r.priority}</b>,
                  },
                  {
                    key: "id",
                    title: t("decision.rules.rule"),
                    render: (_, r) => <TrackingCode code={r.id} />,
                  },
                  {
                    key: "condition",
                    title: t("decision.rules.condition"),
                    // Business wording first; the Data Pack expression stays in the tooltip.
                    render: (_, r) => (
                      <Tooltip
                        title={
                          <Typography.Text code style={{ color: "inherit" }}>
                            {r.condition}
                          </Typography.Text>
                        }
                      >
                        <span>
                          {td(`ruleCondition.${r.reasonCode}`, {
                            defaultValue: i18n.language.startsWith("vi")
                              ? r.description
                              : r.name,
                          })}
                        </span>
                      </Tooltip>
                    ),
                  },
                  {
                    key: "decision",
                    title: t("decision.rules.decision"),
                    render: (_, r) => <DecisionTag decision={r.decision} />,
                  },
                  {
                    key: "reason",
                    title: t("decision.rules.reason"),
                    render: (_, r) => td(`reason.${r.reasonCode}`),
                  },
                  {
                    key: "formula",
                    title: t("decision.rules.formula"),
                    render: (_, r) => (
                      <Typography.Text
                        type="secondary"
                        style={{ fontSize: 12 }}
                      >
                        {r.payableFormula} / {r.penaltyFormula}
                      </Typography.Text>
                    ),
                  },
                  {
                    key: "outcome",
                    title: t("decision.rules.outcome"),
                    render: (_, r) => (
                      <Tag color={outcomeColor[r.outcome]}>
                        {td(`ruleOutcome.${r.outcome}`)}
                      </Tag>
                    ),
                  },
                ]}
              />
            </Panel>
          </Col>
          <Col xs={24}>
            <Panel className={styles.panel}>
              <h2>
                {t("decision.events.title", { count: data.events.length })}
              </h2>
              <EventTable events={data.events} evidence={evaluation.evidence} />
            </Panel>
          </Col>
          <Col xs={24}>
            <ReplayPanel
              contractId={contract.id}
              sequence={milestone.sequence}
            />
          </Col>
          <Col xs={24}>
            <Panel className={styles.panel}>
              <h2>{t("decision.history.title")}</h2>
              <Timeline
                items={[...data.history].reverse().map((change) => ({
                  key: change.id,
                  color:
                    change.to.decision === "REJECT"
                      ? "red"
                      : change.to.decision === "HOLD"
                        ? "orange"
                        : "green",
                  children: (
                    <>
                      <Typography.Text type="secondary">
                        {formatDateTime(change.at)}
                      </Typography.Text>
                      <div>
                        {change.from
                          ? `${td(`status.${change.from.status}`)} → `
                          : ""}
                        <b>{td(`status.${change.to.status}`)}</b> ·{" "}
                        {td(`reason.${change.to.reasonCode}`)}
                      </div>
                      <Typography.Text
                        type="secondary"
                        style={{ fontSize: 12 }}
                      >
                        {td(`trigger.${change.trigger.kind}`)}
                        {"actorName" in change.trigger
                          ? ` · ${change.trigger.actorName}`
                          : ""}
                        {change.trigger.kind === "EVENTS"
                          ? ` · ${change.trigger.eventIds.join(", ")}`
                          : ""}
                      </Typography.Text>
                    </>
                  ),
                }))}
              />
              <div className={styles.panelNote}>
                {t("decision.history.note")}
              </div>
            </Panel>
          </Col>
          <Col xs={24}>
            <ExceptionPanel data={data} onChanged={refresh} />
          </Col>
        </Row>

        <Panel as="div" className={styles.dispute}>
          <b className={styles.disputeTitle}>{t("decision.dispute.title")}</b>
          <span className={styles.disputeText}>
            {t("decision.dispute.body")}
          </span>
          <Link to={`${base}/dispute`} className={styles.disputeLink}>
            {t("decision.dispute.link")}
          </Link>
        </Panel>
      </Space>
    </ContractSideLayout>
  );
}

function EventTable({
  events,
  evidence,
}: {
  events: ClassifiedEvent[];
  evidence: string[];
}) {
  const { t } = useTranslation("milestones");
  const { t: td } = useTranslation("domain");
  const { t: tc } = useTranslation("common");
  return (
    <Table<ClassifiedEvent>
      size="small"
      rowKey="id"
      dataSource={events}
      pagination={false}
      scroll={{ x: "max-content" }}
      expandable={{
        expandedRowRender: (e) => (
          <TechnicalList
            items={[
              {
                key: "source",
                label: tc("technical.source"),
                value: <OriginTag origin={e.origin} />,
              },
              {
                key: "document",
                label: tc("technical.document"),
                value: e.documentId,
              },
              {
                key: "channel",
                label: tc("technical.channel"),
                value: e.source,
              },
              {
                key: "party",
                label: tc("technical.party"),
                value: e.actor.partyId,
              },
            ]}
          />
        ),
      }}
      columns={[
        {
          key: "at",
          title: t("detail.events.at"),
          render: (_, e) => formatDateTime(e.at),
        },
        {
          key: "type",
          title: t("detail.events.type"),
          render: (_, e) => (
            <>
              <Space size={4} wrap>
                <b>{td(`eventType.${e.type}`)}</b>
                <Tag style={{ margin: 0 }}>{td(`eventStatus.${e.status}`)}</Tag>
              </Space>
              <div>
                <TrackingCode code={e.id} />
              </div>
            </>
          ),
        },
        {
          key: "actor",
          title: t("detail.events.actor"),
          render: (_, e) => (
            <>
              <div>{actorName(td, e.actor)}</div>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {[
                  e.actor.type ? td(`partyType.${e.actor.type}`) : "",
                  e.actor.approvalRole
                    ? td(`approvalRole.${e.actor.approvalRole}`)
                    : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Typography.Text>
            </>
          ),
        },
        {
          key: "class",
          title: t("decision.events.classification"),
          render: (_, e) => (
            <Space size={4} wrap>
              <ToneTag tone={eventClassTone[e.classification]}>
                {td(`eventClass.${e.classification}`)}
              </ToneTag>
              {e.duplicateOf ? (
                <Typography.Text type="secondary">
                  → {e.duplicateOf}
                </Typography.Text>
              ) : null}
              {evidence.includes(e.id) ? (
                <Tag color="green">{t("decision.events.inEvidence")}</Tag>
              ) : null}
            </Space>
          ),
        },
        {
          key: "document",
          title: t("detail.events.document"),
          render: (_, e) => (
            <>
              {e.fileName ?? "—"}
              {e.referenceEventId ? (
                <div style={{ fontSize: 12 }}>
                  {t("detail.events.reference", { id: e.referenceEventId })}
                </div>
              ) : null}
            </>
          ),
        },
      ]}
    />
  );
}

const replayTone: Record<TimelinePoint["status"], Tone> = {
  ...statusTone,
  PLANNED: "neutral",
  IN_PROGRESS: "primary",
};
const isZero = (amount: string) => /^0(\.0+)?$/.test(amount);

/** The engine replayed after each event of the milestone (as-of, BR-16): how the decision came about. */
function ReplayPanel({
  contractId,
  sequence,
}: {
  contractId: string;
  sequence: number;
}) {
  const { t } = useTranslation("milestones");
  const { t: td } = useTranslation("domain");
  const [requested, setRequested] = useState(false);
  const replay = useQuery({
    queryKey: ["milestones", "timeline", contractId, sequence],
    queryFn: () => getMilestoneTimeline(contractId, sequence),
    enabled: requested,
  });
  return (
    <Panel className={styles.panel}>
      <Space
        wrap
        style={{ width: "100%", justifyContent: "space-between" }}
        align="center"
      >
        <h2>{t("decision.replay.title")}</h2>
        <Button
          loading={replay.isFetching}
          onClick={() =>
            requested ? void replay.refetch() : setRequested(true)
          }
          data-testid="replay-timeline"
        >
          {t(requested ? "decision.replay.again" : "decision.replay.run")}
        </Button>
      </Space>
      <Typography.Paragraph type="secondary">
        {t("decision.replay.body")}
      </Typography.Paragraph>
      {replay.isError ? (
        <Alert type="error" showIcon title={t("decision.replay.error")} />
      ) : null}
      {replay.data ? (
        <div data-testid="replay-table">
          <Table<TimelinePoint>
            size="small"
            rowKey="at"
            pagination={false}
            scroll={{ x: "max-content" }}
            dataSource={replay.data}
            locale={{ emptyText: t("decision.replay.empty") }}
            columns={[
              {
                key: "at",
                title: t("decision.replay.columns.at"),
                render: (_, p) => formatDateTime(p.at),
              },
              {
                key: "events",
                title: t("decision.replay.columns.events"),
                render: (_, p) =>
                  p.events.map((e) => (
                    <div key={e.id}>
                      <b>{td(`eventType.${e.type}`)}</b> ·{" "}
                      {actorName(td, e.actor)}{" "}
                      <Typography.Text
                        type="secondary"
                        style={{ fontSize: 12 }}
                      >
                        {e.id}
                      </Typography.Text>
                    </div>
                  )),
              },
              {
                key: "decision",
                title: t("decision.replay.columns.decision"),
                render: (_, p) => <DecisionTag decision={p.decision} />,
              },
              {
                key: "status",
                title: t("decision.replay.columns.status"),
                render: (_, p) => (
                  <Space direction="vertical" size={2}>
                    <ToneTag tone={replayTone[p.status]}>
                      {td(`status.${p.status}`)}
                    </ToneTag>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {td(`reason.${p.reasonCode}`)} · {p.ruleId}
                    </Typography.Text>
                  </Space>
                ),
              },
              {
                key: "approvals",
                title: t("decision.replay.columns.approvals"),
                render: (_, p) =>
                  p.approvals.quorum
                    ? `${p.approvals.valid}/${p.approvals.quorum}`
                    : "—",
              },
              {
                key: "missing",
                title: t("decision.replay.columns.missing"),
                render: (_, p) =>
                  p.missing.length
                    ? p.missing
                        .map((type) => td(`eventType.${type}`))
                        .join(", ")
                    : "—",
              },
              {
                key: "amounts",
                title: t("decision.replay.columns.amounts"),
                render: (_, p) =>
                  p.decision === "RELEASE" || p.decision === "PENALTY" ? (
                    <>
                      {formatDecimalString(p.payableMillion)}
                      {isZero(p.penaltyMillion) ? null : (
                        <Typography.Text type="danger">
                          {" "}
                          −{formatDecimalString(p.penaltyMillion)}
                        </Typography.Text>
                      )}
                    </>
                  ) : (
                    "—"
                  ),
              },
            ]}
          />
        </div>
      ) : null}
      <div className={styles.panelNote}>{t("decision.replay.note")}</div>
    </Panel>
  );
}

/** BR-19: one controller proposes to void an unauthorised event, a second one decides (SoD-2). */
function ExceptionPanel({
  data,
  onChanged,
}: {
  data: MilestoneDetail;
  onChanged: () => Promise<unknown>;
}) {
  const { t } = useTranslation("milestones");
  const { t: td } = useTranslation("domain");
  const { message } = AntApp.useApp();
  const user = useCurrentUser();
  const [eventId, setEventId] = useState<string>();
  const [reason, setReason] = useState("");
  const controller = user.role === "ADMIN_AUDITOR";
  const candidates = data.events.filter(
    (e) =>
      e.classification === "UNAUTHORIZED" &&
      !data.exceptions.some(
        (x) => x.eventId === e.id && x.status !== "REJECTED",
      ),
  );
  const failed = (error: unknown) =>
    message.error(
      td(`errors.${error instanceof ApiError ? error.code : "UNKNOWN"}`, {
        defaultValue: td("errors.UNKNOWN"),
      }),
    );
  const propose = useMutation({
    mutationFn: () =>
      proposeException({
        contractId: data.contract.id,
        sequence: data.milestone.sequence,
        eventId: eventId ?? "",
        reason,
      }),
    onSuccess: async () => {
      message.success(t("decision.exceptions.proposed"));
      setReason("");
      setEventId(undefined);
      await onChanged();
    },
    onError: failed,
  });
  const decide = useMutation({
    mutationFn: (input: { request: ExceptionRequest; approve: boolean }) =>
      decideException({
        exceptionId: input.request.id,
        approve: input.approve,
      }),
    onSuccess: async () => {
      message.success(t("decision.exceptions.decided"));
      await onChanged();
    },
    onError: failed,
  });
  return (
    <Panel className={styles.panel}>
      <h2>{t("decision.exceptions.title")}</h2>
      <Typography.Paragraph type="secondary">
        {t("decision.exceptions.body")}
      </Typography.Paragraph>
      {data.exceptions.length ? (
        data.exceptions.map((request) => (
          <div
            key={request.id}
            style={{
              padding: "8px 0",
              borderTop: "1px solid var(--border-divider)",
            }}
          >
            <Space size={6} wrap>
              <Tag
                color={
                  request.status === "APPROVED"
                    ? "success"
                    : request.status === "REJECTED"
                      ? "error"
                      : "processing"
                }
              >
                {t(`decision.exceptions.state.${request.status}`)}
              </Tag>
              <span>
                {t("decision.exceptions.voidEvent", { id: request.eventId })}
              </span>
            </Space>
            <div style={{ fontSize: 13 }}>
              {t("decision.exceptions.proposedBy", {
                name: request.proposedBy.name,
                at: formatDateTime(request.proposedAt),
              })}{" "}
              · {request.reason}
            </div>
            {request.decidedBy ? (
              <div style={{ fontSize: 13 }}>
                {t("decision.exceptions.decidedBy", {
                  name: request.decidedBy.name,
                  at: formatDateTime(request.decidedAt ?? ""),
                })}
              </div>
            ) : null}
            {controller && request.status === "PROPOSED" ? (
              request.proposedBy.userId === user.id ? (
                <Typography.Text type="secondary">
                  {t("decision.exceptions.waitSecond")}
                </Typography.Text>
              ) : (
                <Space style={{ marginTop: 6 }}>
                  <Button
                    size="small"
                    color="green"
                    variant="solid"
                    loading={decide.isPending}
                    onClick={() => decide.mutate({ request, approve: true })}
                    data-testid="exception-approve"
                  >
                    {t("decision.exceptions.approve")}
                  </Button>
                  <Button
                    size="small"
                    danger
                    loading={decide.isPending}
                    onClick={() => decide.mutate({ request, approve: false })}
                  >
                    {t("decision.exceptions.reject")}
                  </Button>
                </Space>
              )
            ) : null}
          </div>
        ))
      ) : (
        <Typography.Text type="secondary">
          {t("decision.exceptions.none")}
        </Typography.Text>
      )}
      {controller && data.actions.proposeException ? (
        <Space direction="vertical" style={{ width: "100%", marginTop: 12 }}>
          <Select
            placeholder={t("decision.exceptions.pick")}
            value={eventId}
            onChange={setEventId}
            options={candidates.map((e) => ({
              value: e.id,
              label: `${e.id} · ${td(`eventType.${e.type}`)} · ${actorName(td, e.actor)}`,
            }))}
            data-testid="exception-event"
          />
          <DemoFillButton
            disabled={!!reason.trim()}
            onClick={() => setReason(t("decision.exceptions.demoReason"))}
          />
          <Input.TextArea
            rows={2}
            value={reason}
            maxLength={2000}
            showCount
            placeholder={t("decision.exceptions.reason")}
            onChange={(event) => setReason(event.target.value)}
            data-testid="exception-reason"
          />
          <Button
            color="orange"
            variant="outlined"
            disabled={!eventId || !reason.trim()}
            loading={propose.isPending}
            onClick={() => propose.mutate()}
            data-testid="exception-propose"
          >
            {t("decision.exceptions.propose")}
          </Button>
        </Space>
      ) : null}
    </Panel>
  );
}
