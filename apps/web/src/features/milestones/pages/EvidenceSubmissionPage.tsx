import { useState, type ChangeEvent, type DragEvent } from "react";
import { Alert, App as AntApp, Button, Space, Tag } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import type {
  Attachment,
  EvidenceSlot,
  EvidenceWorkspace,
} from "@codecash/contracts";
import { ApiError } from "@/shared/api/client";
import {
  uploadEvidenceFile,
  getEvidenceWorkspace,
  removeEvidenceFile,
  submitEvidence,
} from "@/shared/api/domain";
import { useCurrentUser } from "@/shared/auth/session";
import { AppPage } from "@/shared/layout/AppPage";
import { actorName, contractHeading } from "@/shared/lib/domain";
import {
  formatDate,
  formatDateTime,
  formatDecimalString,
  formatNumber,
} from "@/shared/lib/format";
import { ContractSideLayout } from "@/shared/ui/ContractSideLayout";
import { DecisionTag } from "@/shared/ui/DomainTags";
import { PageState } from "@/shared/ui/PageState";
import { KeyFigures, SideCard, SideSection } from "@/shared/ui/SidePanel";
import { ToneTag } from "@/shared/ui/ToneTag";
import { PdfTile } from "../components/PdfTile";
import styles from "./EvidenceSubmissionPage.module.css";

const isZero = (amount: string) => /^0(\.0+)?$/.test(amount);

/** The types the API accepts as evidence; it checks the bytes again. */
const EVIDENCE_ACCEPT = ".pdf,.png,.jpg,.jpeg,.docx,.xlsx";

/** Recording the evidence of one milestone: each document becomes an event in the Data Pack schema. */
export default function EvidenceSubmissionPage() {
  const { t } = useTranslation("milestones");
  const { t: tc } = useTranslation("common");
  const { t: td } = useTranslation("domain");
  const params = useParams();
  const user = useCurrentUser();
  const navigate = useNavigate();
  const { message } = AntApp.useApp();
  const queryClient = useQueryClient();
  const routeContractId = params.contractId;
  const routeSequence = params.milestoneNo
    ? Number(params.milestoneNo)
    : undefined;
  const workspace = useQuery({
    queryKey: [
      "milestones",
      "evidence",
      user.id,
      routeContractId ?? null,
      routeSequence ?? null,
    ],
    queryFn: () => getEvidenceWorkspace(routeContractId, routeSequence),
  });
  const data = workspace.data;
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["milestones"] });
  const failed = (error: unknown) =>
    message.error(
      td(`errors.${error instanceof ApiError ? error.code : "UNKNOWN"}`, {
        defaultValue: td("errors.UNKNOWN"),
      }),
    );
  const attach = useMutation({
    mutationFn: uploadEvidenceFile,
    onSuccess: refresh,
    onError: failed,
  });
  const remove = useMutation({
    mutationFn: removeEvidenceFile,
    onSuccess: refresh,
    onError: failed,
  });
  const submit = useMutation({
    mutationFn: submitEvidence,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["milestones"] });
      if (result.evaluation)
        message.success(
          t("submit.done", {
            status: td(`status.${result.evaluation.status}`),
            reason: td(`reason.${result.evaluation.reasonCode}`),
          }),
        );
      if (data)
        navigate(
          `/contracts/${data.contract.id}/milestones/${data.milestone.sequence}/decision`,
        );
    },
    onError: failed,
  });

  return (
    <AppPage
      guide="evidence"
      active="tasks"
      tags={
        data && data.overdueDays > 0 ? (
          <ToneTag tone="danger">
            {td("overdue", { count: data.overdueDays })}
          </ToneTag>
        ) : undefined
      }
      breadcrumb={[
        { label: tc("nav.tasks"), to: "/tasks" },
        {
          label: data
            ? t("submit.title", {
                no: data.milestone.sequence,
                name: td(`milestoneType.${data.milestone.type}`),
              })
            : (routeContractId ?? ""),
        },
      ]}
    >
      {workspace.isPending ? <PageState kind="loading" /> : null}
      {workspace.isError ? (
        workspace.error instanceof ApiError &&
        workspace.error.code === "NO_OPEN_TASK" ? (
          <PageState kind="empty" title={td("errors.NO_OPEN_TASK")} />
        ) : (
          <PageState kind="error" onRetry={() => void workspace.refetch()} />
        )
      ) : null}
      {data ? (
        <Workspace
          data={data}
          busy={attach.isPending || remove.isPending || submit.isPending}
          submitting={submit.isPending}
          onAttach={(eventType, file) =>
            attach.mutate({
              contractId: data.contract.id,
              sequence: data.milestone.sequence,
              eventType,
              file,
            })
          }
          onRemove={(attachmentId) =>
            remove.mutate({
              contractId: data.contract.id,
              sequence: data.milestone.sequence,
              attachmentId,
            })
          }
          onSubmit={() =>
            submit.mutate({
              contractId: data.contract.id,
              sequence: data.milestone.sequence,
            })
          }
        />
      ) : null}
    </AppPage>
  );
}

