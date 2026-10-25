import { DemoFillButton } from "@/shared/ui/DemoFillButton";
import { useId, useState } from "react";
import { Alert, App as AntApp, Button, Input, Modal, Space, Tag } from "antd";
import { WorkflowContext } from "@/shared/ui/WorkflowContext";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { ApprovalSlot, ApprovalView } from "@codecash/contracts";
import { ApiError } from "@/shared/api/client";
import {
  castVote,
  getApprovalView,
  type VoteChoice,
} from "@/shared/api/domain";
import { AppPage } from "@/shared/layout/AppPage";
import { formatDateTime, formatDecimalString } from "@/shared/lib/format";
import {
  DecisionTag,
  MilestoneStatusTag,
  OriginTag,
} from "@/shared/ui/DomainTags";
import { PageState } from "@/shared/ui/PageState";
import { Panel } from "@/shared/ui/Panel";
import { ToneTag } from "@/shared/ui/ToneTag";
import { PdfTile } from "../components/PdfTile";
import styles from "./PaymentApprovalPage.module.css";

/** Approval of a milestone payment by one of the buyer's approvers (BR-10: one role, one approval). */
export default function PaymentApprovalPage() {
  const { t } = useTranslation("milestones");
  const { t: tc } = useTranslation("common");
  const { t: td } = useTranslation("domain");
  const params = useParams();
  const routeContractId = params.contractId;
  const routeSequence = params.milestoneNo
    ? Number(params.milestoneNo)
    : undefined;
  const view = useQuery({
    queryKey: [
      "milestones",
      "approval",
      routeContractId ?? null,
      routeSequence ?? null,
    ],
    queryFn: () => getApprovalView(routeContractId, routeSequence),
  });
  const data = view.data;
  return (
    <AppPage
      guide="approval"
      active="tasks"
      breadcrumb={[
        { label: tc("nav.tasks"), to: "/tasks" },
        {
          label: data
            ? t("approve.title", {
                no: data.milestone.sequence,
                name: td(`milestoneType.${data.milestone.type}`),
              })
            : (routeContractId ?? ""),
        },
      ]}
      contentClassName={styles.content}
      tags={
        data ? (
          <Space size={6} wrap>
            <MilestoneStatusTag status={data.milestone.status} />
            <DecisionTag decision={data.evaluation.decision} />
            <OriginTag origin={data.contract.origin} />
          </Space>
        ) : undefined
      }
    >
      {view.isPending ? <PageState kind="loading" /> : null}
      {view.isError ? (
        view.error instanceof ApiError && view.error.code === "NO_OPEN_TASK" ? (
          <PageState kind="empty" title={td("errors.NO_OPEN_TASK")} />
        ) : (
          <PageState kind="error" onRetry={() => void view.refetch()} />
        )
      ) : null}
      {data ? <ApprovalWorkspace data={data} /> : null}
    </AppPage>
  );
}

