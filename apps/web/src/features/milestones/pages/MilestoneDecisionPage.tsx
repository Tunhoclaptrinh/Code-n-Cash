import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { Trans, useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { AppShell } from "@/shared/layout/AppShell";
import {
  formatDate,
  formatMillionVnd,
  formatNumber,
  formatTime,
} from "@/shared/lib/format";
import {
  getDecisionView,
  transferToAccounting,
  type DecisionView,
} from "../api/contracts.api";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { PageMessage } from "../components/PageMessage";
import { PdfTile } from "../components/PdfTile";
import { toneOfDecision } from "../components/StatusBadge";
import { evidenceName, formatShortDateTime, numberWord } from "../lib/display";
import type { HistoryEvent } from "../types";
import styles from "./MilestoneDecisionPage.module.css";

export default function MilestoneDecisionPage() {
  const { t } = useTranslation("milestones");
  const params = useParams();
  const contractId = params.contractId ?? "";
  const milestoneNo = Number(params.milestoneNo);

  const view = useQuery({
    queryKey: ["milestones", "decision", contractId, milestoneNo],
    queryFn: () => getDecisionView(contractId, milestoneNo),
  });
  const data = view.data;

  const breadcrumb = [
    { label: contractId, to: `/contracts/${contractId}` },
    {
      label: data
        ? t("decision.breadcrumb", {
            no: data.milestone.no,
            name: t(`milestoneKind.${data.milestone.kind}`),
          })
        : String(milestoneNo),
    },
  ];

  return (
    <AppShell active="contracts" breadcrumb={breadcrumb}>
      {view.isPending ? <PageMessage kind="loading" /> : null}
      {view.isError || view.data === null ? (
        <PageMessage kind={view.isError ? "error" : "notFound"} />
      ) : null}
      {data ? <DecisionContent data={data} /> : null}
    </AppShell>
  );
}

function DecisionContent({ data }: { data: DecisionView }) {
  const { t } = useTranslation("milestones");
  const { t: tc } = useTranslation("common");
  const queryClient = useQueryClient();
  const { decision, milestone, calculation } = data;
  const milestoneName = t(`milestoneKind.${milestone.kind}`);
  const payable = decision.payableMillion > 0;
  const hasPenalty = decision.lateDays > 0;

  const transfer = useMutation({
    mutationFn: () => transferToAccounting(data.contractId, milestone.no),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["milestones"] }),
  });

  const reasonRows = decision.checks.map((check) => check.code);
  const stoppedReason =
    decision.reasonCode === "HELD_BY_APPROVER" ||
    decision.reasonCode === "REJECTED_BY_APPROVER"
      ? decision.reasonCode
      : null;

  return (
    <>
      <Card as="div" className={styles.banner}>
        <div className={styles.bannerText}>
          <div className={styles.bannerMeta}>
            {t("decision.meta", {
              contractId: data.contractId,
              title: data.contractTitle,
              supplier: data.supplierName,
            })}
          </div>
          <div className={styles.bannerHeadline}>
            <h1>
              {t(`decision.headline.${decision.code}`, {
                no: milestone.no,
                name: milestoneName,
                amount: formatMillionVnd(decision.payableMillion),
              })}
            </h1>
            <Badge tone={toneOfDecision(decision.code)} size="headline">
              {t(`decisionCode.${decision.code}`)}
            </Badge>
          </div>
          <div className={styles.bannerSummary}>
            {t(`decision.summary.${decision.code}`, {
              count: decision.lateDays,
              penalty: formatMillionVnd(decision.penaltyMillion),
              approvers: numberWord(t, decision.approvals),
              time: formatTime(decision.finalizedAt),
              date: formatDate(decision.finalizedAt),
            })}
          </div>
        </div>
        <div className={styles.bannerActions}>
          <Button
            variant="outline"
            size="header"
            onClick={() => window.print()}
          >
            {t("decision.actions.export")}
          </Button>
          {payable ? (
            <Button
              variant="outlineSuccess"
              size="header"
              disabled={decision.transferredToAccounting || transfer.isPending}
              onClick={() => transfer.mutate()}
            >
              {transfer.isPending
                ? t("decision.actions.transferring")
                : decision.transferredToAccounting
                  ? t("decision.actions.transferred")
                  : t("decision.actions.transfer")}
            </Button>
          ) : null}
        </div>
      </Card>

      <div className={styles.grid}>
        <Card className={`${styles.panel} ${styles.amounts}`}>
          <h2>{t("decision.amounts.title")}</h2>
          <AmountRow
            label={t("decision.amounts.milestoneValue")}
            value={formatMillionVnd(calculation.valueMillion)}
          />
          {hasPenalty ? (
            <>
              <AmountRow
                label={t("decision.amounts.lateDays")}
                value={t("decision.amounts.lateDaysValue", {
                  count: decision.lateDays,
                })}
              />
              <AmountRow
                label={t("decision.amounts.rate")}
                value={t("decision.amounts.rateValue", {
                  rate: formatNumber(calculation.rateBpPerDay / 100, 2),
                })}
              />
              <AmountRow
                label={t("decision.amounts.cap", {
                  cap: formatNumber(calculation.capBp / 100, 2),
                })}
                value={formatMillionVnd(calculation.capMillion)}
              />
              <AmountRow
                warning
                label={t("decision.amounts.penalty", {
                  calculated: formatMillionVnd(
                    calculation.calculatedPenaltyMillion,
                  ),
                  cap: formatMillionVnd(calculation.capMillion),
                })}
                value={formatMillionVnd(decision.penaltyMillion)}
              />
            </>
          ) : null}
          <div className={styles.payable}>
            <div className={styles.payableLabel}>
              {payable
                ? t("decision.amounts.payableFormula", {
                    value: formatMillionVnd(calculation.valueMillion),
                    penalty: formatMillionVnd(decision.penaltyMillion),
                  })
                : t("decision.amounts.payableNone")}
            </div>
            <b className={styles.payableValue}>
              {formatMillionVnd(decision.payableMillion)}
            </b>
          </div>
          <div className={styles.panelNote}>{t("decision.amounts.note")}</div>
        </Card>

        <Card className={`${styles.panel} ${styles.reasons}`}>
          <h2>{t("decision.reasons.title")}</h2>
          {reasonRows.map((code) => {
            const warn =
              decision.checks.find((check) => check.code === code)?.outcome ===
              "WARN";
            const text = (
              <Trans
                t={t}
                i18nKey={`decision.reasons.${code}`}
                count={reasonCount(code, data)}
                values={{ due: formatDate(milestone.dueDate) }}
                components={{ b: <b /> }}
              />
            );
            return warn ? (
              <div
                key={code}
                className={`${styles.reason} ${styles.reasonWarn}`}
              >
                <span className={styles.reasonWarnMark} aria-hidden="true">
                  !
                </span>
                <span>{text}</span>
              </div>
            ) : (
              <div key={code} className={styles.reason}>
                <span className={styles.reasonPass} aria-hidden="true">
                  ✓
                </span>
                <span>{text}</span>
              </div>
            );
          })}
          {stoppedReason ? (
            <div className={`${styles.reason} ${styles.reasonWarn}`}>
              <span className={styles.reasonWarnMark} aria-hidden="true">
                !
              </span>
              <span>
                <Trans
                  t={t}
                  i18nKey={`decision.reasons.${stoppedReason}`}
                  components={{ b: <b /> }}
                />
              </span>
            </div>
          ) : null}
          <div className={styles.related}>
            <b>{t("decision.reasons.relatedDocuments")}</b>
            {data.documents.map((file) => (
              <div key={file.id} className={styles.relatedRow}>
                <PdfTile variant="chip" />
                <span className={styles.relatedName}>
                  {evidenceName(t, file.type)}
                </span>
                <Badge tone={file.signature?.valid ? "success" : "danger"}>
                  {file.signature?.valid
                    ? t("common.signatureValid")
                    : t("common.signatureInvalid")}
                </Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card className={`${styles.panel} ${styles.history}`}>
          <h2>{t("decision.history.title")}</h2>
          <ol className={styles.timeline}>
            {data.history.map((event, index) => (
              <li key={`${event.at}-${index}`} className={styles.event}>
                {index < data.history.length - 1 ? (
                  <span className={styles.eventLine} />
                ) : null}
                <span
                  className={`${styles.eventDot} ${styles[`eventDot${event.category}`]}`}
                />
                <div className={styles.eventMeta}>
                  {formatShortDateTime(event.at)} ·{" "}
                  <b className={styles[`eventCategory${event.category}`]}>
                    {t(`decision.history.category.${event.category}`)}
                  </b>
                </div>
                <div>{describeEvent(t, tc, event)}</div>
              </li>
            ))}
          </ol>
          <div className={styles.historyNote}>{t("decision.history.note")}</div>
        </Card>
      </div>

      <Card as="div" className={styles.dispute}>
        <b className={styles.disputeTitle}>{t("decision.dispute.title")}</b>
        <span className={styles.disputeText}>
          {t("decision.dispute.body", { count: data.disputeWindowDays })}
        </span>
        <Link
          to={`/contracts/${data.contractId}/milestones/${milestone.no}/dispute`}
          className={styles.disputeLink}
        >
          {t("decision.dispute.link")}
        </Link>
      </Card>
    </>
  );
}

function AmountRow({
  label,
  value,
  warning = false,
}: {
  label: string;
  value: string;
  warning?: boolean;
}) {
  return (
    <div
      className={`${styles.amountRow} ${warning ? styles.amountRowPenalty : ""}`}
    >
      <span>{label}</span>
      <b className={styles.amountValue}>{value}</b>
    </div>
  );
}

/** Pluralised count each reason line needs: documents, approvals or late days. */
function reasonCount(code: string, data: DecisionView): number {
  if (code === "AUTHORIZED_SUBMITTER_AND_VALID_SIGNATURES")
    return data.documents.length;
  if (code === "APPROVAL_QUORUM_MET") return data.decision.approvals;
  if (code === "LATE_DELIVERY") return data.decision.lateDays;
  return 1;
}

function describeEvent(
  t: TFunction<"milestones">,
  tc: TFunction<"common">,
  event: HistoryEvent,
): string {
  switch (event.kind) {
    case "DOCUMENT_SIGNED": {
      const document = evidenceName(t, event.document);
      return event.roleName
        ? t("decision.history.event.DOCUMENT_SIGNED_WITH_ROLE", {
            actor: event.actorName,
            role: tc(`roles.${event.roleName}.name`),
            document,
          })
        : t("decision.history.event.DOCUMENT_SIGNED", {
            actor: event.actorName,
            document,
          });
    }
    case "EVIDENCE_RECEIVED":
      return event.penaltyMillion > 0
        ? t("decision.history.event.EVIDENCE_RECEIVED_PENALTY", {
            code: t(`decisionCode.${event.code}`),
            penalty: formatMillionVnd(event.penaltyMillion),
          })
        : t("decision.history.event.EVIDENCE_RECEIVED", {
            code: t(`decisionCode.${event.code}`),
          });
    case "APPROVED_AND_SIGNED":
    case "HELD":
    case "REJECTED":
      return t(`decision.history.event.${event.kind}`, {
        actor: event.actorName,
        role: tc(`roles.${event.roleName}.name`),
      });
    case "DECISION_FINALIZED":
      return event.payableMillion > 0
        ? t("decision.history.event.DECISION_FINALIZED_PAYABLE", {
            code: t(`decisionCode.${event.code}`),
            payable: formatMillionVnd(event.payableMillion),
          })
        : t("decision.history.event.DECISION_FINALIZED", {
            code: t(`decisionCode.${event.code}`),
          });
  }
}