interface WorkspaceProps {
  data: EvidenceWorkspace;
  busy: boolean;
  submitting: boolean;
  onAttach: (eventType: string, file: File) => void;
  onRemove: (attachmentId: string) => void;
  onSubmit: () => void;
}

function Workspace({
  data,
  busy,
  submitting,
  onAttach,
  onRemove,
  onSubmit,
}: WorkspaceProps) {
  const { t } = useTranslation("milestones");
  const { t: td } = useTranslation("domain");
  const navigate = useNavigate();
  const [dragging, setDragging] = useState(false);
  const { milestone, contract, preview } = data;
  const deadline = milestone.dueDate
    ? new Date(
        new Date(`${milestone.dueDate}T00:00:00`).getTime() +
          milestone.graceDays * 86_400_000,
      )
    : null;
  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    for (const file of Array.from(event.dataTransfer.files))
      onAttach("OTHER", file);
  };
  const onPick = (type: string) => (event: ChangeEvent<HTMLInputElement>) => {
    for (const file of Array.from(event.target.files ?? []))
      onAttach(type, file);
    event.target.value = "";
  };
  const pending = data.slots.filter(
    (slot) => slot.mine && slot.state !== "VALID",
  );

  return (
    <ContractSideLayout
      contractId={contract.id}
      context={
        <>
          {contractHeading(contract)} · {td(`side.${data.side}`)}
        </>
      }
    >
      <SideCard>
        <SideSection title={t("submit.required.title")}>
          {milestone.latePenalty && deadline ? (
            <div className={styles.penaltyLine}>
              {t("workLite.evidence.penalty", {
                due: formatDate(milestone.dueDate),
                deadline: formatDate(deadline),
                rate: formatNumber(Number(milestone.penaltyRatePct), 2),
                cap: formatNumber(Number(milestone.maxPenaltyPct), 2),
              })}
            </div>
          ) : null}
          {data.slots.map((slot) => (
            <SlotCard
              key={slot.eventType}
              slot={slot}
              onPick={onPick(slot.eventType)}
              onRemove={onRemove}
            />
          ))}
          {data.extras.map((file) => (
            <ExtraFile key={file.id} file={file} onRemove={onRemove} />
          ))}
          {pending.length ? (
            <label
              className={`${styles.dropzone} ${dragging ? styles.dropzoneActive : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
            >
              {t("submit.dropzone")}
              <input
                type="file"
                multiple
                accept={EVIDENCE_ACCEPT}
                className={styles.fileInput}
                aria-label={t("submit.dropzoneAria")}
                onChange={onPick("OTHER")}
              />
            </label>
          ) : (
            <Alert type="success" showIcon title={t("submit.nothingLeft")} />
          )}
        </SideSection>
        {preview ? (
          <SideSection
            title={
              <span className={styles.titleRow}>
                {t("submit.preview.title")}
                <DecisionTag decision={preview.decision} />
              </span>
            }
          >
            <KeyFigures
              items={[
                {
                  key: "penalty",
                  label: `${t("approve.proposal.penalty")} (${t("common.millionUnit")})`,
                  value: formatDecimalString(preview.penaltyMillion),
                  tone: isZero(preview.penaltyMillion) ? undefined : "warning",
                },
                {
                  key: "payable",
                  label: `${t("approve.proposal.payable")} (${t("common.millionUnit")})`,
                  value: formatDecimalString(preview.payableMillion),
                  tone: isZero(preview.payableMillion) ? undefined : "success",
                },
              ]}
            />
            <p className={styles.explain}>
              {td(`reason.${preview.reasonCode}`)}
              {preview.daysLate > 0
                ? ` · ${td("overdue", { count: preview.daysLate })}`
                : ""}
            </p>
          </SideSection>
        ) : null}
        <SideSection>
          <p className={styles.lockNote}>{t("workLite.evidence.lockNote")}</p>
          <div className={styles.actions}>
            <Button onClick={() => navigate("/tasks")}>
              {t("submit.later")}
            </Button>
            <Button
              type="primary"
              disabled={busy || !data.canSubmit}
              loading={submitting}
              onClick={onSubmit}
              data-testid="submit-evidence"
            >
              {t("submit.submit", { count: pending.length })}
            </Button>
          </div>
        </SideSection>
      </SideCard>
    </ContractSideLayout>
  );
}

function SlotCard({
  slot,
  onPick,
  onRemove,
}: {
  slot: EvidenceSlot;
  onPick: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemove: (id: string) => void;
}) {
  const { t } = useTranslation("milestones");
  const { t: td } = useTranslation("domain");
  const name = td(`eventType.${slot.eventType}`);
  // The page context already names the actor's side; only the other side's documents say whose they are.
  const sideTag = slot.mine ? null : (
    <Tag style={{ margin: 0 }}>{td(`side.${slot.side}`)}</Tag>
  );
  if (slot.state === "VALID" && slot.evidence)
    return (
      <div
        className={`${styles.file} ${styles.fileSigned}`}
        data-testid="evidence-slot"
      >
        <PdfTile variant="signed" />
        <div className={styles.fileInfo}>
          <b>{name}</b> {sideTag}
          <div className={styles.fileMeta}>
            {t("submit.file.recorded", {
              by:
                slot.evidence.recordedBy ?? actorName(td, slot.evidence.actor),
              at: formatDateTime(slot.evidence.at),
            })}
          </div>
        </div>
        <Space size={4}>
          <ToneTag tone="success">{t("submit.file.valid")}</ToneTag>
        </Space>
      </div>
    );
  if (!slot.mine)
    return (
      <div
        className={`${styles.file} ${styles.fileExtra}`}
        data-testid="evidence-slot"
      >
        <PdfTile variant="plain" />
        <div className={styles.fileInfo}>
          <b>{name}</b> {sideTag}
          <div className={styles.fileMeta}>
            {t(
              slot.state === "UNAUTHORIZED"
                ? "submit.file.otherUnauthorized"
                : "submit.file.otherSide",
              {
                side: td(`side.${slot.side}`),
              },
            )}
          </div>
        </div>
        <ToneTag tone={slot.state === "UNAUTHORIZED" ? "danger" : "neutral"}>
          {slot.state === "UNAUTHORIZED"
            ? td("eventClass.UNAUTHORIZED")
            : t("submit.file.waiting")}
        </ToneTag>
      </div>
    );
  if (slot.attachment)
    return (
      <div
        className={`${styles.file} ${styles.fileActive}`}
        data-testid="evidence-slot"
      >
        <div className={styles.fileRow}>
          <PdfTile variant="unsigned" />
          <div className={styles.fileInfo}>
            <b>{name}</b> {sideTag}
            <div className={styles.fileMeta}>
              {t("submit.file.meta", {
                fileName: slot.attachment.fileName,
                size: formatNumber(slot.attachment.sizeMb, 1),
              })}
            </div>
          </div>
          <ToneTag tone="primary">{t("submit.file.ready")}</ToneTag>
          <button
            type="button"
            className={`${styles.textButton} ${styles.textButtonDanger}`}
            onClick={() => onRemove(slot.attachment!.id)}
          >
            {t("submit.file.remove")}
          </button>
        </div>
      </div>
    );
  return (
    <label
      className={`${styles.file} ${styles.fileEmpty}`}
      data-testid="evidence-slot"
    >
      <PdfTile variant="unsigned" />
      <span className={styles.fileInfo}>
        <b>{name}</b> {sideTag}
        <span className={styles.fileMeta}>
          {" "}
          ·{" "}
          {slot.state === "UNAUTHORIZED"
            ? t("submit.file.unauthorizedMine")
            : t("submit.file.empty")}
        </span>
      </span>
      <span className={styles.textButton}>{t("submit.file.choose")}</span>
      <input
        type="file"
        accept={EVIDENCE_ACCEPT}
        className={styles.fileInput}
        aria-label={t("submit.file.chooseAria", { document: name })}
        data-testid={`evidence-input-${slot.eventType}`}
        onChange={onPick}
      />
    </label>
  );
}

function ExtraFile({
  file,
  onRemove,
}: {
  file: Attachment;
  onRemove: (id: string) => void;
}) {
  const { t } = useTranslation("milestones");
  return (
    <div className={`${styles.file} ${styles.fileExtra}`}>
      <PdfTile variant="plain" />
      <div className={styles.fileInfo}>
        <b>{t("submit.file.extraTitle")}</b>
        <div className={styles.fileMeta}>
          {t("submit.file.meta", {
            fileName: file.fileName,
            size: formatNumber(file.sizeMb, 1),
          })}
        </div>
      </div>
      <button
        type="button"
        className={`${styles.textButton} ${styles.textButtonDanger}`}
        onClick={() => onRemove(file.id)}
      >
        {t("submit.file.remove")}
      </button>
    </div>
  );
}
