import { DemoFillButton } from "@/shared/ui/DemoFillButton";
import { useId, useState } from "react";
import { Alert, App as AntApp, Button, Input, Modal } from "antd";
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
import {
  actorName,
  contractHeading,
  statusRepeatsDecision,
} from "@/shared/lib/domain";
import { formatDateTime, formatDecimalString } from "@/shared/lib/format";
import { ContractSideLayout } from "@/shared/ui/ContractSideLayout";
import { DecisionTag, MilestoneStatusTag } from "@/shared/ui/DomainTags";
import { PageState } from "@/shared/ui/PageState";
import { KeyFigures, SideCard, SideSection } from "@/shared/ui/SidePanel";
import { ToneTag } from "@/shared/ui/ToneTag";
import { PdfTile } from "../components/PdfTile";
import styles from "./PaymentApprovalPage.module.css";

const isZero = (amount: string) => /^0(\.0+)?$/.test(amount);

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
        // The result card names the decision; the status is shown only when it adds something.
        data &&
        !statusRepeatsDecision(
          data.milestone.status,
          data.preview?.decision ?? data.evaluation.decision,
        ) ? (
          <MilestoneStatusTag status={data.milestone.status} />
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
  const { t: tc } = useTranslation("common");
  const { message } = AntApp.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const noteId = useId();
  const [note, setNote] = useState("");
  const [noteMissing, setNoteMissing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const { milestone, contract, evaluation, preview } = data;
  const penalty = preview?.penaltyMillion ?? evaluation.penaltyMillion;
  const payable = preview?.payableMillion ?? evaluation.payableMillion;
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
    <ContractSideLayout
      contractId={contract.id}
      context={
        <>
          {contractHeading(contract)} · {contract.supplier.name}
        </>
      }
    >
      {data.blockedReason ? (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          title={t(`workLite.approve.blocked.${data.blockedReason}`, {
            defaultValue: data.blockedReason,
          })}
        />
      ) : null}
      <SideCard>
        <SideSection
          title={
            <span className={styles.titleRow}>
              {t(
                preview
                  ? "approve.proposal.title"
                  : "approve.proposal.currentTitle",
              )}
              <DecisionTag
                decision={preview?.decision ?? evaluation.decision}
              />
            </span>
          }
          extra={<Link to={decisionPath}>{t("approve.proposal.trace")}</Link>}
        >
          <KeyFigures
            items={[
              {
                key: "planned",
                label: `${t("approve.proposal.milestoneValue")} (${t("common.millionUnit")})`,
                value: formatDecimalString(milestone.plannedMillion),
              },
              {
                key: "penalty",
                label: `${t("approve.proposal.penalty")} (${t("common.millionUnit")})`,
                value: formatDecimalString(penalty),
                tone: isZero(penalty) ? undefined : "warning",
              },
              {
                key: "payable",
                label: `${t("approve.proposal.payable")} (${t("common.millionUnit")})`,
                value: formatDecimalString(payable),
                tone: isZero(payable) ? undefined : "success",
              },
            ]}
          />
          <p className={styles.explain}>
            {preview
              ? t("approve.proposal.preview", {
                  reason: td(`reason.${preview.reasonCode}`),
                  count: preview.daysLate,
                })
              : t("approve.proposal.current", {
                  reason: td(`reason.${evaluation.reasonCode}`),
                })}
          </p>
        </SideSection>

        <SideSection title={t("approve.documents.title")}>
          <ul className={styles.documents}>
            {data.evidence.map((event) => (
              <li key={event.id} className={styles.document}>
                <PdfTile variant="plain" />
                <div className={styles.documentInfo}>
                  <b>{td(`eventType.${event.type}`)}</b>
                  <span className={styles.documentMeta}>
                    {t("approve.documents.recorded", {
                      by: event.recordedBy ?? actorName(td, event.actor),
                      at: formatDateTime(event.at),
                    })}
                  </span>
                </div>
              </li>
            ))}
            {milestone.requirements
              .filter((r) => r.state !== "VALID")
              .map((r) => (
                <li key={r.eventType} className={styles.document}>
                  <PdfTile variant="plain" />
                  <div className={styles.documentInfo}>
                    <b>{td(`eventType.${r.eventType}`)}</b>
                    <span className={styles.documentMeta}>
                      {t("approve.documents.missing", {
                        side: td(`side.${r.side}`),
                      })}
                    </span>
                  </div>
                  <ToneTag tone="danger">
                    {td(
                      `eventClass.${r.state === "UNAUTHORIZED" ? "UNAUTHORIZED" : "WRONG_STATUS"}`,
                    )}
                  </ToneTag>
                </li>
              ))}
          </ul>
        </SideSection>

        <SideSection
          title={t("approve.progress.title", {
            quorum: milestone.quorum,
            roles: milestone.approvalRoles.length,
          })}
        >
          <ol className={styles.steps}>
            {data.slots.map((slot, index) => (
              <StepItem key={slot.role} slot={slot} index={index} />
            ))}
          </ol>
        </SideSection>

        <SideSection>
          <div className={styles.noteBlock}>
            <label htmlFor={noteId} className={styles.noteLabel}>
              {t("approve.note.label")}
              <DemoFillButton
                disabled={!!note.trim()}
                onClick={() => {
                  setNote(
                    t("workLite.approve.demoNote", {
                      milestone: `${td("milestoneNo", { no: milestone.sequence })} · ${td(`milestoneType.${milestone.type}`)}`,
                    }),
                  );
                  setNoteMissing(false);
                }}
              >
                {tc("demoFill.action")}
              </DemoFillButton>
              <span className={styles.noteHint}>{t("approve.note.hint")}</span>
            </label>
            <Input.TextArea
              id={noteId}
              rows={2}
              status={noteMissing ? "error" : undefined}
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
              danger
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
        </SideSection>
      </SideCard>
      <Modal
        open={confirming}
        title={t("approve.confirm.title")}
        okText={t("approve.confirm.submit")}
        cancelText={t("approve.confirm.cancel")}
        confirmLoading={vote.isPending}
        okButtonProps={{ color: "green", variant: "solid" }}
        onOk={() => vote.mutate("APPROVE")}
        onCancel={() => setConfirming(false)}
      >
        {t("approve.confirm.body", {
          no: milestone.sequence,
          name: td(`milestoneType.${milestone.type}`),
          decision: td(`decision.${preview?.decision ?? evaluation.decision}`),
          payable: formatDecimalString(
            preview?.payableMillion ?? evaluation.payableMillion,
          ),
        })}
      </Modal>
    </ContractSideLayout>
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
        {slot.isYou ? t("approve.progress.you") : slot.personName}
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
        </div>
      </div>
    </li>
  );
}
