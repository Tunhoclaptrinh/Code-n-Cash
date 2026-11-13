import { ContractDocuments } from "@/shared/ui/ContractDocuments";
import { ContractSideLayout } from "@/shared/ui/ContractSideLayout";
import { PageContainer } from "@codecash/ui";
import { ContractLifecycleSteps } from "../components/ContractLifecycleSteps";
import { EvidenceDocumentLink } from "../components/EvidenceDocumentLink";
import { LiquidationPanel } from "../components/LiquidationPanel";
import {
  AmendmentFormModal,
  AmendmentsPanel,
  ContractNotices,
} from "../components/AmendmentsPanel";
import { SmartContractPanel } from "../components/SmartContractPanel";
import { WaitingOnLine } from "../components/PendingItems";
import {
  Button,
  Segmented,
  Space,
  Table,
  Tabs,
  Tag,
  Timeline,
  Tooltip,
  Typography,
} from "antd";
import {
  CheckCircleFilled,
  CloseCircleFilled,
  ExclamationCircleFilled,
  FileSearchOutlined,
  RightOutlined,
  HistoryOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import type {
  ContractOverview,
  EventRow,
  MilestoneRow,
  MilestoneStatus,
  Requirement,
  Role,
  Side,
  TimelineEntry,
} from "@codecash/contracts";
import { getContractOverview } from "@/shared/api/domain";
import { useCurrentUser } from "@/shared/auth/session";
import { useDemoMode } from "@/shared/auth/useDemoMode";
import { AppPage } from "@/shared/layout/AppPage";
import {
  actorName,
  contractHeading,
  describeNext,
  peopleOf,
} from "@/shared/lib/domain";
import {
  formatDate,
  formatDateTime,
  formatDecimalString,
} from "@/shared/lib/format";
import { initialsOf, organizationInitials } from "@/shared/lib/initials";
import {
  ContractStatusTag,
  MilestoneStatusTag,
  OriginTag,
} from "@/shared/ui/DomainTags";
import { ActionBar } from "@/shared/ui/ActionBar";
import { PageState } from "@/shared/ui/PageState";
import { Panel } from "@/shared/ui/Panel";
import { TechnicalDetails, TrackingCode } from "@/shared/ui/TechnicalInfo";
import styles from "./ContractDetailPage.module.css";

type TabKey =
  | "documents"
  | "milestones"
  | "smart"
  | "events"
  | "history"
  | "signing"
  | "amendments"
  | "liquidation"
  | "participants";
type Emphasis = "done" | "attention" | "danger" | "active";

const emphasisOf: Record<MilestoneStatus, Emphasis> = {
  ELIGIBLE_FOR_PAYMENT: "done",
  COMPLETED: "done",
  PAID_WITH_PENALTY: "attention",
  ON_HOLD: "attention",
  REJECTED: "danger",
  WAITING_EVIDENCE: "active",
  WAITING_APPROVAL: "active",
};
const markerClass: Record<Emphasis, string> = {
  done: styles.markerDone,
  attention: styles.markerAttention,
  danger: styles.markerDanger,
  active: styles.markerActive,
};
const cardClass: Record<Emphasis, string> = {
  done: "",
  attention: styles.cardAttention,
  danger: styles.cardDanger,
  active: styles.cardActive,
};

/**
 * What the signed-in user can do about a milestone, as a button. A UI hint only: the API checks
 * the same rules again (spec 4.2 and 17) before recording anything.
 */
function actionFor(row: MilestoneRow, role: Role) {
  const step = row.next;
  if (step.kind === "SUBMIT") {
    const mine =
      (step.side === "SUPPLIER" && role === "SUPPLIER") ||
      (step.side === "BUYER" && role === "LEGAL_REVIEWER");
    return mine ? ("submit" as const) : null;
  }
  if (step.kind === "APPROVE")
    return step.roles.includes(role as never) ? ("approve" as const) : null;
  if (step.kind === "RESOLVE_DISPUTE")
    return role === "CONTRACT_OWNER" || role === "LEGAL_REVIEWER"
      ? ("dispute" as const)
      : null;
  if (step.kind === "TRANSFER" && role === "FINANCE_APPROVER")
    return "transfer" as const;
  if (step.kind === "REVIEW_EXCEPTION" && role === "CONTRACT_OWNER")
    return "exception" as const;
  return null;
}

export default function ContractDetailPage() {
  const { t } = useTranslation("milestones");
  const { t: tc } = useTranslation("common");
  const { t: td } = useTranslation("domain");
  const navigate = useNavigate();
  const contractId = useParams().contractId ?? "";
  // A task can open a tab directly (?tab=amendments for an amendment to review).
  const [search] = useSearchParams();
  const [tab, setTab] = useState<TabKey>(() => {
    const requested = search.get("tab");
    return requested === "amendments" || requested === "liquidation"
      ? requested
      : "milestones";
  });
  const [amending, setAmending] = useState(false);
  const overview = useQuery({
    queryKey: ["milestones", "overview", contractId],
    queryFn: () => getContractOverview(contractId),
  });
  const data = overview.data;
  const contract = data?.contract;

  return (
    <AppPage
      guide="contracts"
      active="contracts"
      breadcrumb={[
        { label: tc("nav.contracts"), to: "/contracts" },
        {
          label: contract
            ? contractHeading(contract)
            : t("detail.breadcrumb", { contractId }),
        },
      ]}
      tags={
        contract ? (
          <>
            <ContractStatusTag status={contract.status} />
            <OriginTag origin={contract.origin} />
            {contract.openDispute ? (
              <Tag color="error" style={{ margin: 0 }}>
                {t("detail.disputeFlag")}
              </Tag>
            ) : null}
          </>
        ) : undefined
      }
      extra={
        contract ? (
          // The guide button sits beside this bar, so two more actions already fold.
          <ActionBar
            testId="contract-actions"
            foldFrom={2}
            actions={[
              ...(contract.status === "AWAITING_SIGNATURE"
                ? [
                    {
                      key: "signing",
                      label: t("detail.actions.signing"),
                      pinned: true,
                      button: { type: "primary" } as const,
                      onClick: () =>
                        navigate(`/contracts/${contract.id}/signing`),
                    },
                  ]
                : []),
              ...(contract.signing
                ? [
                    {
                      key: "verify",
                      label: t("detail.actions.verify"),
                      icon: <SafetyCertificateOutlined />,
                      onClick: () => navigate(`/verify/${contract.id}`),
                      testId: "contract-verify",
                    },
                  ]
                : []),
              ...(data?.canProposeAmendment
                ? [
                    {
                      key: "amend",
                      label: t("amendments.propose"),
                      onClick: () => setAmending(true),
                      testId: "contract-amend",
                    },
                  ]
                : []),
              {
                key: "activity",
                label: t("detail.actions.activity"),
                icon: <HistoryOutlined />,
                onClick: () =>
                  navigate(`/activity-log?contract=${contract.id}`),
                testId: "contract-activity",
              },
            ]}
          />
        ) : undefined
      }
      contentClassName={styles.page}
    >
      {overview.isPending ? <PageState kind="loading" /> : null}
      {overview.isError ? (
        <PageState kind="error" onRetry={() => void overview.refetch()} />
      ) : null}
      {data && contract ? (
        <PageContainer>
          <ContractNotices
            notices={data.notices}
            onAmend={
              data.canProposeAmendment ? () => setAmending(true) : undefined
            }
            onLiquidate={
              data.canProposeLiquidation
                ? () => setTab("liquidation")
                : undefined
            }
          />
          <AmendmentFormModal
            open={amending}
            data={data}
            onClose={() => setAmending(false)}
            onSubmitted={() => setTab("amendments")}
          />
          <Tabs
            className={styles.tabs}
            items={(
              [
                "documents",
                "milestones",
                "smart",
                "events",
                "history",
                "signing",
                ...(contract.signing ? ["amendments"] : []),
                // The organiser's contracts are not liquidated in the app.
                ...(contract.signing && contract.origin !== "DATA_PACK"
                  ? ["liquidation"]
                  : []),
                "participants",
              ] as TabKey[]
            ).map((key) => ({
              key,
              label: t(`detail.tabs.${key}`, {
                count:
                  key === "events"
                    ? data.events.length
                    : key === "milestones"
                      ? data.milestones.length
                      : key === "amendments"
                        ? data.amendments.length
                        : 0,
              }),
            }))}
            activeKey={tab}
            onChange={(key) => setTab(key as TabKey)}
          />
          {tab === "documents" ? (
            <ContractDocuments contractId={contract.id} />
          ) : null}
          {tab === "milestones" ? (
            <ContractSideLayout contractId={contract.id}>
              <div className={styles.grid}>
                <div className={styles.sidebar}>
                  <PaymentOverview data={data} />
                  <Panel className={`${styles.sideCard} ${styles.people}`}>
                    <h2>{t("detail.terms.title")}</h2>
                    <TermRow
                      label={t("detail.terms.policy")}
                      value={td(`policy.${contract.approvalPolicy}`)}
                    />
                    <TermRow
                      label={t("detail.terms.period")}
                      value={`${formatDate(contract.startDate)} – ${formatDate(contract.endDate)}`}
                    />
                    <TermRow
                      label={t("detail.terms.penalty")}
                      value={t("detail.terms.penaltyValue", {
                        grace: data.graceDays,
                        rate: data.penaltyRatePct,
                        cap: data.maxPenaltyPct,
                      })}
                    />
                    <TechnicalDetails
                      items={[
                        {
                          key: "workflow",
                          label: t("detail.terms.workflow"),
                          value:
                            data.workflowName ??
                            td(`workflow.${data.workflowTemplate}`),
                        },
                        {
                          key: "ruleSet",
                          label: t("detail.terms.ruleSet"),
                          value: td(`ruleSet.${data.ruleSetId}`, {
                            defaultValue: data.ruleSetId,
                          }),
                        },
                      ]}
                    />
                  </Panel>
                </div>
                {data.milestones.length ? (
                  <MilestoneTimeline
                    milestones={data.milestones}
                    contractId={contract.id}
                  />
                ) : (
                  <Panel className={styles.tabPanel}>
                    <div className={styles.panelBody}>
                      <p className={styles.empty}>{t("detail.noMilestones")}</p>
                    </div>
                  </Panel>
                )}
              </div>
            </ContractSideLayout>
          ) : null}
          {tab === "events" ? (
            <EventsTable
              events={data.events}
              milestones={data.milestones}
              people={peopleOf(data.participants)}
            />
          ) : null}
          {tab === "history" ? (
            <Panel className={styles.tabPanel}>
              <ContractLifecycleSteps lifecycle={data.lifecycle} />
            </Panel>
          ) : null}
          {tab === "history" ? (
            <HistoryTimeline
              entries={data.timeline}
              milestones={data.milestones}
              people={peopleOf(data.participants)}
            />
          ) : null}
          {tab === "smart" ? (
            <SmartContractPanel contractId={contract.id} />
          ) : null}
          {tab === "signing" ? <SigningPanel data={data} /> : null}
          {tab === "liquidation" ? <LiquidationPanel data={data} /> : null}
          {tab === "amendments" ? (
            <AmendmentsPanel data={data} onPropose={() => setAmending(true)} />
          ) : null}
          {tab === "participants" ? (
            <Panel className={styles.tabPanel}>
              <div className={styles.panelBody}>
                <ParticipantRows data={data} />
              </div>
            </Panel>
          ) : null}
        </PageContainer>
      ) : null}
    </AppPage>
  );
}

/** A term reads as a sentence, so the label sits above its value instead of squeezing beside it. */
function TermRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.termRow}>
      <span className={styles.paymentLabel}>{label}</span>
      <b className={styles.termValue}>{value}</b>
    </div>
  );
}

