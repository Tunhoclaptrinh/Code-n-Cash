import { useState, type DragEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Alert, Button, Select, Tag, Tooltip, Typography } from "antd";
import { downloadBlob } from "@codecash/ui";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { getContractList } from "@/shared/api/domain";
import { useCurrentUser } from "@/shared/auth/session";
import { ApiError } from "@/shared/api/client";
import { AppPage } from "@/shared/layout/AppPage";
import { formatDateTime } from "@/shared/lib/format";
import { signingKeys } from "../api/signingConfig.api";
import { checkFile, getVerification } from "../api/verification.api";
import { contractHeading } from "@/shared/lib/domain";
import { ContractSideLayout } from "@/shared/ui/ContractSideLayout";
import { PageState } from "@/shared/ui/PageState";
import { SideCard, SideSection } from "@/shared/ui/SidePanel";
import { TechnicalDetails } from "@/shared/ui/TechnicalInfo";
import { cx, formatMonthYear, isCertificateExpired } from "../lib/helpers";
import { toneClass } from "../lib/tone";
import type {
  FileCheckResult,
  VerificationResult,
  VerifiedSignature,
} from "../types";
import shared from "../components/shared.module.css";
import "../signingTokens.css";
import styles from "./SignatureVerificationPage.module.css";
import { trustApi } from "@/shared/api/trust";

export default function SignatureVerificationPage() {
  const { t } = useTranslation("signing");
  const user = useCurrentUser();
  const navigate = useNavigate();
  const routeId = useParams().contractId;
  const contractId = routeId ?? "";
  // Contracts with a signing record, so the page can switch between them.
  const list = useQuery({
    queryKey: ["contract-summaries", user.id],
    queryFn: getContractList,
  });
  const signed = (list.data?.contracts ?? []).filter((c) => c.signing);
  const verification = useQuery({
    queryKey: signingKeys.verification(contractId),
    queryFn: () => getVerification(contractId),
    enabled: !!routeId,
  });
  if (!routeId && list.data) {
    const first =
      signed.find((c) => c.signing && c.signing.signed > 0) ?? signed[0];
    if (first) return <Navigate to={`/verify/${first.id}`} replace />;
  }

  return (
    <AppPage
      guide="signing"
      active="verify"
      breadcrumb={[
        { label: t("verify.breadcrumb.parent"), to: "/contracts" },
        { label: t("verify.breadcrumb.current", { code: contractId }) },
      ]}
    >
      <div className={styles.picker}>
        <Typography.Text strong>{t("verify.pick")}</Typography.Text>
        <Select
          showSearch
          optionFilterProp="label"
          className={styles.contractSelect}
          value={routeId}
          onChange={(id: string) => navigate(`/verify/${id}`)}
          options={signed.map((c) => ({
            value: c.id,
            label: `${contractHeading(c)} (${c.signing?.signed}/${c.signing?.total})`,
          }))}
          data-testid="verify-contract"
        />
      </div>
      {verification.data ? (
        <ContractSideLayout contractId={contractId}>
          <Verification contractId={contractId} result={verification.data} />
        </ContractSideLayout>
      ) : routeId ? (
        <PageState kind={verification.isError ? "error" : "loading"} />
      ) : (
        <PageState
          kind={list.isError ? "error" : list.data ? "notFound" : "loading"}
        />
      )}
    </AppPage>
  );
}

function Verification({
  contractId,
  result,
}: {
  contractId: string;
  result: VerificationResult;
}) {
  const { t } = useTranslation("signing");
  const { t: td } = useTranslation("domain");
  const navigate = useNavigate();
  const download = useMutation({
    mutationFn: () => trustApi.signatureBundle(contractId),
    onSuccess: (data) =>
      downloadBlob(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
        `signatures-${contractId}.json`,
      ),
  });
  const validCount = result.signatures.filter(
    (signature) => signature.status === "VALID",
  ).length;
  const effective = result.effectiveAt !== null;

  return (
    <SideCard>
      <SideSection>
        <div className={cx(styles.banner, !effective && styles.bannerOpen)}>
          <span className={styles.bannerIcon} aria-hidden="true">
            {effective ? "✓" : "!"}
          </span>
          <div>
            {effective && result.effectiveAt ? (
              <>
                <b className={styles.bannerTitle}>
                  {t("verify.banner.EFFECTIVE.title", {
                    dateTime: formatDateTime(result.effectiveAt),
                  })}
                </b>
                <div className={styles.bannerBody}>
                  {t("verify.banner.EFFECTIVE.body", {
                    count: result.milestonesOpened,
                  })}
                </div>
              </>
            ) : (
              <>
                <b className={styles.bannerTitle}>
                  {t("verify.banner.INCOMPLETE.title")}
                </b>
                <div className={styles.bannerBody}>
                  {t("verify.banner.INCOMPLETE.body", {
                    signed: validCount,
                    total: result.stepCount,
                  })}
                </div>
              </>
            )}
          </div>
        </div>
        {download.isError ? (
          <Alert type="error" title={td("errors.UNKNOWN")} />
        ) : null}
        <div className={styles.actions}>
          <Tooltip title={t("localProof.notice")}>
            <Tag variant="filled" tabIndex={0} className={styles.proofTag}>
              {t("lite.simulatedTag")}
            </Tag>
          </Tooltip>
          <Button
            onClick={() => download.mutate()}
            loading={download.isPending}
          >
            {t("localProof.export")}
          </Button>
          {effective ? (
            <Button
              color="green"
              variant="solid"
              onClick={() => navigate(`/contracts/${contractId}`)}
            >
              {t("verify.banner.action")}
            </Button>
          ) : null}
        </div>
      </SideSection>

      <SideSection title={t("verify.signatures.title")}>
        <div className={styles.signatures} data-testid="verification-layout">
          {result.signatures.map((signature) => (
            <SignatureCard key={signature.stepNo} signature={signature} />
          ))}
        </div>
      </SideSection>

      <FileCheck contractId={contractId} />
    </SideCard>
  );
}

