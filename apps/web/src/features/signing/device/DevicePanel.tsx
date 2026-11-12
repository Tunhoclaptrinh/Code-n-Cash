import { useEffect, useState } from "react";
import { Button, Input } from "antd";
import {
  CheckCircleFilled,
  CloseCircleFilled,
  MobileOutlined,
  SafetyCertificateOutlined,
  UsbOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { ApiError } from "@codecash/api-client";
import { formatDate, formatDateTime } from "@/shared/lib/format";
import type { DeviceTransaction } from "./deviceApi";
import type { SigningDevice } from "./useSigningDevice";
import styles from "./DevicePanel.module.css";

const short = (hash: string) => `${hash.slice(0, 8)}…${hash.slice(-8)}`;

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/**
 * The person's signing device, simulated: the phone app of a remote signing service, or a USB
 * token when the request asks for one. It shows what the service shows a real device: who asks,
 * what is signed (title, hash), a code to match with the CodeCash screen and the time left, and
 * signs only after the PIN. Used in the corner widget and on the phone page (/device).
 */
export function DevicePanel({
  device,
  variant,
}: {
  device: SigningDevice;
  variant: "dock" | "page";
}) {
  const { t } = useTranslation("signing");
  const now = useNow();
  const request = device.pending[0];
  const [inserted, setInserted] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [result, setResult] = useState<"SIGNED" | "REJECTED" | null>(null);
  const channel = request?.channel ?? "MOBILE_APP";

  useEffect(() => {
    setPin("");
    device.approve.reset();
  }, [request?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(() => setResult(null), 4000);
    return () => clearTimeout(timer);
  }, [result]);

  const errorCode =
    device.approve.error instanceof ApiError
      ? device.approve.error.code
      : device.approve.error
        ? "UNKNOWN"
        : null;
  const locked = device.credential?.locked;
  const approve = (tx: DeviceTransaction) =>
    device.approve.mutate(
      { id: tx.id, pin },
      {
        onSuccess: () => {
          setResult("SIGNED");
          setInserted(null);
        },
        onError: () => setPin(""),
      },
    );
  const reject = (tx: DeviceTransaction) =>
    device.reject.mutate(tx.id, {
      onSuccess: () => {
        setResult("REJECTED");
        setInserted(null);
      },
    });

  const body = (() => {
    if (result)
      return (
        <div className={styles.done} data-testid="device-result">
          {result === "SIGNED" ? (
            <CheckCircleFilled className={styles.doneOk} />
          ) : (
            <CloseCircleFilled className={styles.doneNo} />
          )}
          <b>{t(`device.result.${result}`)}</b>
          <span>{t(`device.result.${result}Hint`)}</span>
        </div>
      );
    if (!request)
      return (
        <div className={styles.idle} data-testid="device-idle">
          <p className={styles.idleText}>{t("device.idle")}</p>
          {device.credential ? (
            <div className={styles.cert}>
              <SafetyCertificateOutlined />
              <div>
                <b>{device.credential.certificate.subject.commonName}</b>
                <span>
                  {device.credential.certificate.subject.organization}
                </span>
                <span>
                  {t("device.cert.issuer", {
                    issuer: device.credential.certificate.issuer.commonName,
                  })}
                </span>
                <span>
                  {t("device.cert.serial", {
                    serial: device.credential.certificate.serial,
                  })}{" "}
                  ·{" "}
                  {t("device.cert.until", {
                    date: formatDate(device.credential.certificate.notAfter),
                  })}
                </span>
              </div>
            </div>
          ) : null}
          {device.transactions.length ? (
            <ul className={styles.recent}>
              {device.transactions.slice(0, 3).map((tx) => (
                <li key={tx.id}>
                  <span>{tx.display.title}</span>
                  <em data-status={tx.status}>
                    {t(`device.status.${tx.status}`)}
                  </em>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      );
    const left = Math.max(0, Date.parse(request.expiresAt) - now);
    const needsToken = channel === "USB_TOKEN" && inserted !== request.id;
    return (
      <div className={styles.request} data-testid="device-request">
        <p className={styles.from}>
          {t("device.request.from", { party: request.display.relyingParty })}
        </p>
        <h3 className={styles.docTitle}>{request.display.title}</h3>
        <div className={styles.code}>
          <span>{t("device.request.code")}</span>
          <b data-testid="device-code">{request.confirmationCode}</b>
          <small>{t("device.request.codeHint")}</small>
        </div>
        <dl className={styles.facts}>
          <div>
            <dt>{t("device.request.hash")}</dt>
            <dd>
              <code>{short(request.hash)}</code>
            </dd>
          </div>
          <div>
            <dt>{t("device.request.left")}</dt>
            <dd className={left < 60_000 ? styles.soon : undefined}>
              {String(Math.floor(left / 60000)).padStart(2, "0")}:
              {String(Math.floor((left % 60000) / 1000)).padStart(2, "0")}
            </dd>
          </div>
        </dl>
        {needsToken ? (
          <div className={styles.token}>
            <UsbOutlined className={styles.tokenIcon} />
            <p>{t("device.token.insert")}</p>
            <Button
              type="primary"
              block
              onClick={() => setInserted(request.id)}
              data-testid="device-insert-token"
            >
              {t("device.token.insertAction")}
            </Button>
          </div>
        ) : (
          <div className={styles.pin}>
            <label htmlFor="device-pin">
              {t(
                channel === "USB_TOKEN" ? "device.pin.token" : "device.pin.app",
              )}
            </label>
            <Input.OTP
              id="device-pin"
              length={6}
              mask="•"
              value={pin}
              onChange={setPin}
              disabled={locked || device.approve.isPending}
              data-testid="device-pin"
            />
            <small className={styles.pinHint}>
              {locked
                ? t("device.pin.locked", {
                    at: formatDateTime(device.credential!.lockedUntil!),
                  })
                : errorCode === "WRONG_PIN"
                  ? t("device.pin.wrong", {
                      count: device.credential?.triesLeft ?? 0,
                    })
                  : errorCode
                    ? t(`device.errors.${errorCode}`, {
                        defaultValue: t("device.errors.UNKNOWN"),
                      })
                    : t("device.pin.demo", {
                        pin: device.credential?.demoPin ?? "123456",
                      })}
            </small>
          </div>
        )}
        <div className={styles.actions}>
          <Button
            danger
            onClick={() => reject(request)}
            loading={device.reject.isPending}
            data-testid="device-reject"
          >
            {t("device.actions.reject")}
          </Button>
          <Button
            type="primary"
            disabled={needsToken || pin.length !== 6 || locked}
            loading={device.approve.isPending}
            onClick={() => approve(request)}
            data-testid="device-approve"
          >
            {t("device.actions.approve")}
          </Button>
        </div>
      </div>
    );
  })();

  return (
    <div
      className={styles.device}
      data-variant={variant}
      data-channel={channel}
      data-testid="signing-device"
    >
      <header className={styles.bar}>
        {channel === "USB_TOKEN" ? <UsbOutlined /> : <MobileOutlined />}
        <b>
          {t(channel === "USB_TOKEN" ? "device.name.token" : "device.name.app")}
        </b>
        <span
          className={styles.live}
          data-live={device.live || undefined}
          title={t(device.live ? "device.live" : "device.offline")}
        />
      </header>
      {body}
      <footer className={styles.footer}>{t("device.simulated")}</footer>
    </div>
  );
}