function RequirementChip({ requirement }: { requirement: Requirement }) {
  const { t } = useTranslation("milestones");
  const { t: td } = useTranslation("domain");
  const icon =
    requirement.state === "VALID" ? (
      <CheckCircleFilled />
    ) : requirement.state === "UNAUTHORIZED" ? (
      <ExclamationCircleFilled />
    ) : (
      <CloseCircleFilled />
    );
  const color =
    requirement.state === "VALID"
      ? "success"
      : requirement.state === "UNAUTHORIZED"
        ? "error"
        : "default";
  return (
    <Tooltip
      title={t(`detail.requirement.${requirement.state}`, {
        side: td(`side.${requirement.side}`),
        at: requirement.at ? formatDateTime(requirement.at) : "",
        id: requirement.eventId ?? "",
      })}
    >
      <Tag icon={icon} color={color} style={{ margin: 0 }}>
        {td(`eventType.${requirement.eventType}`)}
      </Tag>
    </Tooltip>
  );
}

/** Milestones shown expanded when there are few; past that, only those that need something. */
const OPEN_ALL_UP_TO = 3;
type MilestoneFilter = "all" | "open" | "done";

/**
 * The contract's milestones as a timeline. With more than a few, finished milestones fold to one
 * line (status, due date, amount and the action stay visible); a filter and "expand all" keep a
 * long contract readable without hiding anything.
 */
