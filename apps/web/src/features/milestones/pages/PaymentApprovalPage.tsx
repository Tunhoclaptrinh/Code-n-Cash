import { UiTextarea } from "@/shared/ui/controls";
import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trans, useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "@/shared/api/client";
import { useCurrentUser } from "@/shared/auth/session";
import { AppShell } from "@/shared/layout/AppShell";
import {
  formatDateTime,
  formatMillionVnd,
  formatNumber,
  formatTime,
} from "@/shared/lib/format";
import {
  castVote,
  getApprovalView,
  markDocumentViewed,
  type ApprovalStep,
  type ApprovalView,
} from "../api/approvals.api";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { PageMessage } from "../components/PageMessage";
import { PdfTile } from "../components/PdfTile";
import { toneOfDecision } from "../components/StatusBadge";
import { evidenceName, numberWord } from "../lib/display";
import type { VoteChoice } from "../types";
import styles from "./PaymentApprovalPage.module.css";

export default function PaymentApprovalPage() {
  const { t } = useTranslation("milestones");
  const { t: tc } = useTranslation("common");
  const params = useParams();
  const user = useCurrentUser();
  const routeContractId = params.contractId;
  const routeMilestoneNo = params.milestoneNo
    ? Number(params.milestoneNo)
    : undefined;

  const view = useQuery({
    queryKey: [
      "milestones",
      "approval",
      user.id,
      routeContractId ?? null,
      routeMilestoneNo ?? null,
    ],
    queryFn: () =>
      getApprovalView(user.id, user.role, routeContractId, routeMilestoneNo),
  });
  const data = view.data;

  const breadcrumb = [
    { label: tc("nav.approvals"), to: "/approvals" },
    {
      label: data
        ? t("approve.breadcrumb", {
            contractId: data.contractId,
            no: data.milestone.no,
            name: t(`milestoneKind.${data.milestone.kind}`),
          })
        : (routeContractId ?? ""),
    },
  ];

  return (
    <AppShell
      active="approvals"
      breadcrumb={breadcrumb}
      contentClassName={styles.content}
    >
      {view.isPending ? <PageMessage kind="loading" /> : null}
      {view.isError ? <PageMessage kind="error" /> : null}
      {data ? <ApprovalWorkspace data={data} /> : null}
    </AppShell>
  );
}

