import { useState, type ChangeEvent, type DragEvent } from "react";
import { Button } from "antd";
import type { TFunction } from "i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trans, useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "@/shared/api/client";
import { useCurrentUser } from "@/shared/auth/session";
import { AppPage } from "@/shared/layout/AppPage";
import { formatMillionVnd, formatNumber } from "@/shared/lib/format";
import {
  attachEvidenceFile,
  getEvidenceWorkspace,
  removeEvidenceFile,
  signAndSubmitEvidence,
  type EvidenceWorkspace,
} from "../api/evidence.api";
import { ToneTag } from "@/shared/ui/ToneTag";
import { Panel } from "@/shared/ui/Panel";
import { PageState } from "@/shared/ui/PageState";
import { PdfTile } from "../components/PdfTile";
import {
  evidenceName,
  formatShortDateTime,
  lowerCase,
  numberWord,
} from "../lib/display";
import type { EvidenceFile, EvidenceType } from "../types";
import styles from "./EvidenceSubmissionPage.module.css";

const AFTERMATH_STEPS = [
  { key: "validate", actor: "SYSTEM" },
  { key: "match", actor: "SYSTEM" },
  { key: "approve", actor: "HUMAN" },
  { key: "result", actor: "SYSTEM" },
] as const;

function toMegabytes(bytes: number): number {
  return Math.max(0.1, Math.round((bytes / 1_048_576) * 10) / 10);
}

export default function EvidenceSubmissionPage() {
  const { t, i18n } = useTranslation("milestones");
  const { t: tc } = useTranslation("common");
  const params = useParams();
  const user = useCurrentUser();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const routeContractId = params.contractId;
  const routeMilestoneNo = params.milestoneNo
    ? Number(params.milestoneNo)
    : undefined;
  const workspaceKey = [
    "milestones",
    "evidence",
    user.id,
    routeContractId ?? null,
    routeMilestoneNo ?? null,
  ];
  const workspace = useQuery({
    queryKey: workspaceKey,
    queryFn: () =>
      getEvidenceWorkspace(user.id, routeContractId, routeMilestoneNo),
  });
  const data = workspace.data;

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["milestones"] });

  const attach = useMutation({
    mutationFn: attachEvidenceFile,
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (input: {
      contractId: string;
      milestoneNo: number;
      fileId: string;
    }) => removeEvidenceFile(input.contractId, input.milestoneNo, input.fileId),
    onSuccess: refresh,
  });
  const submit = useMutation({
    mutationFn: signAndSubmitEvidence,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["milestones"] });
      await queryClient.invalidateQueries({ queryKey: ["pending-task-count"] });
      navigate("/tasks");
    },
  });

  const breadcrumb = [
    { label: tc("nav.tasks"), to: "/tasks" },
    {
      label: data
        ? t("submit.breadcrumb", {
            contractId: data.contractId,
            no: data.milestone.no,
          })
        : (routeContractId ?? ""),
    },
  ];

  return (
    <AppPage active="submissions" breadcrumb={breadcrumb}>
      {workspace.isPending ? <PageState kind="loading" /> : null}
      {workspace.isError ? <PageState kind="error" /> : null}
      {data ? (
        <Workspace
          data={data}
          language={i18n.language}
          busy={attach.isPending || remove.isPending || submit.isPending}
          submitting={submit.isPending}
          submitError={submit.error}
          onAttach={(type, file) =>
            attach.mutate({
              contractId: data.contractId,
              milestoneNo: data.milestone.no,
              type,
              fileName: file.name,
              sizeMb: toMegabytes(file.size),
            })
          }
          onRemove={(fileId) =>
            remove.mutate({
              contractId: data.contractId,
              milestoneNo: data.milestone.no,
              fileId,
            })
          }
          onSubmit={() =>
            submit.mutate({
              userId: user.id,
              signerName: user.displayName,
              contractId: data.contractId,
              milestoneNo: data.milestone.no,
            })
          }
        />
      ) : null}
    </AppPage>
  );
}

interface WorkspaceProps {
  data: EvidenceWorkspace;
  language: string;
  busy: boolean;
  submitting: boolean;
  submitError: Error | null;
  onAttach: (type: EvidenceType, file: File) => void;
  onRemove: (fileId: string) => void;
  onSubmit: () => void;
}

