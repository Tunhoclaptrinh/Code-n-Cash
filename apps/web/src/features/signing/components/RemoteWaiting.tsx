import { useEffect, useState } from "react";
import { Button, Spin } from "antd";
import { MobileOutlined, UsbOutlined } from "@ant-design/icons";
import { Trans, useTranslation } from "react-i18next";
import type { SigningRequest } from "../types";
import shared from "./shared.module.css";
import styles from "./RemoteWaiting.module.css";

/**
 * While the person confirms on their device. The screen never signs by itself: it shows the code
 * the device shows, what is being signed (its hash) and how long the request lasts, and moves on
 * when the signing service reports the result.
 */
export function RemoteWaiting({
  request,
  cancelling,
  resending,
  onCancel,
  onResend,
}: {
  request: SigningRequest;
  cancelling: boolean;
  resending: boolean;
  onCancel: () => void;
  onResend: () => void;
}) {
  const { t } = useTranslation("signing");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const left = Math.max(0, Date.parse(request.expiresAt) - now);
  const token = request.channel === "USB_TOKEN";
  const connecting = !request.transactionId;
  return (
    <section
      className={`${shared.card} ${styles.waiting}`}
      aria-live="polite"
      data-testid="remote-waiting"
    >
      <div className={styles.head}>
        <span className={styles.icon} aria-hidden>
          {token ? <UsbOutlined /> : <MobileOutlined />}
        </span>
        <div>
          <h2>
            {t(token ? "remote.waiting.token" : "remote.waiting.app", {
              method: t(`method.${request.method}.name`),
            })}
          </h2>
          <p>{t("remote.waiting.lead")}</p>
        </div>
        <Spin size="small" />
      </div>
      <div className={styles.code}>
        <span>{t("remote.code")}</span>
        <b data-testid="remote-code">{connecting ? "····" : request.code}</b>
        <small>{t("remote.codeHint")}</small>
      </div>
      <dl className={styles.facts}>
        <div>
          <dt>{t("remote.hash")}</dt>
          <dd>
            <code>
              {request.hash
                ? `${request.hash.slice(0, 8)}…${request.hash.slice(-8)}`
                : "—"}
            </code>
          </dd>
        </div>
        <div>
          <dt>{t("remote.left")}</dt>
          <dd>
            {String(Math.floor(left / 60000)).padStart(2, "0")}:
            {String(Math.floor((left % 60000) / 1000)).padStart(2, "0")}
          </dd>
        </div>
        <div>
          <dt>{t("remote.transaction")}</dt>
          <dd>
            <code>{request.transactionId ?? "—"}</code>
          </dd>
        </div>
      </dl>
      <ol className={styles.steps}>
        <li>
          <Trans t={t} i18nKey="remote.steps.open" components={{ b: <b /> }} />
        </li>
        <li>{t("remote.steps.match")}</li>
        <li>{t(token ? "remote.steps.token" : "remote.steps.pin")}</li>
      </ol>
      <div className={styles.actions}>
        <Button
          onClick={onCancel}
          loading={cancelling}
          data-testid="remote-cancel"
        >
          {t("remote.cancel")}
        </Button>
        <Button
          onClick={onResend}
          loading={resending}
          data-testid="remote-resend"
        >
          {t("remote.resend")}
        </Button>
      </div>
    </section>
  );
}
