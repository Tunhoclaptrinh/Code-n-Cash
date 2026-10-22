import { PageContainer } from "@codecash/ui";
import { Button, Space, Tooltip } from "antd";
import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AppPage } from "@/shared/layout/AppPage";
import { formatDate, formatMillionVnd } from "@/shared/lib/format";
import { getContractOverview } from "../api/contracts.api";
import { ToneTag } from "@/shared/ui/ToneTag";
import { Panel } from "@/shared/ui/Panel";
import { PageState } from "@/shared/ui/PageState";
import { PdfTile } from "../components/PdfTile";
import { StatusBadge } from "../components/StatusBadge";
import { initialsOf } from "@/shared/lib/initials";
import { evidenceName } from "../lib/display";
import type {
  ContractOverview,
  MilestoneRow,
  MilestoneStatus,
  Participant,
} from "../types";
import styles from "./ContractDetailPage.module.css";

type TabKey = "milestones" | "documents" | "participants" | "history";
const TABS: TabKey[] = ["milestones", "documents", "participants", "history"];

type Emphasis = "done" | "attention" | "danger" | "active" | "idle";

const emphasisOf: Record<MilestoneStatus, Emphasis> = {
  RELEASE: "done",
  PENALTY: "attention",
  HOLD: "attention",
  REJECT: "danger",
  AWAITING_EVIDENCE: "active",
  AWAITING_APPROVAL: "active",
  NOT_DUE: "idle",
  NOT_OPEN: "idle",
};

const markerClass: Record<Emphasis, string> = {
  done: styles.markerDone,
  attention: styles.markerAttention,
  danger: styles.markerDanger,
  active: styles.markerActive,
  idle: styles.markerIdle,
};

const cardClass: Record<Emphasis, string> = {
  done: "",
  attention: styles.cardAttention,
  danger: styles.cardDanger,
  active: styles.cardActive,
  idle: "",
};

export default function ContractDetailPage() {
  const { t } = useTranslation("milestones");
  const { t: tc } = useTranslation("common");
  const navigate = useNavigate();
  const contractId = useParams().contractId ?? "";
  const [tab, setTab] = useState<TabKey>("milestones");

  const overview = useQuery({
    queryKey: ["milestones", "overview", contractId],
    queryFn: () => getContractOverview(contractId),
  });
  const data = overview.data;

  return (
    <AppPage
      active="contracts"
      breadcrumb={[
        { label: tc("nav.contracts"), to: "/contracts" },
        { label: t("detail.breadcrumb", { contractId }) },
      ]}
      contentClassName={styles.page}
    >
      {overview.isPending ? <PageState kind="loading" /> : null}
      {overview.isError ? <PageState kind="error" /> : null}
      {data ? (
        <PageContainer
          title={data.title}
          subtitle={t("detail.meta", {
            kind: t(`contractKind.${data.kind}`),
            supplier: data.supplierName,
          })}
          tags={
            <ToneTag tone={data.phase === "COMPLETED" ? "neutral" : "success"}>
              {t(`detail.phase.${data.phase}`)}
            </ToneTag>
          }
          extra={
            <Space wrap>
              <Tooltip title={t("detail.actions.downloadUnavailable")}>
                <Button disabled>{t("detail.actions.download")}</Button>
              </Tooltip>
              <Button onClick={() => navigate(`/verify/${data.contractId}`)}>
                {t("detail.actions.verify")}
              </Button>
            </Space>
          }
          tabs={TABS.map((key) => ({ key, tab: t(`detail.tabs.${key}`) }))}
          activeTabKey={tab}
          onTabChange={(key) => setTab(key as TabKey)}
        >
          {tab === "milestones" ? (
            <div className={styles.grid}>
              <ol className={styles.timeline}>
                {data.milestones.map((row, index) => (
                  <MilestoneItem
                    key={row.no}
                    row={row}
                    contractId={data.contractId}
                    isLast={index === data.milestones.length - 1}
                  />
                ))}
              </ol>
              <div className={styles.sidebar}>
                <PaymentOverview data={data} />
                <Panel className={`${styles.sideCard} ${styles.people}`}>
                  <h2>{t("detail.participants.title")}</h2>
                  <ParticipantRows participants={data.participants} />
                </Panel>
              </div>
            </div>
          ) : null}

          {tab === "documents" ? (
            <Panel className={styles.tabPanel}>
              <div className={styles.panelBody}>
                <h2>{t("detail.documents.title")}</h2>
                {data.documents.length === 0 ? (
                  <p className={styles.empty}>{t("detail.documents.empty")}</p>
                ) : null}
                {data.documents.map(({ milestoneNo, file }) => (
                  <div
                    key={`${milestoneNo}-${file.id}`}
                    className={styles.documentRow}
                  >
                    <PdfTile variant="plain" />
                    <div className={styles.documentName}>
                      <b>{file.fileName}</b>
                      <div className={styles.documentMeta}>
                        {t("detail.documents.meta", {
                          no: milestoneNo,
                          type: evidenceName(t, file.type),
                        })}
                      </div>
                    </div>
                    <ToneTag
                      tone={file.signature?.valid ? "success" : "primary"}
                    >
                      {file.signature?.valid
                        ? t("common.signatureValid")
                        : t("submit.file.unsigned")}
                    </ToneTag>
                  </div>
                ))}
              </div>
            </Panel>
          ) : null}

          {tab === "participants" ? (
            <Panel className={styles.tabPanel}>
              <div className={styles.panelBody}>
                <h2>{t("detail.participants.title")}</h2>
                <ParticipantRows participants={data.participants} />
              </div>
            </Panel>
          ) : null}

          {tab === "history" ? (
            <Panel className={styles.tabPanel}>
              <div className={styles.panelBody}>
                <p>{t("detail.history.body")}</p>
                <Link to="/activity-log" className={styles.link}>
                  {t("detail.history.link")}
                </Link>
              </div>
            </Panel>
          ) : null}
        </PageContainer>
      ) : null}
    </AppPage>
  );
}