function Workspace({
  data,
  language,
  busy,
  submitting,
  submitError,
  onAttach,
  onRemove,
  onSubmit,
}: WorkspaceProps) {
  const { t } = useTranslation("milestones");
  const navigate = useNavigate();
  const [dragging, setDragging] = useState(false);
  const { milestone, files, penaltyEstimate } = data;
  const milestoneName = t(`milestoneKind.${milestone.kind}`);
  const submitted = milestone.status === "AWAITING_APPROVAL";

  const requiredFiles = milestone.requiredEvidence.map((type) => ({
    type,
    file: files.find((file) => file.type === type),
  }));
  const extras = files.filter(
    (file) => !milestone.requiredEvidence.includes(file.type),
  );
  const nextToSign = requiredFiles.find(
    (slot) => slot.file && !slot.file.signature,
  );
  const activeType = nextToSign?.type;

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    for (const file of Array.from(event.dataTransfer.files))
      onAttach("OTHER", file);
  };

  const onPick =
    (type: EvidenceType) => (event: ChangeEvent<HTMLInputElement>) => {
      for (const file of Array.from(event.target.files ?? []))
        onAttach(type, file);
      event.target.value = "";
    };

  const submitLabel = submitting
    ? t("submit.submitting")
    : submitted
      ? t("submit.submitted")
      : nextToSign
        ? t("submit.signAndSubmit", {
            document: lowerCase(evidenceName(t, nextToSign.type), language),
          })
        : t("submit.submit");

  return (
    <>
      <div className={styles.heading}>
        <h1>{t("submit.title", { no: milestone.no, name: milestoneName })}</h1>
        {data.overdueDays > 0 ? (
          <ToneTag tone="danger">
            {t("submit.overdue", { count: data.overdueDays })}
          </ToneTag>
        ) : null}
      </div>

      <div className={styles.grid}>
        <Panel className={`${styles.panel} ${styles.panelLeft}`}>
          <h2>{t("submit.required.title")}</h2>

          {requiredFiles.map(({ type, file }) =>
            file ? (
              <RequiredFileCard
                key={file.id}
                file={file}
                active={type === activeType}
                contractId={data.contractId}
              />
            ) : (
              <label
                key={type}
                className={`${styles.file} ${styles.fileEmpty}`}
              >
                <PdfTile variant="unsigned" />
                <span className={styles.fileInfo}>
                  <b>{evidenceName(t, type)}</b>
                  <span className={styles.fileMeta}>
                    {" "}
                    · {t("submit.file.empty")}
                  </span>
                </span>
                <span className={styles.textButton}>
                  {t("submit.file.choose")}
                </span>
                <input
                  type="file"
                  className={styles.fileInput}
                  aria-label={t("submit.file.chooseAria", {
                    document: evidenceName(t, type),
                  })}
                  onChange={onPick(type)}
                />
              </label>
            ),
          )}

          {extras.map((file) => (
            <div key={file.id} className={`${styles.file} ${styles.fileExtra}`}>
              <PdfTile variant="plain" />
              <div className={styles.fileInfo}>
                <b>{t("submit.file.extraTitle")}</b>
                <div className={styles.fileMeta}>{fileMeta(t, file)}</div>
              </div>
              {file.signature ? (
                <ToneTag tone="success">{t("submit.file.signed")}</ToneTag>
              ) : (
                <>
                  <ToneTag tone="primary">{t("submit.file.unsigned")}</ToneTag>
                  <button
                    type="button"
                    className={`${styles.textButton} ${styles.textButtonDanger}`}
                    aria-label={t("submit.file.removeAria", {
                      fileName: file.fileName,
                    })}
                    onClick={() => onRemove(file.id)}
                  >
                    {t("submit.file.remove")}
                  </button>
                </>
              )}
            </div>
          ))}

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
              className={styles.fileInput}
              aria-label={t("submit.dropzoneAria")}
              onChange={onPick("OTHER")}
            />
          </label>

          {submitError ? (
            <p className={styles.error} role="alert">
              {t(
                `submit.error.${submitError instanceof ApiError ? submitError.code : "UNKNOWN"}`,
                {
                  defaultValue: t("submit.error.UNKNOWN"),
                },
              )}
            </p>
          ) : null}

          <div className={styles.actions}>
            <span className={styles.lockNote}>{t("submit.lockNote")}</span>
            <Button onClick={() => navigate("/tasks")}>
              {t("submit.later")}
            </Button>
            <Button
              type="primary"
              disabled={busy || submitted || !data.canSubmit}
              onClick={onSubmit}
            >
              {submitLabel}
            </Button>
          </div>
        </Panel>

        <Panel className={`${styles.panel} ${styles.panelRight}`}>
          <h2>{t("submit.aftermath.title")}</h2>
          <ol className={styles.steps}>
            {AFTERMATH_STEPS.map((step) => (
              <li key={step.key} className={styles.step}>
                <span
                  className={`${styles.actor} ${step.actor === "HUMAN" ? styles.actorHuman : styles.actorSystem}`}
                >
                  {t(`submit.aftermath.actor.${step.actor}`)}
                </span>
                <span>
                  <Trans
                    t={t}
                    i18nKey={`submit.aftermath.${step.key}`}
                    values={{ quorumWord: numberWord(t, data.approverCount) }}
                    components={{ b: <b /> }}
                  />
                </span>
              </li>
            ))}
          </ol>
          <div className={styles.note}>
            <b className={styles.noteTitle}>{t("submit.penalty.title")}</b>
            {penaltyEstimate.penaltyMillion > 0
              ? t("submit.penalty.late", {
                  count: penaltyEstimate.lateDays,
                  rate: formatNumber(penaltyEstimate.rateBpPerDay / 100, 2),
                  value: formatMillionVnd(penaltyEstimate.valueMillion),
                  penalty: formatMillionVnd(penaltyEstimate.penaltyMillion),
                })
              : t("submit.penalty.onTime")}
          </div>
        </Panel>
      </div>
    </>
  );
}

