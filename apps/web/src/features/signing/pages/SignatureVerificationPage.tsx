import { UiInput } from "@/shared/ui/controls";
import { useState, type DragEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { ApiError } from "@/shared/api/client";
import { AppShell } from "@/shared/layout/AppShell";
import { formatDateTime } from "@/shared/lib/format";
import { signingKeys } from "../api/signingConfig.api";
import { checkFile, getVerification } from "../api/verification.api";
import { PageStatus } from "../components/PageStatus";
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

const DEFAULT_CONTRACT = "CT0101";
const INVALID_REASONS = [
  "CONTENT_EDITED",
  "WRONG_SIGNER",
  "CERT_REVOKED",
] as const;

export default function SignatureVerificationPage() {
  const { t } = useTranslation("signing");
  const contractId = useParams().contractId ?? DEFAULT_CONTRACT;
  const verification = useQuery({
    queryKey: signingKeys.verification(contractId),
    queryFn: () => getVerification(contractId),
  });

  return (
    <AppShell
      active="verify"
      breadcrumb={[
        { label: t("verify.breadcrumb.parent"), to: "/contracts" },
        { label: t("verify.breadcrumb.current", { code: contractId }) },
      ]}
    >
      {verification.data ? (
        <Verification contractId={contractId} result={verification.data} />
      ) : (
        <PageStatus isError={verification.isError} />
      )}
    </AppShell>
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
  const validCount = result.signatures.filter(
    (signature) => signature.status === "VALID",
  ).length;
  const effective = result.effectiveAt !== null;

  return (
    <>
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
        {effective ? (
          <Link to={`/contracts/${contractId}`} className={styles.bannerAction}>
            {t("verify.banner.action")}
          </Link>
        ) : null}
      </div>

      <div className={styles.layout}>
        <section className={cx(shared.card, styles.signatures)}>
          <h2>{t("verify.signatures.title")}</h2>
          {result.signatures.map((signature) => (
            <SignatureCard key={signature.stepNo} signature={signature} />
          ))}
        </section>

        <div className={styles.side}>
          <FileCheck contractId={contractId} />
          <section className={cx(shared.card, styles.panel)}>
            <h2>{t("verify.invalid.title")}</h2>
            {INVALID_REASONS.map((reason) => (
              <div key={reason} className={styles.reason}>
                <span className={styles.reasonMark} aria-hidden="true">
                  ✕
                </span>
                <span>{t(`verify.invalid.reasons.${reason}`)}</span>
              </div>
            ))}
            <span className={styles.exceptions}>
              {t("verify.invalid.exceptions")}
            </span>
          </section>
        </div>
      </div>
    </>
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
        <span
          className={cx(
            shared.pill,
            styles.cardStatus,
            valid ? styles.statusValid : styles.statusInvalid,
          )}
        >
          {t(`verify.signatures.status.${signature.status}`)}
        </span>
      </div>
      <div className={styles.fields}>
        <div>
          <span className={styles.fieldLabel}>
            {t("verify.signatures.signedAt")}
          </span>
          <br />
          <b>{formatDateTime(signature.signedAt)}</b>
        </div>
        <div>
          <span className={styles.fieldLabel}>
            {t("verify.signatures.method")}
          </span>
          <br />
          <b>{t(`method.${signature.method}.name`)}</b>
        </div>
        <div>
          <span className={styles.fieldLabel}>
            {t("verify.signatures.certificate")}
          </span>
          <br />
          <b className={expired ? styles.bad : undefined}>
            {t(
              expired
                ? "verify.signatures.certificateExpired"
                : "verify.signatures.certificateValid",
              { expiry },
            )}
          </b>
        </div>
        <div>
          <span className={styles.fieldLabel}>
            {t("verify.signatures.content")}
          </span>
          <br />
          <b className={signature.contentIntact ? styles.good : styles.bad}>
            {t(
              signature.contentIntact
                ? "verify.signatures.contentIntact"
                : "verify.signatures.contentChanged",
            )}
          </b>
        </div>
      </div>
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
    <section className={cx(shared.card, styles.panel)}>
      <h2>{t("verify.check.title")}</h2>
      <div className={styles.checkDescription}>
        {t("verify.check.description")}
      </div>
      <label
        className={cx(styles.dropzone, dragging && styles.dropzoneOn)}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <UiInput
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
    </section>
  );
}
