import { SignaturePlacementPreview } from "@/shared/ui/SignaturePlacementPreview";
import { ContractSideLayout } from "@/shared/ui/ContractSideLayout";
import { Alert, Button } from "antd";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trans, useTranslation } from "react-i18next";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "@/shared/api/client";
import { useCurrentUser } from "@/shared/auth/session";
import { AppPage } from "@/shared/layout/AppPage";
import { formatTime } from "@/shared/lib/format";
import { getSigningOverview, signingKeys } from "../api/signingConfig.api";
import {
  cancelSigningRequest,
  confirmSigningRequest,
  getSigningRequest,
  rejectSigningRequest,
  sendSigningRequest,
} from "../api/signingFlow.api";
import { PageState } from "@/shared/ui/PageState";
import {
  cx,
  formatCountdown,
  formatMonthYear,
  spaceCode,
} from "../lib/helpers";
import { methodKind, SIGN_METHODS } from "../lib/methods";
import type {
  SignMethod,
  SigningOverview,
  SigningRequest,
  SignStepView,
} from "../types";
import shared from "../components/shared.module.css";
import "../signingTokens.css";
import styles from "./SigningMethodPage.module.css";

export default function SigningMethodPage() {
  const { t } = useTranslation("signing");
  const params = useParams();
  const contractId = params.contractId ?? "";
  const stepNo = Number(params.stepNo);
  const user = useCurrentUser();
  const overview = useQuery({
    queryKey: signingKeys.overview(contractId, user.id),
    queryFn: () => getSigningOverview(contractId, user.id),
  });

  return (
    <AppPage
      guide="signing"
      active="tasks"
      breadcrumb={[
        {
          label: t("flow.breadcrumb.current", { code: contractId }),
          to: `/contracts/${contractId}/signing`,
        },
        { label: t("signMethod.breadcrumb.current", { stepNo }) },
      ]}
    >
      <Alert
        type="info"
        showIcon
        title={t(
          overview.data?.simulated === false
            ? "localProof.bridgeNotice"
            : "localProof.notice",
        )}
        style={{ marginBottom: 16 }}
      />
      {overview.data ? (
        <MethodSelection
          contractId={contractId}
          stepNo={stepNo}
          overview={overview.data}
          userId={user.id}
        />
      ) : (
        <PageState kind={overview.isError ? "error" : "loading"} />
      )}
    </AppPage>
  );
}

interface MethodSelectionProps {
  contractId: string;
  stepNo: number;
  overview: SigningOverview;
  userId: string;
}