function ApprovalWorkspace({ data }: { data: ApprovalView }) {
  const { t } = useTranslation("milestones");
  const { t: td } = useTranslation("domain");
  const { message } = AntApp.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const noteId = useId();
  const [note, setNote] = useState("");
  const [noteMissing, setNoteMissing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const { milestone, contract, evaluation, preview } = data;
  const decisionPath = `/contracts/${contract.id}/milestones/${milestone.sequence}/decision`;

  const vote = useMutation({
    mutationFn: (choice: VoteChoice) =>
      castVote({
        contractId: contract.id,
        sequence: milestone.sequence,
        choice,
        note,
      }),
    onSuccess: async (result, choice) => {
      setConfirming(false);
      await queryClient.invalidateQueries({ queryKey: ["milestones"] });
      if (choice === "REQUEST_INFO") {
        message.success(t("approve.requested"));
        setNote("");
        return;
      }
      if (result.evaluation)
        message.success(
          t("approve.done", {
            status: td(`status.${result.evaluation.status}`),
            reason: td(`reason.${result.evaluation.reasonCode}`),
          }),
        );
      navigate(decisionPath);
    },
    onError: (error) => {
      setConfirming(false);
      message.error(
        td(`errors.${error instanceof ApiError ? error.code : "UNKNOWN"}`, {
          defaultValue: td("errors.UNKNOWN"),
        }),
      );
    },
  });
  const needNote = (choice: "REJECT" | "REQUEST_INFO") => {
    if (!note.trim()) {
      setNoteMissing(true);
      return;
    }
    setNoteMissing(false);
    vote.mutate(choice);
  };

  return (
    <>
      <WorkflowContext>
        {contract.id} · {contract.title} · {contract.supplier.name}
      </WorkflowContext>
      {data.blockedReason ? (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          title={t(`approve.blocked.${data.blockedReason}`, {
            defaultValue: data.blockedReason,
          })}
        />
      ) : null}
      <div className={styles.grid}>
        <div className={styles.column}>
          <Panel className={`${styles.panel} ${styles.proposal}`}>
            <div className={styles.proposalTitle}>
              <h2>
                {t(
                  preview
                    ? "approve.proposal.title"
                    : "approve.proposal.currentTitle",
                )}
              </h2>
              {preview ? <DecisionTag decision={preview.decision} /> : null}
            </div>
            <div className={styles.stats}>
              <div className={styles.stat}>
                <div className={styles.statLabel}>
                  {t("approve.proposal.milestoneValue")}
                </div>
                <b className={styles.statValue}>
                  {formatDecimalString(milestone.plannedMillion)}
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
                  {formatDecimalString(
                    preview?.penaltyMillion ?? evaluation.penaltyMillion,
                  )}
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
                  {formatDecimalString(
                    preview?.payableMillion ?? evaluation.payableMillion,
                  )}
                </b>
                <span className={styles.statUnit}>
                  {" "}
                  {t("common.millionUnit")}
                </span>
              </div>
            </div>
            <div className={styles.explain}>
              {preview
                ? t("approve.proposal.preview", {
                    decision: preview.decision,
                    reason: td(`reason.${preview.reasonCode}`),
                    count: preview.daysLate,
                  })
                : t("approve.proposal.current", {
                    reason: td(`reason.${evaluation.reasonCode}`),
                  })}
            </div>
            <div className={styles.reason}>
              <Link to={decisionPath}>{t("approve.proposal.trace")}</Link>
            </div>
          </Panel>

          <Panel className={`${styles.panel} ${styles.documents}`}>
            <h2>{t("approve.documents.title")}</h2>
            {data.evidence.map((event) => (
              <div key={event.id} className={styles.document}>
                <PdfTile variant="plain" />
                <div className={styles.documentInfo}>
                  <b>{td(`eventType.${event.type}`)}</b>
                  <div className={styles.documentMeta}>
                    {t("approve.documents.recorded", {
                      id: event.id,
                      by: event.recordedBy ?? event.actor.name,
                      at: formatDateTime(event.at),
                    })}
                  </div>
                </div>
                <Space size={4} wrap>
                  <ToneTag tone="success">{td("eventClass.EVIDENCE")}</ToneTag>
                  <OriginTag origin={event.origin} />
                </Space>
              </div>
            ))}
            {milestone.requirements
              .filter((r) => r.state !== "VALID")
              .map((r) => (
                <div key={r.eventType} className={styles.document}>
                  <PdfTile variant="plain" />
                  <div className={styles.documentInfo}>
                    <b>{td(`eventType.${r.eventType}`)}</b>
                    <div className={styles.documentMeta}>
                      {t("approve.documents.missing", {
                        side: td(`side.${r.side}`),
                      })}
                    </div>
                  </div>
                  <ToneTag tone="danger">
                    {td(
                      `eventClass.${r.state === "UNAUTHORIZED" ? "UNAUTHORIZED" : "WRONG_STATUS"}`,
                    )}
                  </ToneTag>
                </div>
              ))}
            <div className={styles.documentsNote}>
              {t("approve.documents.note")}
            </div>
          </Panel>
        </div>

        <Panel className={`${styles.panel} ${styles.decisionPanel}`}>
          <h2>
            {t("approve.progress.title", {
              quorum: milestone.quorum,
              roles: milestone.approvalRoles.length,
            })}
          </h2>
          <ol className={styles.steps}>
            {data.slots.map((slot, index) => (
              <StepItem key={slot.role} slot={slot} index={index} />
            ))}
          </ol>
          <div className={styles.consequences}>
            <b>{t("approve.consequences.title")}</b>
            <div className={styles.consequenceFirst}>
              {t("approve.consequences.approve")}
            </div>
            <div className={styles.consequence}>
              {t("approve.consequences.requestInfo")}
            </div>
            <div className={styles.consequence}>
              {t("approve.consequences.reject")}
            </div>
          </div>
          <div>
            <label htmlFor={noteId} className={styles.noteLabel}>
              {t("approve.note.label")}{" "}
              <DemoFillButton
                disabled={!!note.trim()}
                onClick={() => {
                  setNote(t("approve.note.demo"));
                  setNoteMissing(false);
                }}
              />
              <span className={styles.noteHint}>{t("approve.note.hint")}</span>
            </label>
            <Input.TextArea
              id={noteId}
              rows={2}
              className={`${styles.noteInput} ${noteMissing ? styles.noteInputInvalid : ""}`}
              value={note}
              placeholder={t("approve.note.placeholder")}
              maxLength={2000}
              showCount
              onBlur={() => {
                if (note && !note.trim()) setNoteMissing(true);
              }}
              aria-invalid={noteMissing}
              onChange={(event) => {
                setNote(event.target.value);
                if (event.target.value.trim()) setNoteMissing(false);
              }}
            />
            {noteMissing ? (
              <p className={styles.error} role="alert">
                {t("approve.note.required")}
              </p>
            ) : null}
          </div>
          <div className={styles.actions}>
            <Button
              color="danger"
              variant="outlined"
              disabled={!data.canReject || vote.isPending}
              onClick={() => needNote("REJECT")}
            >
              {t("approve.actions.reject")}
            </Button>
            <Button
              color="orange"
              variant="outlined"
              disabled={!data.canReject || vote.isPending}
              onClick={() => needNote("REQUEST_INFO")}
            >
              {t("approve.actions.requestInfo")}
            </Button>
            <Button
              color="green"
              variant="solid"
              disabled={!data.canApprove || vote.isPending}
              onClick={() => setConfirming(true)}
              data-testid="approve-payment"
            >
              {t("approve.actions.approve")}
            </Button>
          </div>
        </Panel>
      </div>
      <Modal
        open={confirming}
        title={t("approve.confirm.title")}
        okText={t("approve.confirm.submit")}
        cancelText={t("approve.confirm.cancel")}
        confirmLoading={vote.isPending}
        onOk={() => vote.mutate("APPROVE")}
        onCancel={() => setConfirming(false)}
      >
        {t("approve.confirm.body", {
          no: milestone.sequence,
          name,
          decision: preview?.decision ?? evaluation.decision,
          payable: formatDecimalString(
            preview?.payableMillion ?? evaluation.payableMillion,
          ),
        })}
      </Modal>
    </>
  );
}

function StepItem({ slot, index }: { slot: ApprovalSlot; index: number }) {
  const { t } = useTranslation("milestones");
  const { t: td } = useTranslation("domain");
  const tone =
    slot.state === "APPROVED"
      ? "Done"
      : slot.state === "REJECTED"
        ? "Stopped"
        : slot.isYou
          ? "Current"
          : "Pending";
  const marker =
    slot.state === "APPROVED"
      ? "✓"
      : slot.state === "REJECTED"
        ? "×"
        : String(index + 1);
  return (
    <li className={`${styles.step} ${styles[`step${tone}`]}`}>
      <span
        className={`${styles.marker} ${styles[`marker${tone}`]}`}
        aria-hidden="true"
      >
        {marker}
      </span>
      <div className={styles.stepBody}>
        <b>{td(`approvalRole.${slot.role}`)}</b> ·{" "}
        {slot.isYou ? t("approve.progress.you") : slot.personName}{" "}
        <Tag style={{ margin: 0 }}>{slot.partyId}</Tag>
        <div className={styles.stepSub}>
          {slot.state === "PENDING"
            ? t(
                slot.isYou
                  ? "approve.progress.state.CURRENT_YOU"
                  : "approve.progress.state.WAITING",
              )
            : t(`approve.progress.state.${slot.state}`, {
                time: slot.at ? formatDateTime(slot.at) : "",
              })}
          {slot.eventId ? ` · ${slot.eventId}` : ""}
        </div>
      </div>
    </li>
  );
}
