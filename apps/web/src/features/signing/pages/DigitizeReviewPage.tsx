import { Table, Tag } from "antd";
import { UiButton, UiInput } from "@/shared/ui/controls";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trans, useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AppShell } from "@/shared/layout/AppShell";
import {
  formatDate,
  formatMillionVnd,
  formatNumber,
} from "@/shared/lib/format";
import { confirmDigitization, getDigitization } from "../api/digitization.api";
import { signingKeys } from "../api/signingConfig.api";
import { PageStatus } from "../components/PageStatus";
import { WizardStepper } from "../components/WizardStepper";
import {
  capitalize,
  cx,
  dateToInputText,
  formatList,
  inputTextToDate,
} from "../lib/helpers";
import type {
  Digitization,
  DigitizedMilestone,
  SourceClause,
  SourceClauseKind,
} from "../types";
import shared from "../components/shared.module.css";
import "../signingTokens.css";
import styles from "./DigitizeReviewPage.module.css";

const DEFAULT_CONTRACT = "CT0101";
const MILLION = 1_000_000;

export default function DigitizeReviewPage() {
  const { t } = useTranslation("signing");
  const contractId = useParams().contractId ?? DEFAULT_CONTRACT;
  const digitization = useQuery({
    queryKey: signingKeys.digitization(contractId),
    queryFn: () => getDigitization(contractId),
  });

  return (
    <AppShell
      active="upload"
      breadcrumb={[
        {
          label: t("digitize.breadcrumb.parent"),
          to: `/contracts/${contractId}/sign-positions`,
        },
        { label: t("digitize.breadcrumb.current") },
      ]}
    >
      {digitization.data ? (
        <Review contractId={contractId} data={digitization.data} />
      ) : (
        <PageStatus isError={digitization.isError} />
      )}
    </AppShell>
  );
}

