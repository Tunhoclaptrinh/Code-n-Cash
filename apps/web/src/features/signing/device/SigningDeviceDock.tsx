import { useState } from "react";
import { Badge, Button, QRCode, Tooltip } from "antd";
import {
  CloseOutlined,
  MobileOutlined,
  QrcodeOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { DevicePanel } from "./DevicePanel";
import { useSigningDevice } from "./useSigningDevice";
import styles from "./SigningDeviceDock.module.css";

/**
 * The corner entry to the simulated signing device. It stays faint until a signing request for the
 * signed-in person reaches the signing service, then lights up (no motion when the system asks
 * for less). It exists only when CodeCash signs through the remote service; with a real provider,
 * the person's own phone or token takes its place.
 */
export function SigningDeviceDock({ userId }: { userId: string }) {
  const { t } = useTranslation("signing");
  const { pathname } = useLocation();
  const device = useSigningDevice(userId);
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState(false);
  // A waiting request only lights the button up; the person opens the device when ready.
  const count = device.pending.length;

  if (!device.enabled || pathname === "/device") return null;
  const phoneUrl = `${window.location.origin}/device`;
  return (
    <div className={styles.dock} data-testid="signing-dock">
      {open ? (
        <div
          className={styles.panel}
          role="dialog"
          aria-label={t("device.dock.title")}
          data-testid="signing-dock-panel"
        >
          <div className={styles.panelHead}>
            <b>{t("device.dock.title")}</b>
            <Tooltip title={t("device.dock.phone")}>
              <Button
                type="text"
                size="small"
                icon={<QrcodeOutlined />}
                aria-label={t("device.dock.phone")}
                aria-pressed={qr}
                onClick={() => setQr((v) => !v)}
                data-testid="signing-dock-qr"
              />
            </Tooltip>
            <Button
              type="text"
              size="small"
              icon={<CloseOutlined />}
              aria-label={t("device.dock.close")}
              onClick={() => setOpen(false)}
            />
          </div>
          {qr ? (
            <div className={styles.qr}>
              <QRCode value={phoneUrl} size={148} bordered={false} />
              <p>{t("device.dock.phoneHint")}</p>
              <code>{phoneUrl}</code>
            </div>
          ) : null}
          <DevicePanel device={device} variant="dock" />
        </div>
      ) : null}
      <Tooltip
        title={
          count ? t("device.dock.pending", { count }) : t("device.dock.idle")
        }
        placement="left"
      >
        <Badge count={count} size="small" offset={[-4, 4]}>
          <button
            type="button"
            className={styles.trigger}
            data-pending={count > 0 || undefined}
            aria-label={t("device.dock.open")}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            data-testid="signing-dock-trigger"
          >
            <MobileOutlined />
          </button>
        </Badge>
      </Tooltip>
    </div>
  );
}