function MilestoneTimeline({
  milestones,
  contractId,
}: {
  milestones: MilestoneRow[];
  contractId: string;
}) {
  const { t } = useTranslation("milestones");
  const done = (row: MilestoneRow) => emphasisOf[row.status] === "done";
  const [filter, setFilter] = useState<MilestoneFilter>("all");
  const [open, setOpen] = useState<Set<string>>(
    () =>
      new Set(
        milestones
          .filter((row) => milestones.length <= OPEN_ALL_UP_TO || !done(row))
          .map((row) => row.id),
      ),
  );
  const finished = milestones.filter(done).length;
  const shown = milestones.filter((row) =>
    filter === "all" ? true : filter === "done" ? done(row) : !done(row),
  );
  const allOpen = shown.every((row) => open.has(row.id));
  const toggle = (id: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <div className={styles.timelineWrap}>
      <div className={styles.timelineBar}>
        <Segmented<MilestoneFilter>
          size="small"
          value={filter}
          onChange={setFilter}
          options={[
            {
              value: "all",
              label: t("detail.timeline.all", { count: milestones.length }),
            },
            {
              value: "open",
              label: t("detail.timeline.open", {
                count: milestones.length - finished,
              }),
            },
            {
              value: "done",
              label: t("detail.timeline.done", { count: finished }),
            },
          ]}
          data-testid="milestone-filter"
        />
        <Button
          type="link"
          size="small"
          onClick={() =>
            setOpen(
              allOpen ? new Set() : new Set(milestones.map((row) => row.id)),
            )
          }
          data-testid="milestone-toggle-all"
        >
          {allOpen
            ? t("detail.timeline.collapseAll")
            : t("detail.timeline.expandAll")}
        </Button>
      </div>
      {shown.length ? (
        <ol className={styles.timeline}>
          {shown.map((row, index) => (
            <MilestoneItem
              key={row.id}
              row={row}
              contractId={contractId}
              isLast={index === shown.length - 1}
              open={open.has(row.id)}
              onToggle={() => toggle(row.id)}
            />
          ))}
        </ol>
      ) : (
        <p className={styles.empty}>{t(`detail.timeline.none.${filter}`)}</p>
      )}
    </div>
  );
}

