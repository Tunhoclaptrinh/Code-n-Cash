import { useState } from "react";
import { Button, Drawer, Dropdown, Popover, Tooltip } from "antd";
import {
  CheckOutlined,
  GlobalOutlined,
  MoonOutlined,
  QuestionCircleOutlined,
  SunOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useAppConfig } from "@codecash/ui";
import { Link } from "react-router-dom";
import { GuideContent } from "@/guide/GuideContent";
import { useSession } from "../auth/session";
import { useOnboarding } from "../onboarding/OnboardingContext";
import styles from "../onboarding/Onboarding.module.css";

/**
 * Help, language and theme buttons shared by the sign-in page and the app header.
 * In the first-run `tips` phase all three pulse at once and one card explains them.
 */
export function PreferenceControls({ compact = false }: { compact?: boolean }) {
  const { t, i18n } = useTranslation("common");
  const { themeMode, toggleTheme } = useAppConfig();
  const { phase, finishTips } = useOnboarding();
  const { user } = useSession();
  const [guideOpen, setGuideOpen] = useState(false);
  const tips = phase === "tips";
  const language = i18n.language?.startsWith("vi") ? "vi" : "en";
  const isLight = themeMode === "light";
  const themeLabel = t(isLight ? "topbar.themeDark" : "topbar.themeLight");
  const pulse = tips ? styles.pulse : undefined;

  const hints = [
    { key: "guide", icon: <QuestionCircleOutlined /> },
    { key: "language", icon: <GlobalOutlined /> },
    { key: "theme", icon: isLight ? <MoonOutlined /> : <SunOutlined /> },
  ] as const;

  return (
    <>
      {tips ? (
        <div
          className={styles.tipsBackdrop}
          onClick={finishTips}
          aria-hidden="true"
        />
      ) : null}
      <Popover
        open={tips}
        placement="bottomRight"
        zIndex={1031}
        rootClassName="cc-tip"
        title={
          <span className={styles.tipTitle}>{t("onboarding.tips.title")}</span>
        }
        content={
          <div className={styles.tipCard}>
            {hints.map((hint) => (
              <div key={hint.key} className={styles.tipRow}>
                <span className={styles.tipIcon}>{hint.icon}</span>
                <span>
                  <b>{t(`onboarding.tips.${hint.key}.title`)}</b>
                  <span className={styles.tipText}>
                    {t(`onboarding.tips.${hint.key}.body`)}
                  </span>
                </span>
              </div>
            ))}
            <Button
              type="primary"
              size="small"
              block
              onClick={finishTips}
              data-testid="tips-done"
            >
              {t("onboarding.tips.done")}
            </Button>
          </div>
        }
      >
        <span className={styles.controls} data-tips={tips}>
          <Tooltip title={tips ? undefined : t("topbar.guide")}>
            <Button
              type="text"
              shape="circle"
              className={pulse}
              icon={<QuestionCircleOutlined />}
              onClick={() => {
                if (tips) finishTips();
                setGuideOpen(true);
              }}
              aria-label={t("topbar.guide")}
              data-testid="header-guide"
            />
          </Tooltip>
          <Dropdown
            trigger={["click"]}
            menu={{
              selectedKeys: [language],
              items: (["vi", "en"] as const).map((code) => ({
                key: code,
                label: t(`languages.${code}`),
                icon: language === code ? <CheckOutlined /> : <span />,
                onClick: () => void i18n.changeLanguage(code),
              })),
            }}
          >
            <Button
              type="text"
              className={pulse}
              icon={<GlobalOutlined />}
              aria-label={t("topbar.language")}
              data-testid="header-language"
            >
              {compact ? null : language.toUpperCase()}
            </Button>
          </Dropdown>
          <Tooltip title={tips ? undefined : themeLabel}>
            <Button
              type="text"
              shape="circle"
              className={pulse}
              icon={
                isLight ? (
                  <MoonOutlined />
                ) : (
                  <SunOutlined style={{ color: "#fcc20f" }} />
                )
              }
              onClick={toggleTheme}
              aria-label={themeLabel}
              data-testid="header-theme"
            />
          </Tooltip>
        </span>
      </Popover>
      <Drawer
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        title={t("guide.topics.start")}
        size="large"
        extra={
          user ? (
            <Link to="/guide/start" onClick={() => setGuideOpen(false)}>
              {t("guide.openFull")}
            </Link>
          ) : undefined
        }
        destroyOnHidden
      >
        <GuideContent topic="start" />
      </Drawer>
    </>
  );
}