function MilestoneItem({
  row,
  contractId,
  isLast,
}: {
  row: MilestoneRow;
  contractId: string;
  isLast: boolean;
}) {
  const { t } = useTranslation("milestones");
  const { t: tc } = useTranslation("common");
  const emphasis = emphasisOf[row.status];
  const name = t(`milestoneKind.${row.kind}`);

  const dueLine = row.deliveredOn
    ? t("detail.milestone.dueDelivered", {
        due: formatDate(row.dueDate),
        delivered: formatDate(row.deliveredOn),
      })
    : t("detail.milestone.due", { due: formatDate(row.dueDate) });

  return (
    <li className={styles.milestone}>
      <div className={styles.rail}>
        {isLast ? null : <span className={styles.railLine} />}
        <span className={`${styles.marker} ${markerClass[emphasis]}`}>
          {emphasis === "done"
            ? "✓"
            : emphasis === "attention" || emphasis === "danger"
              ? "!"
              : row.no}
        </span>
      </div>
      <Panel
        as="div"
        className={`${styles.milestoneCard} ${cardClass[emphasis]}`}
      >
        <div className={styles.cardHead}>
          <div className={styles.nameRow}>
            <b className={styles.name}>
              {t("detail.milestone.name", { no: row.no, name })}
            </b>
            <StatusBadge status={row.status} />
          </div>
          <div className={styles.amountBlock}>
            <b className={styles.amount}>
              {formatMillionVnd(row.plannedMillion)}
            </b>
            <span className={styles.amountUnit}>
              {t("detail.milestone.amountUnit")}
            </span>
          </div>
        </div>
        <div className={styles.cardBody}>
          <div className={styles.info}>
            <div className={styles.due}>{dueLine}</div>
            {factsOf(t, tc, row).map((fact) => (
              <div key={fact.label} className={styles.fact}>
                <span className={styles.factLabel}>{fact.label} </span>
                <b>{fact.value}</b>
              </div>
            ))}
          </div>
          <div className={styles.side}>
            <MilestoneSide row={row} contractId={contractId} />
          </div>
        </div>
      </Panel>
    </li>
  );
}

function factsOf(
  t: TFunction<"milestones">,
  tc: TFunction<"common">,
  row: MilestoneRow,
): Array<{ label: string; value: string }> {
  const fact = (key: string) => t(`detail.milestone.fact.${key}`);
  const evidence = row.requiredEvidence
    .map((type) => evidenceName(t, type))
    .join(", ");
  const paid = formatMillionVnd(row.payableMillion ?? 0);

  switch (row.status) {
    case "RELEASE":
      return [
        ...(row.completedOn
          ? [{ label: fact("completed"), value: formatDate(row.completedOn) }]
          : []),
        { label: fact("paid"), value: paid },
      ];
    case "PENALTY":
      return [
        {
          label: fact("penalty"),
          value: formatMillionVnd(row.penaltyMillion ?? 0),
        },
        { label: fact("paid"), value: paid },
      ];
    case "HOLD":
    case "REJECT":
      return [{ label: fact("paid"), value: paid }];
    case "AWAITING_APPROVAL":
      return [
        { label: fact("required"), value: evidence },
        ...(row.deliveredOn
          ? [{ label: fact("submittedOn"), value: formatDate(row.deliveredOn) }]
          : []),
      ];
    case "NOT_OPEN":
      return [
        { label: fact("required"), value: evidence },
        {
          label: fact("opensWhen"),
          value: t("detail.milestone.opensWhenValue", {
            no: row.opensAfterNo ?? row.no - 1,
          }),
        },
      ];
    case "AWAITING_EVIDENCE":
    case "NOT_DUE":
      return [
        { label: fact("required"), value: evidence },
        {
          label: fact("submitter"),
          value: tc(`roles.${row.submitterRole}.name`),
        },
      ];
  }
}