function MilestoneItem({
  row,
  contractId,
  isLast,
  open,
  onToggle,
}: {
  row: MilestoneRow;
  contractId: string;
  isLast: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation("milestones");
  const { t: tl } = useTranslation("milestones", { keyPrefix: "detailLite" });
  const { t: td } = useTranslation("domain");
  const navigate = useNavigate();
  const user = useCurrentUser();
  const emphasis = emphasisOf[row.status];
  const action = actionFor(row, user.role);
  const decisionPath = `/contracts/${contractId}/milestones/${row.sequence}/decision`;
  const actionPath =
    action === "submit"
      ? `/submissions/${contractId}/${row.sequence}`
      : action === "approve"
        ? `/approvals/${contractId}/${row.sequence}`
        : action === "dispute"
          ? `/contracts/${contractId}/milestones/${row.sequence}/dispute`
          : decisionPath;

  return (
    <li className={styles.milestone} data-testid="milestone-item">
      <div className={styles.rail}>
        {isLast ? null : <span className={styles.railLine} />}
        <span className={`${styles.marker} ${markerClass[emphasis]}`}>
          {emphasis === "done"
            ? "✓"
            : emphasis === "attention" || emphasis === "danger"
              ? "!"
              : row.sequence}
        </span>
      </div>
      <Panel
        as="div"
        className={`${styles.milestoneCard} ${cardClass[emphasis]}`}
      >
        <div
          className={styles.cardHead}
          role="button"
          tabIndex={0}
          aria-expanded={open}
          onClick={onToggle}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onToggle();
            }
          }}
          data-testid="milestone-head"
        >
          <div className={styles.nameRow}>
            <RightOutlined
              className={styles.chevron}
              data-open={open || undefined}
              aria-hidden
            />
            <b className={styles.name}>
              {td("milestoneNo", { no: row.sequence })} ·{" "}
              {td(`milestoneType.${row.type}`)}
            </b>
            <MilestoneStatusTag status={row.status} />
            <TrackingCode code={row.id} />
          </div>
          <div className={styles.amountBlock}>
            <b className={styles.amount}>
              {formatDecimalString(row.plannedMillion)}
            </b>
            <span className={styles.amountUnit}>
              {t("detail.milestone.amountUnit")}
            </span>
          </div>
          {open ? null : (
            <div className={styles.foldedLine}>
              <span className={styles.due}>
                {row.dueDate
                  ? tl("due", { due: formatDate(row.dueDate) })
                  : t("detail.milestone.noDue")}{" "}
                · {td(`reason.${row.reasonCode}`)}
              </span>
              {action ? (
                <Button
                  type="primary"
                  size="small"
                  onClick={(event) => {
                    event.stopPropagation();
                    navigate(actionPath);
                  }}
                  data-testid={`milestone-action-${action}`}
                >
                  {t(`detail.milestone.action.${action}`)}
                </Button>
              ) : null}
            </div>
          )}
        </div>
        {open ? (
          <div className={styles.cardBody}>
            <div className={styles.info}>
              <div className={styles.meta}>
                <span className={styles.due}>
                  {row.dueDate
                    ? tl("due", { due: formatDate(row.dueDate) })
                    : t("detail.milestone.noDue")}
                  {row.completedAt && emphasis !== "done"
                    ? ` · ${t("detail.milestone.completed", { at: formatDate(row.completedAt) })}`
                    : ""}
                </span>
                {row.requirements.map((requirement) => (
                  <RequirementChip
                    key={requirement.eventType}
                    requirement={requirement}
                  />
                ))}
                {row.approvalRequired ? (
                  <Tag
                    color={
                      row.validApprovals >= row.quorum
                        ? "success"
                        : "processing"
                    }
                    style={{ margin: 0 }}
                  >
                    {t("detail.milestone.approvals", {
                      done: row.validApprovals,
                      quorum: row.quorum,
                    })}
                  </Tag>
                ) : null}
              </div>
              <div className={styles.fact}>
                <span className={styles.factLabel}>
                  {t("detail.milestone.reason")}{" "}
                </span>
                <b>{td(`reason.${row.reasonCode}`)}</b>
              </div>
              {(row.decision === "RELEASE" || row.decision === "PENALTY") &&
              Number(row.payableMillion) !== Number(row.plannedMillion) ? (
                <div className={styles.fact}>
                  <span className={styles.factLabel}>
                    {t("detail.milestone.payable")}{" "}
                  </span>
                  <b>{formatDecimalString(row.payableMillion)}</b>
                  {row.decision === "PENALTY" ? (
                    <Typography.Text type="warning">
                      {" "}
                      ·{" "}
                      {t("detail.milestone.penalty", {
                        penalty: formatDecimalString(row.penaltyMillion),
                        days: row.daysLate,
                      })}
                    </Typography.Text>
                  ) : null}
                </div>
              ) : null}
              <div className={styles.fact}>
                <span className={styles.factLabel}>
                  {t("detail.milestone.next")}{" "}
                </span>
                <WaitingOnLine
                  contractId={contractId}
                  sequence={row.sequence}
                  waitingOn={row.waitingOn}
                  fallback={<b>{describeNext(td, row.next)}</b>}
                />
              </div>
            </div>
            <div className={styles.side}>
              <Space size={6} wrap>
                {action ? (
                  <Button
                    type="primary"
                    size="small"
                    onClick={() => navigate(actionPath)}
                    data-testid={`milestone-action-${action}`}
                  >
                    {t(`detail.milestone.action.${action}`)}
                  </Button>
                ) : null}
                <Tooltip title={t("detail.milestone.trace")}>
                  <Button
                    size="small"
                    icon={<FileSearchOutlined />}
                    aria-label={t("detail.milestone.trace")}
                    onClick={() => navigate(decisionPath)}
                    data-testid="milestone-trace"
                  />
                </Tooltip>
              </Space>
            </div>
          </div>
        ) : null}
      </Panel>
    </li>
  );
}

