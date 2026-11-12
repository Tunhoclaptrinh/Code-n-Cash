import { Button } from "antd";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useCurrentUser } from "@/shared/auth/session";
import { PageState } from "@/shared/ui/PageState";
import { DevicePanel } from "../device/DevicePanel";
import { useSigningDevice } from "../device/useSigningDevice";
import styles from "./DevicePage.module.css";

/**
 * The phone side of signing: sign in on a phone with the same account, open /device, and the
 * signing requests sent from the computer appear here as on a signing app. Full screen, outside
 * the app layout, so it feels like the separate app it stands for.
 */
export default function DevicePage() {
  const { t } = useTranslation("signing");
  const user = useCurrentUser();
  const device = useSigningDevice(user.id);
  if (device.loading) return <PageState kind="loading" />;
  if (!device.enabled)
    return (
      <div className={styles.off} data-testid="device-disabled">
        <h1>{t("device.off.title")}</h1>
        <p>{t("device.off.body")}</p>
        <Link to="/">
          <Button>{t("device.off.back")}</Button>
        </Link>
      </div>
    );
  return (
    <main className={styles.page}>
      <div className={styles.frame}>
        <DevicePanel device={device} variant="page" />
      </div>
    </main>
  );
}
