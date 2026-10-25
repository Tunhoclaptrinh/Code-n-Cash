import { Alert, Button } from "antd";
import { useTranslation } from "react-i18next";
import type { SigningConfig, SignStepView } from "../types";

interface PositionsAlertsProps {
  config: SigningConfig;
  error: unknown;
  scanNotice: boolean;
  hasNamedAreas: boolean;
  incompatible: SignStepView[];
  unconfiguredPrinted: { signerName?: string }[];
  onCorrectSigners: () => void;
}

/** Notices and blocking errors shown above the signature layout editor. */
export function PositionsAlerts({
  config,
  error,
  scanNotice,
  hasNamedAreas,
  incompatible,
  unconfiguredPrinted,
  onCorrectSigners,
}: PositionsAlertsProps) {
  const { t } = useTranslation("signing");
  const { t: td } = useTranslation("domain");
  return (
    <>
      {error ? (
        <Alert
          type="error"
          showIcon
          title={td(
            `errors.${(error as { code?: string })?.code ?? "UNKNOWN"}`,
            { defaultValue: td("errors.UNKNOWN") },
          )}
          style={{ marginBottom: 12 }}
        />
      ) : null}
      {!config.documentId ? (
        <Alert
          type="warning"
          showIcon
          title={t("prepLite.positions.seedNotice")}
          style={{ marginBottom: 12 }}
        />
      ) : null}
      {scanNotice ? (
        <Alert
          type="warning"
          showIcon
          title={t("prepLite.positions.scanNotice")}
          style={{ marginBottom: 12 }}
        />
      ) : null}
      {config.documentId && !hasNamedAreas ? (
        <Alert
          type="warning"
          showIcon
          title={t("prepLite.positions.identityManual")}
          style={{ marginBottom: 12 }}
        />
      ) : null}
      {incompatible.length || unconfiguredPrinted.length ? (
        <Alert
          type="error"
          showIcon
          data-testid="signer-document-mismatch"
          title={t("positions.mismatchSummary")}
          description={
            <>
              {incompatible.length ? (
                <div>
                  {t("positions.mismatch", {
                    names: incompatible
                      .map((step) => step.signerName)
                      .join(", "),
                  })}
                </div>
              ) : null}
              {unconfiguredPrinted.length ? (
                <div>
                  {t("positions.unconfiguredShort", {
                    names: unconfiguredPrinted
                      .map((area) => area.signerName)
                      .join(", "),
                  })}
                </div>
              ) : null}
              <Button
                size="small"
                onClick={onCorrectSigners}
                style={{ marginTop: 8 }}
              >
                {t("positions.correctSigners")}
              </Button>
            </>
          }
          style={{ marginBottom: 12 }}
        />
      ) : null}
    </>
  );
}