function MethodSelection({
  contractId,
  stepNo,
  overview,
  userId,
}: MethodSelectionProps) {
  const { t } = useTranslation("signing");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const step = overview.steps.find((candidate) => candidate.stepNo === stepNo);
  const [selected, setSelected] = useState<SignMethod>(overview.lastMethod);
  const [now, setNow] = useState(() => Date.now());
  const completed = useRef(false);
  const requestKey = signingKeys.request(contractId, stepNo);

  const request = useQuery({
    queryKey: requestKey,
    queryFn: () => getSigningRequest(contractId, stepNo),
    refetchInterval: (query) =>
      query.state.data?.status === "PENDING" ? 1000 : false,
  });
  const current = request.data ?? null;
  const pending = current?.status === "PENDING";

  useEffect(() => {
    if (!pending) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [pending]);

  useEffect(() => {
    if (current?.status !== "COMPLETED" || completed.current) return;
    completed.current = true;
    void navigate(`/verify/${contractId}`);
    void queryClient.invalidateQueries({
      queryKey: ["pending-task-count", userId],
    });
    void queryClient.invalidateQueries({ queryKey: ["signing"] });
  }, [current?.status, contractId, navigate, queryClient, userId]);

  const store = (value: SigningRequest) =>
    queryClient.setQueryData(requestKey, value);
  const send = useMutation({
    mutationFn: () => sendSigningRequest(contractId, stepNo, selected),
    onSuccess: (value) => {
      setNow(Date.now());
      store(value);
    },
  });
  const confirm = useMutation({
    mutationFn: () => confirmSigningRequest(contractId, stepNo),
    onSuccess: store,
  });
  const reject = useMutation({
    mutationFn: () => rejectSigningRequest(contractId, stepNo),
    onSuccess: store,
  });
  const cancel = useMutation({
    mutationFn: () => cancelSigningRequest(contractId, stepNo),
    onSuccess: (value) => {
      store(value);
      void navigate(`/contracts/${contractId}/signing`);
    },
  });

  // Only the signer whose turn it is can reach this screen; everyone else goes back to the sequence.
  const sequencePath = `/contracts/${contractId}/signing`;
  if (!step) return <Navigate to={sequencePath} replace />;
  const turnIsOpen = step.status === "CURRENT" && overview.myStepNo === stepNo;
  if (!turnIsOpen && !completed.current && current?.status !== "COMPLETED") {
    return <Navigate to={sequencePath} replace />;
  }
  if (request.isPending) return <PageState kind="loading" />;

  const lastError = [send, confirm, reject, cancel].find(
    (mutation) => mutation.error,
  )?.error;
  const errorCode = lastError instanceof ApiError ? lastError.code : "UNKNOWN";
  const selectedKind = methodKind(selected);
  const phase = current ? current.status : "IDLE";

  return (
    <ContractSideLayout
      contractId={contractId}
      focus={t("flow.sequence.stepTitle", {
        party: t(`party.${step.party}`),
        person: step.signerName,
      })}
    >
      <div className={styles.titleRow}>
        <h2>{t("signMethod.title", { code: contractId })}</h2>
        <span className={cx(shared.pill, styles.stepChip)}>
          {t("signMethod.stepChip", {
            stepNo,
            total: overview.steps.length,
            party: t(`party.${step.party}`),
          })}
        </span>
      </div>

      <div className={styles.layout}>
        <section className={cx(shared.card, styles.methods)}>
          <h2>{t("signMethod.methods.title")}</h2>
          <div
            className={styles.methodList}
            role="radiogroup"
            aria-label={t("signMethod.methods.label")}
          >
            {SIGN_METHODS.map((method) => (
              <MethodCard
                key={method}
                method={method}
                overview={overview}
                selected={selected === method}
                blocked={
                  method === "IMAGE" && overview.digitalSignatureRequired
                }
                onSelect={() => setSelected(method)}
              />
            ))}
          </div>
          <div className={styles.fileBox}>
            <b>{t("signMethod.file.title")}</b>
            <br />
            {t("signMethod.file.meta", {
              fileName: overview.fileName,
              count: overview.pageCount,
            })}
          </div>
          {send.error || confirm.error || reject.error || cancel.error ? (
            <p role="alert" className={styles.error}>
              {t(`errors.${errorCode}`, { defaultValue: t("errors.UNKNOWN") })}
            </p>
          ) : null}
          <SignaturePlacementPreview config={overview} stepNo={step.stepNo} />
          <div className={styles.footer}>
            <Link
              to={`/contracts/${contractId}/signing`}
              className={shared.btnSecondary}
            >
              {t("signMethod.actions.back")}
            </Link>
            <Button
              type="primary"
              size="small"
              disabled={send.isPending || selectedKind === "IMAGE"}
              onClick={() => send.mutate()}
            >
              {t(
                selectedKind === "USB"
                  ? "signMethod.actions.sendUsb"
                  : "signMethod.actions.sendRemote",
              )}
            </Button>
          </div>
        </section>

        <section className={cx(shared.card, styles.progress)}>
          <div className={styles.progressMain}>
            <div className={styles.progressHeader}>
              <h2>{t("signMethod.progress.title")}</h2>
              <span
                className={cx(
                  shared.pill,
                  styles.phaseBadge,
                  styles[`phase${phase}`],
                )}
              >
                {t(`signMethod.progress.badge.${phase}`)}
              </span>
            </div>
            <ProgressList
              request={current}
              step={step}
              overview={overview}
              now={now}
            />
            {pending ? (
              <div className={cx(shared.notice, styles.lock)}>
                <b className={shared.noticeTitle}>
                  {t("signMethod.lock.title")}
                </b>
                <br />
                <Trans
                  t={t}
                  i18nKey="signMethod.lock.body"
                  components={{ b: <b className={styles.exceptions} /> }}
                />
              </div>
            ) : null}
            {pending ? (
              <div className={styles.progressFooter}>
                <Button
                  danger
                  size="small"
                  disabled={cancel.isPending}
                  onClick={() => cancel.mutate()}
                >
                  {t("signMethod.actions.cancel")}
                </Button>
              </div>
            ) : null}
          </div>
          {!overview.simulated ? (
            <div style={{ padding: 24 }}>
              <Alert
                type="info"
                showIcon
                title={t("localProof.bridgeNotice")}
                style={{ marginBottom: 16 }}
              />
              <Button
                type="primary"
                loading={confirm.isPending}
                disabled={!pending}
                onClick={() => confirm.mutate()}
              >
                {t("localProof.bridgeConfirm")}
              </Button>
            </div>
          ) : current && methodKind(current.method) === "USB" ? null : (
            <PhoneFrame
              request={current}
              step={step}
              overview={overview}
              fallbackMethod={
                selectedKind === "REMOTE" ? selected : "VNPT_SMARTCA"
              }
              busy={confirm.isPending || reject.isPending}
              onConfirm={() => confirm.mutate()}
              onReject={() => reject.mutate()}
            />
          )}
        </section>
      </div>
    </ContractSideLayout>
  );
}

function MethodCard({
  method,
  overview,
  selected,
  blocked,
  onSelect,
}: {
  method: SignMethod;
  overview: SigningOverview;
  selected: boolean;
  blocked: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation("signing");
  const certificate = overview.certificates[method];
  const description = blocked
    ? t("method.IMAGE.blocked")
    : certificate
      ? t(`method.${method}.description`, {
          context: "certified",
          holder: certificate.holder,
          expiry: formatMonthYear(
            certificate.expiryMonth,
            certificate.expiryYear,
          ),
        })
      : t(`method.${method}.description`);

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={blocked}
      className={cx(
        styles.method,
        selected && styles.methodOn,
        blocked && styles.methodBlocked,
      )}
      onClick={onSelect}
    >
      <span className={styles.radio} aria-hidden="true" />
      <span className={styles.methodBody}>
        <span className={styles.methodName}>
          <b>{t(`method.${method}.name`)}</b>
          {overview.lastMethod === method && !blocked ? (
            <span className={cx(shared.pill, styles.lastUsed)}>
              {t("signMethod.methods.lastUsed")}
            </span>
          ) : null}
        </span>
        <span className={styles.methodDescription}>{description}</span>
      </span>
    </button>
  );
}

type ItemState = "done" | "current" | "wait" | "todo" | "failed";

interface ProgressItem {
  state: ItemState;
  marker: string;
  title: string;
  description: ReactNode;
}

function ProgressList({
  request,
  step,
  overview,
  now,
}: {
  request: SigningRequest | null;
  step: SignStepView;
  overview: SigningOverview;
  now: number;
}) {
  const { t } = useTranslation("signing");
  const nextStep = overview.steps.find(
    (candidate) => candidate.stepNo === step.stepNo + 1,
  );
  const kind = request
    ? methodKind(request.method) === "USB"
      ? "USB"
      : "REMOTE"
    : "REMOTE";

  const done: ProgressItem = {
    state: "todo",
    marker: "3",
    title: t("signMethod.progress.done.title"),
    description: nextStep
      ? t("signMethod.progress.done.description", {
          nextParty: t(`party.${nextStep.party}`),
        })
      : t("signMethod.progress.done.descriptionFinal"),
  };

  let items: ProgressItem[];
  if (request?.status === "PENDING" || request?.status === "COMPLETED") {
    const sent: ProgressItem = {
      state: "done",
      marker: "✓",
      title: t("signMethod.progress.sent.title"),
      description: t(`signMethod.progress.sent.${kind}`),
    };
    if (request.status === "COMPLETED") {
      items = [
        sent,
        {
          state: "done",
          marker: "✓",
          title: t("signMethod.progress.confirmed.title"),
          description: null,
        },
        { ...done, state: "done", marker: "✓" },
      ];
    } else {
      const remaining = new Date(request.expiresAt).getTime() - now;
      items = [
        sent,
        {
          state: "wait",
          marker: "2",
          title: t(`signMethod.progress.wait.${kind}.title`),
          description: (
            <Trans
              t={t}
              i18nKey={`signMethod.progress.wait.${kind}.description`}
              values={{
                app: t(`method.${request.method}.app`, { defaultValue: "" }),
                time: formatTime(request.sentAt),
                remaining: formatCountdown(remaining),
                code: spaceCode(request.code),
              }}
              components={{ code: <b className={styles.mono} /> }}
            />
          ),
        },
        done,
      ];
    }
  } else {
    const ended = request
      ? (request.status as "CANCELLED" | "REJECTED" | "EXPIRED")
      : null;
    items = [
      ended
        ? {
            state: "failed",
            marker: "✕",
            title: t(`signMethod.progress.ended.${ended}.title`),
            description: t(`signMethod.progress.ended.${ended}.description`),
          }
        : {
            state: "current",
            marker: "1",
            title: t("signMethod.progress.idle.title"),
            description: t("signMethod.progress.idle.description"),
          },
      {
        state: "todo",
        marker: "2",
        title: t("signMethod.progress.wait.REMOTE.title"),
        description: null,
      },
      done,
    ];
  }

  return (
    <ol className={styles.progressList}>
      {items.map((item) => (
        <li
          key={item.marker + item.title}
          className={cx(
            styles.progressItem,
            item.state === "todo" && styles.progressTodo,
          )}
        >
          <span
            className={cx(
              styles.progressMarker,
              styles[`marker_${item.state}`],
            )}
            aria-hidden="true"
          >
            {item.marker}
          </span>
          <div>
            <b>{item.title}</b>
            {item.description ? (
              <div className={styles.progressText}>{item.description}</div>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function PhoneFrame({
  request,
  step,
  overview,
  fallbackMethod,
  busy,
  onConfirm,
  onReject,
}: {
  request: SigningRequest | null;
  step: SignStepView;
  overview: SigningOverview;
  fallbackMethod: SignMethod;
  busy: boolean;
  onConfirm: () => void;
  onReject: () => void;
}) {
  const { t } = useTranslation("signing");
  const method = request ? request.method : fallbackMethod;
  const active = request?.status === "PENDING";

  return (
    <div className={styles.phoneColumn}>
      <div className={styles.phoneCaption}>
        <Trans
          t={t}
          i18nKey="signMethod.phone.caption"
          components={{ br: <br /> }}
        />
      </div>
      <div
        className={cx(
          styles.phone,
          method === "VIETTEL_MYSIGN"
            ? styles.phoneMySign
            : styles.phoneSmartCa,
        )}
      >
        <div className={styles.phoneHeader}>
          <div className={styles.phoneProvider}>
            {t(`method.${method}.name`)}
          </div>
          <b>{t("signMethod.phone.title")}</b>
        </div>
        {active && request ? (
          <div className={styles.phoneBody}>
            <div className={styles.phoneCard}>
              <div className={styles.phoneLabel}>
                {t("signMethod.phone.document")}
              </div>
              <b>
                {t("signMethod.phone.documentName", {
                  code: overview.contractCode,
                })}
              </b>
              <div className={styles.phoneSub}>{overview.title}</div>
            </div>
            <div className={styles.phoneCard}>
              <div className={styles.phoneLabel}>
                {t("signMethod.phone.signer")}
              </div>
              <b>{step.signerName}</b>
              <div className={styles.phoneSub}>{step.organizationName}</div>
            </div>
            <div className={cx(styles.phoneCard, styles.phoneCodeCard)}>
              <div className={styles.phoneLabel}>
                {t("signMethod.phone.codeLabel")}
              </div>
              <b className={styles.phoneCode}>{request.code}</b>
            </div>
            <div className={styles.phoneActions}>
              <button
                type="button"
                className={styles.phoneReject}
                disabled={busy}
                onClick={onReject}
              >
                {t("signMethod.phone.reject")}
              </button>
              <button
                type="button"
                className={styles.phoneConfirm}
                disabled={busy}
                onClick={onConfirm}
              >
                {t("signMethod.phone.confirm")}
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.phoneBody}>
            <p className={styles.phoneIdle}>{t("signMethod.phone.idle")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