function PaymentOverview({ data }: { data: ContractOverview }) {
  const { t } = useTranslation("milestones");
  const totals = data.totals;
  const percent = (part: string) =>
    Number(totals.valueMillion) > 0
      ? `${Math.round((Number(part) / Number(totals.valueMillion)) * 1000) / 10}%`
      : "0%";
  const nonZero = (value: string) => Number(value) !== 0;
  const rows: Array<[string, string, string?]> = [
    [t("detail.payment.contractValue"), totals.valueMillion],
    [
      t("detail.payment.eligible"),
      totals.eligibleMillion,
      styles.paymentSettled,
    ],
    ...(nonZero(totals.penaltyMillion)
      ? [
          [
            t("detail.payment.penalty"),
            totals.penaltyMillion,
            styles.paymentPenalty,
          ] as [string, string, string],
        ]
      : []),
    [t("detail.payment.held"), totals.heldMillion],
    ...(nonZero(totals.rejectedMillion)
      ? [
          [t("detail.payment.rejected"), totals.rejectedMillion] as [
            string,
            string,
          ],
        ]
      : []),
    [t("detail.payment.transferred"), totals.paidMillion],
  ];
  return (
    <Panel className={`${styles.sideCard} ${styles.payment}`}>
      <h2>{t("detail.payment.title")}</h2>
      {rows.map(([label, value, className]) => (
        <div key={label} className={styles.paymentRow}>
          <span className={styles.paymentLabel}>{label}</span>
          <b className={`${styles.paymentValue} ${className ?? ""}`}>
            {formatDecimalString(value)}
          </b>
        </div>
      ))}
      <div
        className={styles.bar}
        role="img"
        aria-label={t("detail.payment.progressAria")}
      >
        <span
          className={styles.barSettled}
          style={{ width: percent(totals.eligibleMillion) }}
        />
        <span
          className={styles.barPenalty}
          style={{ width: percent(totals.penaltyMillion) }}
        />
      </div>
      <div className={styles.unit}>{t("detail.payment.unit")}</div>
    </Panel>
  );
}