function ApprovalWorkspace({ data }: { data: ApprovalView }) {
  const { t } = useTranslation("milestones");
  const user = useCurrentUser();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const noteId = useId();
  const [note, setNote] = useState("");
  const [noteMissing, setNoteMissing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const { milestone, proposal } = data;
  const milestoneName = t(`milestoneKind.${milestone.kind}`);
  const open = data.status === "OPEN";

  const vote = useMutation({
    mutationFn: (choice: VoteChoice) =>
      castVote({
        userId: user.id,
        role: user.role,
        actorName: user.displayName,
        contractId: data.contractId,
        milestoneNo: milestone.no,
        choice,
        note,
      }),
    onSuccess: async (result) => {
      setConfirming(false);
      await queryClient.invalidateQueries({ queryKey: ["milestones"] });
      await queryClient.invalidateQueries({ queryKey: ["pending-task-count"] });
      if (result.finalized) {
        navigate(
          `/contracts/${data.contractId}/milestones/${milestone.no}/decision`,
        );
      }
    },
    onError: () => setConfirming(false),
  });

  const viewed = useMutation({
    mutationFn: (fileId: string) =>
      markDocumentViewed(data.contractId, milestone.no, fileId),
  });

  const hold = () => submitStopping("HOLD");
  const reject = () => submitStopping("REJECT");
  function submitStopping(choice: "HOLD" | "REJECT") {
    if (!note.trim()) {
      setNoteMissing(true);
      return;
    }
    setNoteMissing(false);
    vote.mutate(choice);
  }

  const payable = formatMillionVnd(proposal.payableMillion);
  const errorCode =
    vote.error instanceof ApiError ? vote.error.code : "UNKNOWN";
  const explainValues = {
    count: proposal.lateDays,
    rate: formatNumber(proposal.rateBpPerDay / 100, 2),
    value: formatMillionVnd(proposal.valueMillion),
    penalty: formatMillionVnd(proposal.penaltyMillion),
    cap: formatNumber(proposal.capBp / 100, 2),
    capAmount: formatMillionVnd(proposal.capMillion),
  };

  return (
    <>
      <div className={styles.heading}>
        <h1>{t("approve.title", { no: milestone.no, name: milestoneName })}</h1>
        <Badge tone={open ? "warning" : "neutral"} size="md">
          {t(`approve.state.${data.status}`)}
        </Badge>
      </div>

      <div className={styles.grid}>
        <div className={styles.column}>
          <Card className={`${styles.panel} ${styles.proposal}`}>
            <div className={styles.proposalTitle}>
              <h2>{t("approve.proposal.title")}</h2>
              <Badge tone={toneOfDecision(proposal.code)} size="strong">
                {t(`decisionCode.${proposal.code}`)}
              </Badge>
            </div>
            <div className={styles.stats}>
              <div className={styles.stat}>
                <div className={styles.statLabel}>
                  {t("approve.proposal.milestoneValue")}
                </div>
                <b className={styles.statValue}>
                  {formatMillionVnd(proposal.valueMillion)}
                </b>
                <span className={styles.statUnit}>
                  {" "}
                  {t("common.millionUnit")}
                </span>
              </div>
              <div className={`${styles.stat} ${styles.statPenalty}`}>
                <div className={styles.statLabel}>
                  {t("approve.proposal.penalty")}
                </div>
                <b className={`${styles.statValue} ${styles.statValuePenalty}`}>
                  {formatMillionVnd(proposal.penaltyMillion)}
                </b>
                <span className={styles.statUnit}>
                  {" "}
                  {t("common.millionUnit")}
                </span>
              </div>
              <div className={`${styles.stat} ${styles.statPayable}`}>
                <div className={styles.statLabel}>
                  {t("approve.proposal.payable")}
                </div>
                <b className={`${styles.statValue} ${styles.statValuePayable}`}>
                  {payable}
                </b>
                <span className={styles.statUnit}>
                  {" "}
                  {t("common.millionUnit")}
                </span>
              </div>
            </div>
            <div className={styles.explain}>
              {proposal.lateDays > 0 ? (
                <Trans
                  t={t}
                  i18nKey={
                    proposal.capReached
                      ? "approve.proposal.explainCapped"
                      : "approve.proposal.explainLate"
                  }
                  values={explainValues}
                  components={{ b: <b /> }}
                />
              ) : (
                t("approve.proposal.explainOnTime")
              )}
            </div>
            <div className={styles.reason}>
              <Trans
                t={t}
                i18nKey="approve.proposal.reason"
                values={{
                  reason: t(
                    `approve.proposal.reasonCode.${proposal.reasonCode}`,
                  ),
                }}
                components={{ b: <b /> }}
              />
            </div>
          </Card>

          <Card className={`${styles.panel} ${styles.documents}`}>
            <h2>{t("approve.documents.title")}</h2>
            {data.documents.map((file) => (
              <div key={file.id} className={styles.document}>
                <PdfTile variant="plain" />
                <div className={styles.documentInfo}>
                  <b>{evidenceName(t, file.type)}</b>
                  {file.signature ? (
                    <div className={styles.documentMeta}>
                      {t("approve.documents.signedBy", {
                        name: file.signature.signerName,
                        at: formatDateTime(file.signature.signedAt),
                      })}
                    </div>
                  ) : null}
                </div>
                <Badge tone={file.signature?.valid ? "success" : "danger"}>
                  {file.signature?.valid
                    ? t("common.signatureValid")
                    : t("common.signatureInvalid")}
                </Badge>
                <Link
                  to={`/verify/${data.contractId}`}
                  className={styles.documentLink}
                  aria-label={t("approve.documents.viewAria", {
                    document: evidenceName(t, file.type),
                  })}
                  onClick={() => viewed.mutate(file.id)}
                >
                  {t("common.view")}
                </Link>
              </div>
            ))}
            <div className={styles.documentsNote}>
              {t("approve.documents.note", {
                count: data.documents.length,
                countWord: numberWord(
                  t,
                  data.documents.length,
                ).toLocaleLowerCase(),
              })}
            </div>
          </Card>
        </div>

        <Card className={`${styles.panel} ${styles.decisionPanel}`}>
          <h2>
            {t("approve.progress.title", {
              quorum: data.quorum,
              roles: data.distinctRoles,
            })}
          </h2>
          <ol className={styles.steps}>
            {data.steps.map((step, index) => (
              <StepItem key={step.role} step={step} index={index} />
            ))}
          </ol>

          <div className={styles.consequences}>
            <b>{t("approve.consequences.title")}</b>
            <div className={styles.consequenceFirst}>
              <Trans
                t={t}
                i18nKey="approve.consequences.approve"
                values={{
                  quorumWord: numberWord(t, data.quorum).toLocaleLowerCase(),
                  payable,
                }}
                components={{ b: <b className={styles.approveText} /> }}
              />
            </div>
            <div className={styles.consequence}>
              <Trans
                t={t}
                i18nKey="approve.consequences.hold"
                components={{ b: <b className={styles.holdText} /> }}
              />
            </div>
            <div className={styles.consequence}>
              <Trans
                t={t}
                i18nKey="approve.consequences.reject"
                components={{ b: <b className={styles.rejectText} /> }}
              />
            </div>
          </div>

          <div>
            <label htmlFor={noteId} className={styles.noteLabel}>
              {t("approve.note.label")}{" "}
              <span className={styles.noteHint}>{t("approve.note.hint")}</span>
            </label>
            <UiTextarea
              id={noteId}
              rows={2}
              className={`${styles.noteInput} ${noteMissing ? styles.noteInputInvalid : ""}`}
              value={note}
              aria-invalid={noteMissing}
              aria-describedby={noteMissing ? `${noteId}-error` : undefined}
              onChange={(event) => {
                setNote(event.target.value);
                if (event.target.value.trim()) setNoteMissing(false);
              }}
            />
            {noteMissing ? (
              <p id={`${noteId}-error`} className={styles.error} role="alert">
                {t("approve.note.required")}
              </p>
            ) : null}
            {vote.isError ? (
              <p className={styles.error} role="alert">
                {t(`approve.error.${errorCode}`, {
                  defaultValue: t("approve.error.UNKNOWN"),
                })}
              </p>
            ) : null}
          </div>

          <div className={styles.actions}>
            <Button
              variant="outlineDanger"
              size="md"
              disabled={!open || vote.isPending}
              onClick={reject}
            >
              {t("approve.actions.reject")}
            </Button>
            <Button
              variant="outlineWarning"
              size="md"
              disabled={!open || vote.isPending}
              onClick={hold}
            >
              {t("approve.actions.hold")}
            </Button>
            <Button
              variant="success"
              size="md"
              disabled={!open || vote.isPending}
              onClick={() => setConfirming(true)}
            >
              {t("approve.actions.approve")}
            </Button>
          </div>
        </Card>
      </div>

      <ConfirmDialog
        open={confirming}
        title={t("approve.confirm.title")}
        body={t("approve.confirm.body", {
          payable,
          no: milestone.no,
          name: milestoneName,
        })}
        confirmLabel={
          vote.isPending
            ? t("approve.confirm.submitting")
            : t("approve.confirm.submit")
        }
        cancelLabel={t("approve.confirm.cancel")}
        busy={vote.isPending}
        onConfirm={() => vote.mutate("APPROVE")}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}

function StepItem({ step, index }: { step: ApprovalStep; index: number }) {
  const { t } = useTranslation("milestones");
  const role = t(`participantRole.${step.role}`);

  const tone =
    step.state === "APPROVED"
      ? "Done"
      : step.state === "CURRENT"
        ? "Current"
        : step.state === "PENDING"
          ? "Pending"
          : "Stopped";
  const marker =
    step.state === "APPROVED"
      ? "✓"
      : step.state === "HELD"
        ? "!"
        : step.state === "REJECTED"
          ? "×"
          : String(index + 1);

  const headingKey = !step.required
    ? "headingOptional"
    : step.isYou || step.personName
      ? "heading"
      : "headingNoPerson";
  const person = step.isYou ? t("approve.progress.you") : step.personName;

  const stateKey =
    step.state === "CURRENT"
      ? step.isYou
        ? "CURRENT_YOU"
        : "CURRENT_OTHER"
      : step.state === "PENDING" && !step.required
        ? "PENDING_OPTIONAL"
        : step.state;

  return (
    <li className={`${styles.step} ${styles[`step${tone}`]}`}>
      <span
        className={`${styles.marker} ${styles[`marker${tone}`]}`}
        aria-hidden="true"
      >
        {marker}
      </span>
      <div className={styles.stepBody}>
        <Trans
          t={t}
          i18nKey={`approve.progress.${headingKey}`}
          values={{ role, person }}
          components={{ b: <b /> }}
        />
        <div className={styles.stepSub}>
          {t(`approve.progress.state.${stateKey}`, {
            time: step.signedAt ? formatTime(step.signedAt) : "",
          })}
        </div>
      </div>
    </li>
  );
}
