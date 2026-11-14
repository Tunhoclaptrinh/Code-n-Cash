import { DemoFillButton } from "@/shared/ui/DemoFillButton";
import { Alert, Button, Collapse, Input, Table, Tag } from "antd";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trans, useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "@/shared/api/client";
import { AppPage } from "@/shared/layout/AppPage";
import {
  formatDate,
  formatDateTime,
  formatDecimalString,
  sumDecimalStrings,
} from "@/shared/lib/format";
import { EditOutlined } from "@ant-design/icons";
import { MilestoneEditor } from "../components/MilestoneEditor";
import { confirmDigitization, getDigitization } from "../api/digitization.api";
import { signingKeys } from "../api/signingConfig.api";
import { PageState } from "@/shared/ui/PageState";
import { WizardStepper } from "@/shared/ui/WizardStepper";
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
import { ExtractionPanel } from "../components/ExtractionPanel";

/**
 * Step 3 of the wizard: the terms read from the contract, cut into the milestones of the Data Pack
 * workflow of its type. Confirming locks them, creates the milestones and starts the signing order.
 */
export default function DigitizeReviewPage() {
  const { t } = useTranslation("signing");
  const contractId = useParams().contractId ?? "";
  const digitization = useQuery({
    queryKey: signingKeys.digitization(contractId),
    queryFn: () => getDigitization(contractId),
  });
  return (
    <AppPage
      guide="signing"
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
        <PageState kind={digitization.isError ? "error" : "loading"} />
      )}
    </AppPage>
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
  const { t: td } = useTranslation("domain");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pending = data.milestones.find(
    (m) => m.source === "NEEDS_CONFIRMATION",
  );
  const [deadlineText, setDeadlineText] = useState("");
  const [deadlineInvalid, setDeadlineInvalid] = useState(false);
  const [highlighted, setHighlighted] = useState<SourceClauseKind | null>(null);
  const [extractionReady, setExtractionReady] = useState(false);
  const [editing, setEditing] = useState(false);
  const confirm = useMutation({
    mutationFn: (dueDate: string | null) =>
      confirmDigitization(contractId, { dueDate }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["signing"] });
      await queryClient.invalidateQueries({ queryKey: ["contract-summaries"] });
      void navigate(`/contracts/${contractId}/signing`);
    },
  });
  const total = sumDecimalStrings(data.milestones.map((m) => m.valueMillion));
  const totalMatches = total === sumDecimalStrings([data.contractValueMillion]);
  const onConfirm = () => {
    if (data.locked) {
      void navigate(`/contracts/${contractId}/signing`);
      return;
    }
    if (!extractionReady) return;
    const dueDate = pending ? inputTextToDate(deadlineText) : null;
    if (dueDate === undefined) {
      setDeadlineInvalid(true);
      return;
    }
    setDeadlineInvalid(false);
    confirm.mutate(dueDate ? dueDate.slice(0, 10) : null);
  };
  const errorCode =
    confirm.error instanceof ApiError ? confirm.error.code : null;

  return (
    <>
      <WizardStepper current="REVIEW" />
      <ExtractionPanel code={contractId} onReadyChange={setExtractionReady} />
      <div className={styles.layout} data-testid="digitization-milestones">
        <section className={cx(shared.card, styles.panel)}>
          <div className={styles.panelHeader}>
            <h2>
              {t("digitize.result.title", { count: data.milestones.length })}
            </h2>
            {!data.locked && !editing ? (
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => setEditing(true)}
                data-testid="digitize-edit"
              >
                {t("digitize.edit.open")}
              </Button>
            ) : null}
          </div>
          <Alert
            type={data.edited ? "warning" : "info"}
            showIcon
            style={{ marginBottom: 12 }}
            title={
              data.edited
                ? t("digitize.edit.editedBy", {
                    name: data.edited.by,
                    at: formatDateTime(data.edited.at),
                  })
                : t("digitize.edit.origin")
            }
          />
          {editing ? (
            <MilestoneEditor data={data} onDone={() => setEditing(false)} />
          ) : (
            <Table<DigitizedMilestone>
              rowKey="sequence"
              dataSource={data.milestones}
              pagination={false}
              tableLayout="auto"
              // Columns wrap to the card; only a narrow screen scrolls sideways.
              scroll={{ x: 720 }}
              onRow={(m) => ({
                tabIndex: 0,
                onClick: () => setHighlighted(m.sourceClause),
                onKeyDown: (event) => {
                  if (event.key === "Enter") setHighlighted(m.sourceClause);
                },
              })}
              columns={[
                {
                  key: "milestone",
                  title: t("digitize.result.columns.milestone"),
                  render: (_, m) => (
                    <>
                      <b>
                        {t("digitize.result.milestoneCode", { no: m.sequence })}
                      </b>{" "}
                      {td(`milestoneType.${m.type}`)}
                    </>
                  ),
                },
                {
                  key: "value",
                  title: t("digitize.result.columns.value"),
                  render: (_, m) =>
                    `${formatDecimalString(m.valueMillion)} (${m.paymentPercent}%)`,
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
                  // Each document with the side that records it (older digitisations have no sides).
                  render: (_, m) =>
                    capitalize(
                      (
                        m.documents ??
                        m.eventTypes.map((eventType) => ({
                          eventType,
                          side: null,
                        }))
                      )
                        .map(({ eventType, side }) =>
                          side
                            ? t("digitize.result.documentBy", {
                                document: td(`eventType.${eventType}`),
                                side: td(`side.${side}`),
                              })
                            : td(`eventType.${eventType}`),
                        )
                        .join(", "),
                    ),
                },
                {
                  key: "approval",
                  title: t("digitize.result.columns.approval"),
                  render: (_, m) => {
                    const roles = m.approvalRoles ?? data.approvers;
                    return roles.length
                      ? roles
                          .map((role) => td(`approvalRole.${role}`))
                          .join(", ")
                      : t("digitize.result.noApproval");
                  },
                },
                {
                  key: "penalty",
                  title: t("digitize.result.columns.penalty"),
                  render: (_, m) =>
                    m.penalty
                      ? t(
                          m.penalty.graceDays === undefined
                            ? "digitize.result.penalty.RATE"
                            : "digitize.result.penalty.RATE_GRACE",
                          {
                            rate: m.penalty.ratePct,
                            cap: m.penalty.capPct,
                            grace: m.penalty.graceDays,
                          },
                        )
                      : t("digitize.result.penalty.NONE"),
                },
                {
                  key: "source",
                  title: t("digitize.result.columns.source"),
                  render: (_, m) => (
                    <Tag
                      style={{ margin: 0, whiteSpace: "nowrap" }}
                      color={
                        m.source === "NEEDS_CONFIRMATION"
                          ? "warning"
                          : "success"
                      }
                    >
                      {t(`digitize.result.sourceStatus.${m.source}`)}
                    </Tag>
                  ),
                },
              ]}
            />
          )}
          {pending ? (
            <div className={cx(shared.notice, styles.ambiguity)}>
              <b className={shared.noticeTitle}>
                {t("digitize.ambiguity.title", {
                  no: pending.sequence,
                  months: pending.relativeTermMonths ?? 0,
                })}
              </b>
              <span>{t("prepLite.digitize.ambiguityHint")}</span>
              <div className={styles.deadlineRow}>
                <label
                  htmlFor="milestone-deadline"
                  className={styles.deadlineLabel}
                >
                  {t("digitize.ambiguity.label", { no: pending.sequence })}
                  <DemoFillButton
                    testId="load-deadline-suggestion"
                    disabled={
                      data.locked ||
                      !!deadlineText.trim() ||
                      !data.suggestedDueDate
                    }
                    onClick={() => {
                      setDeadlineText(dateToInputText(data.suggestedDueDate));
                      setDeadlineInvalid(false);
                    }}
                  >
                    {t("digitize.ambiguity.loadSuggestion")}
                  </DemoFillButton>
                </label>
                <Input
                  id="milestone-deadline"
                  className={styles.deadlineInput}
                  value={deadlineText}
                  disabled={data.locked}
                  placeholder={t("digitize.ambiguity.placeholder", {
                    example: formatDate(new Date(2027, 0, 31)),
                  })}
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
                {data.approvers.length
                  ? data.approvers
                      .map((role) => td(`approvalRole.${role}`))
                      .join(", ")
                  : t("digitize.approvers.none")}
              </b>
            </div>
            <div className={styles.summaryBox}>
              <div className={styles.summaryLabel}>
                {t("digitize.total.title")}
              </div>
              <b className={styles.tabular}>
                {t("digitize.total.value", {
                  value: formatDecimalString(total),
                })}
              </b>
              <div
                className={
                  totalMatches ? styles.totalMatch : styles.totalMismatch
                }
              >
                {totalMatches
                  ? t("prepLite.digitize.totalMatch")
                  : t("digitize.total.mismatch", {
                      value: formatDecimalString(data.contractValueMillion),
                    })}
              </div>
            </div>
          </div>
          <Collapse
            ghost
            size="small"
            items={[
              {
                key: "clauses",
                label: t("prepLite.digitize.sourceToggle"),
                children: (
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
                ),
              },
            ]}
          />
          {confirm.isError ? (
            <Alert
              type="error"
              showIcon
              title={td(`errors.${errorCode ?? "UNKNOWN"}`, {
                defaultValue: errorCode ?? td("errors.UNKNOWN"),
              })}
            />
          ) : null}
          <div className={styles.footer}>
            <span className={styles.footerNote}>
              {data.locked
                ? t("prepLite.digitize.locked")
                : t("prepLite.digitize.lockNote")}
            </span>
            <Link
              to={`/contracts/${contractId}/sign-positions`}
              className={cx(shared.btnSecondary, styles.back)}
            >
              {t("digitize.footer.back")}
            </Link>
            <Button
              type="primary"
              size="small"
              disabled={
                confirm.isPending ||
                editing ||
                (!data.locked && !extractionReady)
              }
              onClick={onConfirm}
              data-testid="digitize-confirm"
            >
              {data.locked
                ? t("digitize.footer.continue")
                : t("digitize.footer.confirm")}
            </Button>
          </div>
          {!data.locked && !extractionReady ? (
            <Alert
              type="info"
              showIcon
              title={t("prepLite.digitize.extractionFirst")}
              action={
                <Button
                  size="small"
                  onClick={() =>
                    document
                      .querySelector('[data-testid="extraction-panel"]')
                      ?.scrollIntoView({ behavior: "smooth", block: "start" })
                  }
                >
                  {t("digitize.goExtraction")}
                </Button>
              }
            />
          ) : null}
        </section>
      </div>
    </>
  );
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
  const { t: td } = useTranslation("domain");
  const vnd = (million: string) =>
    t("digitize.source.vnd", { value: formatDecimalString(million) });
  const delivery = data.milestones.find((m) => m.sourceClause === "DELIVERY");
  const penalised = data.milestones.find((m) => m.penalty);
  let values: Record<string, string | number> | null = null;
  switch (clause.kind) {
    case "TOTAL_VALUE":
      values = {
        value: vnd(data.contractValueMillion),
        milestones: data.milestones.length,
      };
      break;
    case "DELIVERY":
      if (delivery)
        values = {
          value: vnd(delivery.valueMillion),
          date: delivery.dueDate
            ? formatDate(delivery.dueDate)
            : t("digitize.result.dueUnknown"),
          documents: formatList(
            delivery.eventTypes.map((type) => td(`eventType.${type}`)),
          ),
        };
      break;
    case "LATE_PENALTY":
      if (penalised?.penalty)
        values = {
          rate: penalised.penalty.ratePct,
          cap: penalised.penalty.capPct,
        };
      break;
    case "APPROVALS":
      values = { approvers: data.requiredApprovals };
      break;
  }
  if (!values) return null;
  return (
    <div className={highlighted ? styles.clauseOn : styles.clause}>
      <div className={styles.clauseLocation}>
        {clause.page
          ? t("digitize.source.locationPage", {
              article: clause.article,
              page: clause.page,
            })
          : t("digitize.source.location", { article: clause.article })}
      </div>
      <Trans
        t={t}
        i18nKey={`digitize.source.clause.${clause.kind}`}
        values={values}
        components={{ mark: <mark className={styles.mark} /> }}
      />
      {clause.quote ? (
        <div className={styles.clauseLocation} data-testid="clause-quote">
          {t("digitize.source.quote", { quote: clause.quote })}
        </div>
      ) : null}
    </div>
  );
}