/** Activity history in back-office form: when, who, what, on which milestone and the note given. */
function EventsTable({
  events,
  milestones,
  people,
}: {
  events: EventRow[];
  milestones: MilestoneRow[];
  people: ReadonlyMap<string, string>;
}) {
  const { t } = useTranslation("milestones");
  const { t: td } = useTranslation("domain");
  const sequenceOf = new Map(milestones.map((m) => [m.id, m.sequence]));
  const types = [...new Set(events.map((e) => e.type))];
  return (
    <Panel className={styles.tabPanel}>
      <div className={styles.panelBody}>
        <Table<EventRow>
          size="small"
          rowKey="id"
          dataSource={[...events].reverse()}
          pagination={{ pageSize: 10, hideOnSinglePage: true }}
          scroll={{ x: "max-content" }}
          columns={[
            {
              key: "at",
              title: t("detail.events.at"),
              render: (_, e) => formatDateTime(e.at),
              sorter: (a, b) => a.at.localeCompare(b.at),
            },
            {
              key: "actor",
              title: t("detail.events.actor"),
              render: (_, e) => (
                <>
                  <div>{e.recordedBy ?? actorName(td, e.actor, people)}</div>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {e.actor.type ? td(`partyType.${e.actor.type}`) : ""}
                  </Typography.Text>
                </>
              ),
            },
            {
              key: "type",
              title: t("detail.events.type"),
              filters: types.map((type) => ({
                text: td(`eventType.${type}`),
                value: type,
              })),
              onFilter: (value, e) => e.type === value,
              render: (_, e) => (
                <Space size={4} wrap>
                  <Typography.Text strong>
                    {td(`eventType.${e.type}`)}
                  </Typography.Text>
                  <Tag style={{ margin: 0 }}>
                    {td(`eventStatus.${e.status}`)}
                  </Tag>
                </Space>
              ),
            },
            {
              key: "milestone",
              title: t("detail.events.milestone"),
              render: (_, e) =>
                td("milestoneNo", { no: sequenceOf.get(e.milestoneId) ?? "?" }),
            },
            {
              key: "note",
              title: t("detail.events.note"),
              // Only what a person wrote; organiser rows carry no user note.
              render: (_, e) => (e.origin === "APP" && e.note) || "—",
            },
            {
              key: "document",
              title: t("detail.events.document"),
              render: (_, e) => <EvidenceDocumentLink event={e} />,
            },
          ]}
        />
      </div>
    </Panel>
  );
}