function fileMeta(t: TFunction<"milestones">, file: EvidenceFile): string {
  const size = formatNumber(file.sizeMb, 1);
  return file.pages
    ? t("submit.file.meta", {
        fileName: file.fileName,
        size,
        count: file.pages,
      })
    : t("submit.file.metaNoPages", { fileName: file.fileName, size });
}

interface RequiredFileCardProps {
  file: EvidenceFile;
  active: boolean;
  contractId: string;
}

function RequiredFileCard({ file, active, contractId }: RequiredFileCardProps) {
  const { t, i18n } = useTranslation("milestones");
  const signed = Boolean(file.signature);
  const name = evidenceName(t, file.type);

  if (signed && file.signature) {
    return (
      <div className={`${styles.file} ${styles.fileSigned}`}>
        <PdfTile variant="signed" />
        <div className={styles.fileInfo}>
          <b>{name}</b>
          <div className={styles.fileMeta}>{fileMeta(t, file)}</div>
        </div>
        <div className={styles.fileSide}>
          <ToneTag tone={file.signature.valid ? "success" : "danger"}>
            {file.signature.valid
              ? t("submit.file.signed")
              : t("common.signatureInvalid")}
          </ToneTag>
          <div className={styles.fileSignature}>
            {t("submit.file.signer", {
              name: file.signature.signerName,
              at: formatShortDateTime(file.signature.signedAt),
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${styles.file} ${active ? styles.fileActive : styles.fileExtra}`}
    >
      <div className={styles.fileRow}>
        <PdfTile variant="unsigned" />
        <div className={styles.fileInfo}>
          <b>{name}</b>
          <div className={styles.fileMeta}>{fileMeta(t, file)}</div>
        </div>
        <ToneTag tone="primary">{t("submit.file.unsigned")}</ToneTag>
      </div>
      {file.signingMethod && file.signaturePosition ? (
        <div className={styles.options}>
          <div>
            <div className={styles.optionLabel}>
              {t("submit.signingMethod.label")}
            </div>
            <div className={styles.optionValue}>
              {t(`submit.signingMethod.${file.signingMethod}`)}
            </div>
          </div>
          <div>
            <div className={styles.optionLabel}>
              {t("submit.position.label", {
                document: lowerCase(name, i18n.language),
              })}
            </div>
            <div className={styles.optionValue}>
              {t("submit.position.value", {
                page: file.signaturePosition.page,
                corner: t(
                  `submit.position.corner.${file.signaturePosition.corner}`,
                ),
              })}{" "}
              <Link
                to={`/contracts/${contractId}/sign-positions`}
                className={styles.optionLink}
              >
                {t("submit.position.reassign")}
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