function SignatureCard({ signature }: { signature: VerifiedSignature }) {
  const { t } = useTranslation("signing");
  const expiry = formatMonthYear(
    signature.certExpiryMonth,
    signature.certExpiryYear,
  );
  const expired = isCertificateExpired(
    signature.certExpiryMonth,
    signature.certExpiryYear,
  );
  const valid = signature.status === "VALID";
  // Only what explains a problem is shown; a fully valid signature needs no extra line.
  const problems = [
    expired ? t("verify.signatures.certificateExpired", { expiry }) : null,
    signature.status === "UNVERIFIED"
      ? t("localProof.unverifiedContent")
      : signature.contentIntact
        ? null
        : t("verify.signatures.contentChanged"),
  ].filter(Boolean);
  const status = (
    <span
      className={cx(
        shared.pill,
        styles.cardStatus,
        valid ? styles.statusValid : styles.statusInvalid,
      )}
      tabIndex={signature.certificateTrusted === false ? 0 : undefined}
    >
      {t(`verify.signatures.status.${signature.status}`)}
    </span>
  );

  return (
    <div className={cx(toneClass(signature.stepNo), styles.card)}>
      <div className={styles.cardHead}>
        <span className={styles.cardNumber}>{signature.stepNo}</span>
        <b>
          {t("verify.signatures.signer", {
            person: signature.signerName,
            party: t(`party.${signature.party}`),
          })}
        </b>
        {signature.certificateTrusted === false ? (
          <Tooltip title={t("localProof.untrusted")}>{status}</Tooltip>
        ) : (
          status
        )}
      </div>
      <div className={styles.cardMeta}>
        {t("lite.verifyMeta", {
          dateTime: formatDateTime(signature.signedAt),
          method: t(`method.${signature.method}.name`),
        })}
      </div>
      {problems.length ? (
        <div className={styles.problem}>{problems.join(" · ")}</div>
      ) : null}
      <TechnicalDetails
        items={[
          {
            key: "key",
            label: t("localProof.key"),
            value: signature.keyFingerprint ? (
              <Typography.Text copyable style={{ overflowWrap: "anywhere" }}>
                {signature.keyFingerprint}
              </Typography.Text>
            ) : null,
          },
          {
            key: "basis",
            label: t("localProof.basisLabel"),
            value: signature.keyFingerprint
              ? t(
                  `localProof.basis.${signature.proofBasis ?? "TERMS_SNAPSHOT"}`,
                )
              : null,
          },
        ]}
      />
    </div>
  );
}

function FileCheck({ contractId }: { contractId: string }) {
  const { t } = useTranslation("signing");
  const [dragging, setDragging] = useState(false);
  const check = useMutation<FileCheckResult, ApiError, File>({
    mutationFn: (file) => checkFile(contractId, file),
  });

  const run = (file: File | undefined) => {
    if (file) check.mutate(file);
  };
  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    run(event.dataTransfer.files[0]);
  };

  const outcome = check.isError ? "NOT_PDF" : check.data?.outcome;

  return (
    <SideSection title={t("verify.check.title")}>
      <div className={styles.checkDescription}>{t("lite.checkHint")}</div>
      <label
        className={cx(styles.dropzone, dragging && styles.dropzoneOn)}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input
          type="file"
          accept=".pdf,application/pdf"
          className={styles.fileInput}
          aria-label={t("verify.check.aria")}
          onChange={(event) => {
            run(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        {t("verify.check.dropzone")}
      </label>
      {check.isPending || outcome ? (
        <div role="status">
          {check.isPending ? (
            <span className={styles.checkResult}>
              {t("verify.check.checking")}
            </span>
          ) : outcome ? (
            <span
              className={cx(
                styles.checkResult,
                outcome === "VALID" ? styles.good : styles.bad,
              )}
            >
              {outcome === "VALID"
                ? t("verify.check.result.VALID", {
                    count: check.data?.signatureCount ?? 0,
                  })
                : t(`verify.check.result.${outcome}`)}
            </span>
          ) : null}
        </div>
      ) : null}
    </SideSection>
  );
}