function HistoryTimeline({
  entries,
  milestones,
  people,
}: {
  entries: TimelineEntry[];
  milestones: MilestoneRow[];
  people: ReadonlyMap<string, string>;
}) {
  const { t } = useTranslation("milestones");
  const { t: td } = useTranslation("domain");
  const sequenceOf = new Map(milestones.map((m) => [m.id, m.sequence]));
  const sorted = [...entries].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <Panel className={styles.tabPanel}>
      <div className={styles.panelBody}>
        <Timeline
          items={sorted.slice(0, 200).map((entry) =>
            entry.kind === "EVENT"
              ? {
                  key: entry.event.id,
                  color: entry.event.origin === "DATA_PACK" ? "blue" : "green",
                  children: (
                    <>
                      <Typography.Text type="secondary">
                        {formatDateTime(entry.at)}
                      </Typography.Text>{" "}
                      <b>{td(`eventType.${entry.event.type}`)}</b>{" "}
                      {t("detail.history.byParty", {
                        actor:
                          entry.event.recordedBy ??
                          actorName(td, entry.event.actor, people),
                        milestone: td("milestoneNo", {
                          no: sequenceOf.get(entry.event.milestoneId) ?? "?",
                        }),
                      })}
                    </>
                  ),
                }
              : {
                  key: entry.change.id,
                  color:
                    entry.change.to.decision === "REJECT"
                      ? "red"
                      : entry.change.to.decision === "HOLD"
                        ? "orange"
                        : "green",
                  children: (
                    <>
                      <Typography.Text type="secondary">
                        {formatDateTime(entry.at)}
                      </Typography.Text>{" "}
                      <b>
                        {td("milestoneNo", {
                          no: sequenceOf.get(entry.change.milestoneId) ?? "?",
                        })}
                      </b>
                      :{" "}
                      {entry.change.from
                        ? `${td(`status.${entry.change.from.status}`)} → `
                        : ""}
                      <b>{td(`status.${entry.change.to.status}`)}</b> (
                      {td(`reason.${entry.change.to.reasonCode}`)}) ·{" "}
                      <Typography.Text type="secondary">
                        {td(`trigger.${entry.change.trigger.kind}`)}
                      </Typography.Text>
                    </>
                  ),
                },
          )}
        />
      </div>
    </Panel>
  );
}

