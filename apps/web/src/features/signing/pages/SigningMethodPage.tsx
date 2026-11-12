import { SignaturePlacementPreview } from "@/shared/ui/SignaturePlacementPreview";
import { ContractSideLayout } from "@/shared/ui/ContractSideLayout";
import { SigningSubject } from "../components/SigningSubject";
import { Alert, Button, Tag, Tooltip } from "antd";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "@/shared/api/client";
import { useCurrentUser } from "@/shared/auth/session";
import { AppPage } from "@/shared/layout/AppPage";
import { getSigningOverview, signingKeys } from "../api/signingConfig.api";
import {
  cancelSigningRequest,
  confirmSigningRequest,
  getSigningRequest,
  sendSigningRequest,
} from "../api/signingFlow.api";
import { getDeviceSession } from "../device/deviceApi";
import { RemoteWaiting } from "../components/RemoteWaiting";
import { PageState } from "@/shared/ui/PageState";
import { cx } from "../lib/helpers";
import { SIGN_METHODS } from "../lib/methods";
import type { SignMethod, SigningOverview } from "../types";
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
  // A hidden image option must not be the preselected one.
  const [selected, setSelected] = useState<SignMethod>(
    overview.digitalSignatureRequired && overview.lastMethod === "IMAGE"
      ? "VNPT_SMARTCA"
      : overview.lastMethod,
  );
  const completed = useRef(false);
  const requestKey = signingKeys.request(contractId, stepNo);

  // Through the remote signing service the person confirms on a device: the request is only sent
  // here, and the screen waits for the device (webhook, or the next poll) to bring the result.
  const service = useQuery({
    queryKey: ["signing-device", userId],
    queryFn: getDeviceSession,
    retry: false,
    staleTime: 10 * 60_000,
  });
  const remoteMode = service.isSuccess && selected !== "IMAGE";
  const request = useQuery({
    queryKey: requestKey,
    queryFn: () => getSigningRequest(contractId, stepNo),
    refetchInterval: (query) =>
      query.state.data?.remote && query.state.data.status === "PENDING"
        ? 3000
        : false,
  });
  const current = request.data ?? null;
  const waiting = !!current?.remote && current.status === "PENDING";

  useEffect(() => {
    if (current?.status !== "COMPLETED" || completed.current) return;
    completed.current = true;
    void navigate(`/verify/${contractId}`);
    void queryClient.invalidateQueries({
      queryKey: ["pending-task-count", userId],
    });
    void queryClient.invalidateQueries({ queryKey: ["signing"] });
  }, [current?.status, contractId, navigate, queryClient, userId]);

  // One click signs: the request is created and confirmed by the signer at once; the API still
  // binds the signature to the document digest and the signer's turn exactly as before.
  const sign = useMutation({
    mutationFn: async () => {
      const sent = await sendSigningRequest(contractId, stepNo, selected);
      if (sent.remote) return sent;
      return confirmSigningRequest(contractId, stepNo);
    },
    onSuccess: (value) => queryClient.setQueryData(requestKey, value),
  });
  const cancel = useMutation({
    mutationFn: () => cancelSigningRequest(contractId, stepNo),
    onSuccess: (value) => queryClient.setQueryData(requestKey, value),
  });

  // Only the signer whose turn it is can reach this screen; everyone else goes back to the sequence.
  const sequencePath = `/contracts/${contractId}/signing`;
  if (!step) return <Navigate to={sequencePath} replace />;
  const turnIsOpen = step.status === "CURRENT" && overview.myStepNo === stepNo;
  if (!turnIsOpen && !completed.current && current?.status !== "COMPLETED") {
    return <Navigate to={sequencePath} replace />;
  }
  if (request.isPending) return <PageState kind="loading" />;

  const errorCode =
    sign.error instanceof ApiError ? sign.error.code : "UNKNOWN";

  return (
    <ContractSideLayout contractId={contractId}>
      <div className={styles.titleRow}>
        <h2>{t("signMethod.title", { code: contractId })}</h2>
        <span className={cx(shared.pill, styles.stepChip)}>
          {t("signMethod.stepChip", {
            stepNo,
            total: overview.steps.length,
            party: t(`party.${step.party}`),
          })}
        </span>
        <Tooltip
          title={t(
            overview.simulated
              ? "localProof.notice"
              : "localProof.bridgeNotice",
          )}
        >
          <Tag
            variant="filled"
            className={styles.modeTag}
            tabIndex={0}
            data-testid="signing-mode-tag"
          >
            {t(overview.simulated ? "lite.simulatedTag" : "lite.serviceTag")}
          </Tag>
        </Tooltip>
      </div>

      <div className={styles.layout}>
        {waiting && current ? (
          <RemoteWaiting
            request={current}
            cancelling={cancel.isPending}
            resending={sign.isPending}
            onCancel={() => cancel.mutate()}
            onResend={() => {
              setSelected(current.method);
              sign.mutate();
            }}
          />
        ) : (
          <section className={cx(shared.card, styles.methods)}>
            {current?.remote &&
            ["REJECTED", "EXPIRED", "CANCELLED"].includes(current.status) ? (
              <Alert
                type={
                  current.status === "CANCELLED" && !current.failure
                    ? "info"
                    : "warning"
                }
                showIcon
                title={t(
                  current.failure
                    ? "remote.ended.FAILED"
                    : `remote.ended.${current.status}`,
                )}
                data-testid="remote-ended"
              />
            ) : null}
            <h2>{t("signMethod.methods.title")}</h2>
            <div
              className={styles.methodList}
              role="radiogroup"
              aria-label={t("signMethod.methods.label")}
            >
              {SIGN_METHODS.filter(
                (method) =>
                  !(method === "IMAGE" && overview.digitalSignatureRequired),
              ).map((method) => (
                <MethodCard
                  key={method}
                  method={method}
                  lastUsed={overview.lastMethod === method}
                  selected={selected === method}
                  onSelect={() => setSelected(method)}
                />
              ))}
            </div>
            {sign.error ? (
              <p role="alert" className={styles.error}>
                {t(`errors.${errorCode}`, {
                  defaultValue: t("errors.UNKNOWN"),
                })}
              </p>
            ) : null}
            <SignaturePlacementPreview config={overview} stepNo={step.stepNo} />
            <SigningSubject contractId={contractId} />
            <div className={styles.footer}>
              <Link
                to={`/contracts/${contractId}/signing`}
                className={shared.btnSecondary}
              >
                {t("signMethod.actions.back")}
              </Link>
              <Button
                color="green"
                variant="solid"
                loading={sign.isPending}
                disabled={
                  selected === "IMAGE" && overview.digitalSignatureRequired
                }
                onClick={() => sign.mutate()}
                data-testid="sign-now"
              >
                {t(remoteMode ? "remote.send" : "lite.signNow")}
              </Button>
            </div>
          </section>
        )}
      </div>
    </ContractSideLayout>
  );
}

function MethodCard({
  method,
  lastUsed,
  selected,
  onSelect,
}: {
  method: SignMethod;
  lastUsed: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation("signing");

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className={cx(styles.method, selected && styles.methodOn)}
      onClick={onSelect}
    >
      <span className={styles.radio} aria-hidden="true" />
      <span className={styles.methodBody}>
        <span className={styles.methodName}>
          <b>{t(`method.${method}.name`)}</b>
          {lastUsed ? (
            <span className={cx(shared.pill, styles.lastUsed)}>
              {t("signMethod.methods.lastUsed")}
            </span>
          ) : null}
        </span>
        <span className={styles.methodDescription}>
          {t(`lite.methodHint.${method}`)}
        </span>
      </span>
    </button>
  );
}
