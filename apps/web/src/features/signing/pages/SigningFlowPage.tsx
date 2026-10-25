import { ContractSideLayout } from "@/shared/ui/ContractSideLayout";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "antd";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AppPage } from "@/shared/layout/AppPage";
import { useAccess } from "@codecash/ui";
import { formatDateTime, formatDecimalString } from "@/shared/lib/format";
import { getSigningOverview, signingKeys } from "../api/signingConfig.api";
import { cancelSigning } from "../api/signingFlow.api";
import { PageState } from "@/shared/ui/PageState";
import { WizardStepper } from "../components/WizardStepper";
import { useCurrentUser } from "@/shared/auth/session";
import { useDemoMode } from "@/shared/auth/useDemoMode";
import { cx } from "../lib/helpers";
import { toneClass } from "../lib/tone";
import type { SignStepView, SigningOverview } from "../types";
import shared from "../components/shared.module.css";
import "../signingTokens.css";
import styles from "./SigningFlowPage.module.css";

type StepState = "MINE" | "CURRENT" | "WAITING" | "SIGNED";

function stepState(step: SignStepView, overview: SigningOverview): StepState {
  if (step.status === "SIGNED") return "SIGNED";
  if (step.status === "WAITING") return "WAITING";
  return overview.myStepNo === step.stepNo ? "MINE" : "CURRENT";
}

export default function SigningFlowPage() {
  const { t } = useTranslation("signing");
  const contractId = useParams().contractId ?? "";
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
        { label: t("flow.breadcrumb.parent"), to: "/contracts" },
        { label: t("flow.breadcrumb.current", { code: contractId }) },
      ]}
    >
      {overview.data ? (
        <Flow contractId={contractId} overview={overview.data} />
      ) : (
        <PageState kind={overview.isError ? "error" : "loading"} />
      )}
    </AppPage>
  );
}

function Flow({
  contractId,
  overview,
}: {
  contractId: string;
  overview: SigningOverview;
}) {
  const { t } = useTranslation("signing");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useCurrentUser();
  const { hasPermission } = useAccess(user);
  const { steps } = overview;
  const allSigned = steps.every((step) => step.status === "SIGNED");
  const myTurn =
    overview.currentStepNo !== null &&
    overview.currentStepNo === overview.myStepNo;
  const canCancel = !overview.anySigned && hasPermission("signing:cancel");

  const cancel = useMutation({
    mutationFn: () => cancelSigning(contractId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["signing"] });
      void navigate(`/contracts/new?draft=${encodeURIComponent(contractId)}`);
    },
  });

  const currentStep = steps.find(
    (step) => step.stepNo === overview.currentStepNo,
  );

  return (
    <ContractSideLayout
      contractId={contractId}
      focus={
        currentStep && !allSigned
          ? t("flow.sequence.stepTitle", {
              party: t(`party.${currentStep.party}`),
              person: currentStep.signerName,
            })
          : undefined
      }
    >
      <WizardStepper current={allSigned ? "EFFECTIVE" : "SIGN"} />

      <div className={styles.layout}>
        <section className={cx(shared.card, styles.documentCard)}>
          <div className={styles.titleRow}>
            <h2>{overview.title}</h2>
            <span
              className={cx(
                shared.pill,
                styles.statusPill,
                allSigned && styles.statusPillDone,
              )}
            >
              {t(`flow.status.${allSigned ? "SIGNED" : "WAITING"}`)}
            </span>
          </div>
          <div className={styles.meta}>
            {t("lite.flowMeta", {
              supplier: overview.supplierName,
              value: formatDecimalString(overview.valueMillion),
            })}
          </div>
        </section>

        <section className={cx(shared.card, styles.sequenceCard)}>
          <h2>{t("flow.sequence.title")}</h2>
          <ol className={styles.steps}>
            {steps.map((step) => (
              <StepItem key={step.stepNo} step={step} overview={overview} />
            ))}
          </ol>

          <div className={styles.footer}>
            {canCancel ? (
              <Button
                danger
                className={styles.cancel}
                disabled={cancel.isPending}
                onClick={() => cancel.mutate()}
              >
                {t("flow.actions.cancelRequest")}
              </Button>
            ) : null}
            <Link to="/contracts" className={shared.btnSecondary}>
              {t("flow.actions.later")}
            </Link>
            {allSigned ? (
              <Link to={`/verify/${contractId}`} className={shared.btnPrimary}>
                {t("flow.actions.viewVerification")}
              </Link>
            ) : myTurn ? (
              <Link
                to={`/contracts/${contractId}/signing/${overview.currentStepNo}`}
                className={shared.btnPrimary}
              >
                {t("flow.actions.signNow")}
              </Link>
            ) : null}
          </div>
        </section>
      </div>
    </ContractSideLayout>
  );
}

function StepItem({
  step,
  overview,
}: {
  step: SignStepView;
  overview: SigningOverview;
}) {
  const { t } = useTranslation("signing");
  const { t: tc } = useTranslation("common");
  const demoMode = useDemoMode();
  const state = stepState(step, overview);
  const active = state === "MINE" || state === "CURRENT";
  const role = step.signerRole
    ? tc(`roles.${step.signerRole}.name`)
    : t(`party.${step.party}`);

  return (
    <li
      className={cx(
        toneClass(step.stepNo),
        styles.step,
        active ? styles.stepActive : styles.stepIdle,
      )}
    >
      <span className={cx(styles.stepNumber, styles[`stepNumber${state}`])}>
        {step.stepNo}
      </span>
      <div className={styles.stepBody}>
        <div className={styles.stepHead}>
          <b>
            {t("flow.sequence.stepTitle", {
              party: t(`party.${step.party}`),
              person: step.signerName,
            })}
          </b>
          <span
            className={cx(
              shared.pill,
              styles.stepBadge,
              styles[`stepBadge${state}`],
            )}
          >
            {t(`flow.sequence.badge.${state}`, { stepNo: step.stepNo - 1 })}
          </span>
        </div>
        <div className={styles.stepNote}>
          {t("lite.stepSub", {
            title: step.signerTitle || role,
            organization: step.organizationName,
          })}
        </div>
        {state === "SIGNED" ? (
          <div className={styles.stepNote}>
            {t("lite.stepSigned", {
              dateTime: step.signedAt ? formatDateTime(step.signedAt) : "",
              method: step.method ? t(`method.${step.method}.name`) : "",
            })}
          </div>
        ) : null}
        {active && demoMode && step.signerEmail ? (
          <div className={styles.stepAccount}>
            {t("flow.sequence.account", { email: step.signerEmail })}
          </div>
        ) : null}
      </div>
    </li>
  );
}