function SigningPanel({ data }: { data: ContractOverview }) {
  const { t } = useTranslation("milestones");
  const { t: td } = useTranslation("domain");
  const { t: ts } = useTranslation("signing");
  const signing = data.signing;
  // The Data Pack signing date can differ from when the last signature was recorded; show both.
  const completedAt =
    signing && signing.signed === signing.total
      ? signing.steps
          .map((s) => s.signedAt ?? "")
          .sort()
          .at(-1)
      : undefined;
  return (
    <Panel className={styles.tabPanel}>
      <div className={styles.panelBody}>
        {signing ? (
          <>
            <h2 style={{ marginBottom: 12 }}>
              {t("detail.signing.title", {
                signed: signing.signed,
                total: signing.total,
              })}
            </h2>
            {data.contract.signingDate &&
            completedAt &&
            completedAt.slice(0, 10) !== data.contract.signingDate ? (
              <Typography.Paragraph
                type="secondary"
                data-testid="signing-dates"
              >
                {t("detail.signing.dates", {
                  document: formatDate(data.contract.signingDate),
                  completed: formatDate(completedAt),
                })}
              </Typography.Paragraph>
            ) : null}
            {signing.steps.map((step) => (
              <div key={step.stepNo} className={styles.person}>
                <span className={styles.avatar}>{step.stepNo}</span>
                <div className={styles.personInfo}>
                  <b>{step.signerName}</b>
                  <div className={styles.personRole}>
                    {[
                      step.signerTitle ?? td(`side.${step.party}`),
                      step.organizationName,
                    ].join(" · ")}
                  </div>
                </div>
                <Tag
                  color={
                    step.status === "SIGNED"
                      ? "success"
                      : step.status === "CURRENT"
                        ? "processing"
                        : "default"
                  }
                >
                  {step.status === "SIGNED" && step.signedAt
                    ? `${formatDateTime(step.signedAt)} · ${step.method ? ts(`method.${step.method}.name`) : ""}`
                    : t(`detail.signing.state.${step.status}`)}
                </Tag>
              </div>
            ))}
          </>
        ) : (
          <p className={styles.empty}>{t("detail.signing.none")}</p>
        )}
      </div>
    </Panel>
  );
}

/** One row per organisation or person, with every responsibility they hold on this contract. */
function ParticipantRows({ data }: { data: ContractOverview }) {
  const { t } = useTranslation("milestones");
  const { t: td } = useTranslation("domain");
  const { t: tc } = useTranslation("common");
  const demo = useDemoMode();
  const steps = data.signing?.steps ?? [];
  const organizationOf = (side: Side) =>
    side === "BUYER" ? data.contract.buyer.name : data.contract.supplier.name;
  return (
    <>
      {data.participants.map((person) => {
        const signs = person.email
          ? steps.filter((step) => step.signerEmail === person.email)
          : [];
        const role = person.approvalRole
          ? t("detail.participants.approves", {
              role: td(`approvalRole.${person.approvalRole}`),
            })
          : person.role
            ? tc(`roles.${person.role}.name`)
            : null;
        const line = person.personName
          ? [
              signs[0]?.signerTitle,
              organizationOf(person.side),
              demo ? person.email : null,
            ]
          : [td(`side.${person.side}`)];
        return (
          <div
            key={`${person.kind}-${person.partyId}`}
            className={styles.person}
            data-testid="participant"
          >
            <span className={styles.avatar}>
              {person.personName
                ? initialsOf(person.personName)
                : organizationInitials(person.name)}
            </span>
            <div className={styles.personInfo}>
              <b>{person.personName ?? person.name}</b>
              <div className={styles.personRole}>
                {line.filter(Boolean).join(" · ")}
              </div>
            </div>
            <Space size={4} wrap>
              {person.personName && role ? (
                <Tag color="blue" style={{ margin: 0 }}>
                  {role}
                </Tag>
              ) : null}
              {signs.map((step) => (
                <Tag key={step.stepNo} color="purple" style={{ margin: 0 }}>
                  {t("detail.signing.step", { step: step.stepNo })}
                </Tag>
              ))}
            </Space>
          </div>
        );
      })}
    </>
  );
}