function MilestoneSide({
  row,
  contractId,
}: {
  row: MilestoneRow;
  contractId: string;
}): ReactNode {
  const { t } = useTranslation("milestones");
  const { t: tc } = useTranslation("common");
  const navigate = useNavigate();
  switch (row.status) {
    case "RELEASE":
      return row.transferredToAccounting ? (
        <span className={styles.sideDone}>
          {t("detail.milestone.side.transferred")}
        </span>
      ) : (
        <span className={styles.sideMuted}>
          {t("detail.milestone.side.notTransferred")}
        </span>
      );
    case "PENALTY":
    case "HOLD":
    case "REJECT":
      return (
        <Button
          type="primary"
          size="small"
          onClick={() =>
            navigate(`/contracts/${contractId}/milestones/${row.no}/decision`)
          }
        >
          {t("detail.milestone.side.viewDecision")}
        </Button>
      );
    case "AWAITING_APPROVAL":
      return (
        <span className={styles.sideMuted}>
          {t("detail.milestone.side.awaitingApproval")}
        </span>
      );
    case "AWAITING_EVIDENCE":
    case "NOT_DUE":
      return (
        <span className={styles.sideMuted}>
          {t("detail.milestone.side.waitingSubmitter", {
            role: tc(`roles.${row.submitterRole}.name`),
          })}
        </span>
      );
    case "NOT_OPEN":
      return (
        <span className={styles.sideMuted}>
          {t("detail.milestone.side.noTask")}
        </span>
      );
  }
}

function PaymentOverview({ data }: { data: ContractOverview }) {
  const { t } = useTranslation("milestones");
  const percent = (part: number) =>
    `${Math.round((part / data.valueMillion) * 1000) / 10}%`;
  return (
    <Panel className={`${styles.sideCard} ${styles.payment}`}>
      <h2>{t("detail.payment.title")}</h2>
      <div className={styles.paymentRow}>
        <span className={styles.paymentLabel}>
          {t("detail.payment.contractValue")}
        </span>
        <b className={styles.paymentValue}>
          {formatMillionVnd(data.valueMillion)}
        </b>
      </div>
      <div className={styles.paymentRow}>
        <span className={styles.paymentLabel}>
          {t("detail.payment.settled")}
        </span>
        <b className={`${styles.paymentValue} ${styles.paymentSettled}`}>
          {formatMillionVnd(data.settledMillion)}
        </b>
      </div>
      <div className={styles.paymentRow}>
        <span className={styles.paymentLabel}>
          {t("detail.payment.penalty")}
        </span>
        <b className={`${styles.paymentValue} ${styles.paymentPenalty}`}>
          {formatMillionVnd(data.penaltyMillion)}
        </b>
      </div>
      <div className={styles.paymentRow}>
        <span className={styles.paymentLabel}>
          {t("detail.payment.notDue")}
        </span>
        <b className={styles.paymentValue}>
          {formatMillionVnd(data.notDueMillion)}
        </b>
      </div>
      {data.inProgressMillion > 0 ? (
        <div className={styles.paymentRow}>
          <span className={styles.paymentLabel}>
            {t("detail.payment.inProgress")}
          </span>
          <b className={styles.paymentValue}>
            {formatMillionVnd(data.inProgressMillion)}
          </b>
        </div>
      ) : null}
      <div
        className={styles.bar}
        role="img"
        aria-label={t("detail.payment.progressAria")}
      >
        <span
          className={styles.barSettled}
          style={{ width: percent(data.settledMillion) }}
        />
        <span
          className={styles.barPenalty}
          style={{ width: percent(data.penaltyMillion) }}
        />
      </div>
      <div className={styles.unit}>{t("detail.payment.unit")}</div>
    </Panel>
  );
}

function ParticipantRows({ participants }: { participants: Participant[] }) {
  const { t } = useTranslation("milestones");
  return (
    <>
      {participants.map((person) => (
        <div key={person.id} className={styles.person}>
          <span className={styles.avatar}>{initialsOf(person.name)}</span>
          <div className={styles.personInfo}>
            <b>{person.name}</b>
            <div className={styles.personRole}>
              {person.side === "BUYER"
                ? t("detail.participants.role", {
                    role: t(`participantRole.${person.role}`),
                    side: t(`side.${person.side}`),
                  })
                : t(`participantRole.${person.role}`)}
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