function Review({
  contractId,
  data,
}: {
  contractId: string;
  data: Digitization;
}) {
  const { t } = useTranslation("signing");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pending = data.milestones.find(
    (milestone) => milestone.source === "NEEDS_CONFIRMATION",
  );
  const pendingCount = data.milestones.filter(
    (milestone) => milestone.source === "NEEDS_CONFIRMATION",
  ).length;
  const [deadlineText, setDeadlineText] = useState(
    dateToInputText(pending?.dueDate ?? data.suggestedDueDate),
  );
  const [deadlineInvalid, setDeadlineInvalid] = useState(false);
  const [highlighted, setHighlighted] = useState<SourceClauseKind | null>(null);

  const confirm = useMutation({
    mutationFn: (dueDate: string | null) =>
      confirmDigitization(contractId, { dueDate }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: signingKeys.digitization(contractId),
      });
      void navigate(`/contracts/${contractId}/signing`);
    },
  });

  const total = data.milestones.reduce(
    (sum, milestone) => sum + milestone.valueMillion,
    0,
  );
  const totalMatches = Math.abs(total - data.contractValueMillion) < 0.005;
  const totalClause = data.clauses.find(
    (clause) => clause.kind === "TOTAL_VALUE",
  );

  const onConfirm = () => {
    if (data.locked) {
      void navigate(`/contracts/${contractId}/signing`);
      return;
    }
    const dueDate = pending ? inputTextToDate(deadlineText) : null;
    if (dueDate === undefined) {
      setDeadlineInvalid(true);
      return;
    }
    setDeadlineInvalid(false);
    confirm.mutate(dueDate);
  };

  return (
    <>
      <WizardStepper current="REVIEW" />

      <div className={styles.layout}>
        <section className={cx(shared.card, styles.panel)}>
          <div className={styles.panelHeader}>
            <h2>{t("digitize.source.title")}</h2>
            <span className={styles.headerNote}>
              {t("digitize.source.badge")}
            </span>
          </div>
          <div className={styles.sourceBox}>
            {data.clauses.map((clause) => (
              <SourceClauseText
                key={clause.kind}
                clause={clause}
                data={data}
                highlighted={highlighted === clause.kind}
              />
            ))}
          </div>
          <div className={styles.sourceHint}>{t("digitize.source.hint")}</div>
        </section>

        <section className={cx(shared.card, styles.panel)}>
          <div className={styles.panelHeader}>
            <h2>
              {t("digitize.result.title", { count: data.milestones.length })}
            </h2>
            <span
              className={cx(
                shared.pill,
                styles.badge,
                pendingCount ? styles.badgePending : styles.badgeDone,
              )}
            >
              {pendingCount
                ? t("digitize.result.pendingBadge", { count: pendingCount })
                : t("digitize.result.reviewedBadge")}
            </span>
          </div>

          <Table<DigitizedMilestone>
            rowKey="no"
            dataSource={data.milestones}
            pagination={false}
            scroll={{ x: "max-content" }}
            onRow={(milestone) => ({
              tabIndex: 0,
              onClick: () => setHighlighted(milestone.sourceClause),
              onKeyDown: (event) => {
                if (event.key === "Enter")
                  setHighlighted(milestone.sourceClause);
              },
            })}
            columns={[
              {
                key: "milestone",
                title: t("digitize.result.columns.milestone"),
                render: (_, m) => (
                  <>
                    <b>{t("digitize.result.milestoneCode", { no: m.no })}</b>{" "}
                    {t(`digitize.result.milestoneKind.${m.kind}`)}
                  </>
                ),
              },
              {
                key: "value",
                title: t("digitize.result.columns.value"),
                render: (_, m) => formatMillionVnd(m.valueMillion),
              },
              {
                key: "due",
                title: t("digitize.result.columns.dueDate"),
                render: (_, m) =>
                  m.dueDate
                    ? formatDate(m.dueDate)
                    : t("digitize.result.dueUnknown"),
              },
              {
                key: "docs",
                title: t("digitize.result.columns.documents"),
                render: (_, m) =>
                  capitalize(
                    m.documents
                      .map((d) => t(`digitize.result.documents.${d}`))
                      .join(", "),
                  ),
              },
              {
                key: "penalty",
                title: t("digitize.result.columns.penalty"),
                render: (_, m) =>
                  m.penalty
                    ? t("digitize.result.penalty.RATE", {
                        rate: formatNumber(m.penalty.ratePerDay, 2),
                        cap: formatNumber(m.penalty.capPercent),
                      })
                    : t("digitize.result.penalty.NONE"),
              },
              {
                key: "source",
                title: t("digitize.result.columns.source"),
                render: (_, m) => (
                  <Tag
                    color={
                      m.source === "NEEDS_CONFIRMATION" ? "warning" : "success"
                    }
                  >
                    {t(`digitize.result.sourceStatus.${m.source}`)}
                  </Tag>
                ),
              },
            ]}
          />

          {pending ? (
            <div className={cx(shared.notice, styles.ambiguity)}>
              <b className={shared.noticeTitle}>
                {t("digitize.ambiguity.title", {
                  no: pending.no,
                  months: pending.relativeTermMonths ?? 0,
                })}
              </b>
              <span>{t("digitize.ambiguity.body")}</span>
              <div className={styles.deadlineRow}>
                <label
                  htmlFor="milestone-deadline"
                  className={styles.deadlineLabel}
                >
                  {t("digitize.ambiguity.label", { no: pending.no })}
                </label>
                <UiInput
                  id="milestone-deadline"
                  className={styles.deadlineInput}
                  value={deadlineText}
                  aria-invalid={deadlineInvalid}
                  onChange={(event) => setDeadlineText(event.target.value)}
                />
                {deadlineInvalid ? (
                  <span role="alert" className={styles.deadlineError}>
                    {t("digitize.ambiguity.invalid")}
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className={styles.summary}>
            <div className={styles.summaryBox}>
              <div className={styles.summaryLabel}>
                {t("digitize.approvers.title")}
              </div>
              <b>
                {data.approvers
                  .map((role) => t(`digitize.approvers.role.${role}`))
                  .join(", ")}
              </b>
              <div className={styles.summaryLabel}>
                {t("digitize.approvers.note", {
                  number: numberWord(t, data.requiredApprovals),
                })}
              </div>
            </div>
            <div className={styles.summaryBox}>
              <div className={styles.summaryLabel}>
                {t("digitize.total.title")}
              </div>
              <b className={styles.tabular}>
                {t("digitize.total.value", { value: formatMillionVnd(total) })}
              </b>
              <div
                className={
                  totalMatches ? styles.totalMatch : styles.totalMismatch
                }
              >
                {totalMatches
                  ? t("digitize.total.match", {
                      article: totalClause?.article ?? "",
                    })
                  : t("digitize.total.mismatch", {
                      value: formatMillionVnd(data.contractValueMillion),
                    })}
              </div>
            </div>
          </div>

          <div className={styles.footer}>
            <span className={styles.footerNote}>
              {data.locked
                ? t("digitize.footer.locked")
                : t("digitize.footer.lockNote")}
            </span>
            <Link
              to={`/contracts/${contractId}/sign-positions`}
              className={cx(shared.btnSecondary, styles.back)}
            >
              {t("digitize.footer.back")}
            </Link>
            <UiButton
              type="button"
              className={shared.btnPrimary}
              disabled={confirm.isPending}
              onClick={onConfirm}
            >
              {data.locked
                ? t("digitize.footer.continue")
                : t("digitize.footer.confirm")}
            </UiButton>
          </div>
        </section>
      </div>
    </>
  );
}

function numberWord(
  t: (key: string, options?: Record<string, unknown>) => string,
  count: number,
): string {
  return t(`digitize.numberWords.${count}`, { defaultValue: String(count) });
}

function SourceClauseText({
  clause,
  data,
  highlighted,
}: {
  clause: SourceClause;
  data: Digitization;
  highlighted: boolean;
}) {
  const { t } = useTranslation("signing");
  const vnd = (million: number) =>
    t("digitize.source.vnd", { value: formatNumber(million * MILLION) });
  const delivery = data.milestones.find(
    (milestone) => milestone.kind === "DELIVERY",
  );
  const penalised = data.milestones.find((milestone) => milestone.penalty);

  let values: Record<string, string | number> | null = null;
  switch (clause.kind) {
    case "TOTAL_VALUE":
      values = {
        value: vnd(data.contractValueMillion),
        milestones: data.milestones.length,
      };
      break;
    case "DELIVERY":
      if (delivery) {
        values = {
          value: vnd(delivery.valueMillion),
          date: delivery.dueDate
            ? formatDate(delivery.dueDate)
            : t("digitize.result.dueUnknown"),
          documents: formatList(
            delivery.documents.map((document) =>
              t(`digitize.result.documents.${document}`),
            ),
          ),
        };
      }
      break;
    case "LATE_PENALTY":
      if (penalised?.penalty) {
        values = {
          rate: formatNumber(penalised.penalty.ratePerDay, 2),
          cap: formatNumber(penalised.penalty.capPercent),
        };
      }
      break;
    case "APPROVALS":
      values = { approvers: numberWord(t, data.requiredApprovals) };
      break;
  }
  if (!values) return null;

  return (
    <div className={highlighted ? styles.clauseOn : styles.clause}>
      <div className={styles.clauseLocation}>
        {t("digitize.source.location", {
          article: clause.article,
          page: clause.page,
        })}
      </div>
      <Trans
        t={t}
        i18nKey={`digitize.source.clause.${clause.kind}`}
        values={values}
        components={{ mark: <mark className={styles.mark} /> }}
      />
    </div>
  );
}
