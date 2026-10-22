import { useState, type ReactNode } from "react";
import { Button, Modal, Tag, Typography } from "antd";
import {
  CheckCircleFilled,
  MoonOutlined,
  SunOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useAppConfig, type ThemeMode } from "@codecash/ui";
import { BrandMark } from "../ui/BrandMark";
import styles from "./Onboarding.module.css";

type Language = "vi" | "en";

/** First-visit modal: both choices are required and apply immediately as a preview. */
export function WelcomeModal({
  open,
  onDone,
}: {
  open: boolean;
  onDone: () => void;
}) {
  const { t, i18n } = useTranslation("common");
  const { setThemeMode } = useAppConfig();
  const [language, setLanguage] = useState<Language>();
  const [theme, setTheme] = useState<ThemeMode>();
  const suggested: Language = navigator.language?.toLowerCase().startsWith("vi")
    ? "vi"
    : "en";

  const pickLanguage = (code: Language) => {
    setLanguage(code);
    void i18n.changeLanguage(code);
  };
  const pickTheme = (mode: ThemeMode) => {
    setTheme(mode);
    setThemeMode(mode);
  };

  return (
    <Modal
      open={open}
      closable={false}
      mask={{ closable: false }}
      keyboard={false}
      footer={null}
      width={560}
      centered
      className="cc-welcome"
    >
      <div className={styles.welcome}>
        <div className={styles.welcomeHead}>
          <BrandMark size={44} />
          <div>
            <Typography.Title level={4} style={{ margin: 0 }}>
              {t("onboarding.title")}
            </Typography.Title>
            <Typography.Text type="secondary">
              {t("onboarding.subtitle")}
            </Typography.Text>
          </div>
        </div>

        <section>
          <div className={styles.sectionTitle}>{t("onboarding.language")}</div>
          <div className={styles.options} role="radiogroup">
            {(["vi", "en"] as const).map((code) => (
              <Choice
                key={code}
                selected={language === code}
                onSelect={() => pickLanguage(code)}
                testId={`welcome-language-${code}`}
                icon={<span className={styles.code}>{code.toUpperCase()}</span>}
                label={t(`languages.${code}`)}
                hint={
                  code === suggested ? (
                    <Tag color="blue" style={{ margin: 0 }}>
                      {t("onboarding.suggested")}
                    </Tag>
                  ) : null
                }
              />
            ))}
          </div>
        </section>

        <section>
          <div className={styles.sectionTitle}>{t("onboarding.theme")}</div>
          <div className={styles.options} role="radiogroup">
            {(["light", "dark"] as const).map((mode) => (
              <Choice
                key={mode}
                selected={theme === mode}
                onSelect={() => pickTheme(mode)}
                testId={`welcome-theme-${mode}`}
                icon={
                  <span className={`${styles.preview} ${styles[mode]}`}>
                    {mode === "light" ? <SunOutlined /> : <MoonOutlined />}
                  </span>
                }
                label={t(`onboarding.${mode}`)}
              />
            ))}
          </div>
        </section>

        <Button
          type="primary"
          size="large"
          block
          disabled={!language || !theme}
          onClick={onDone}
          data-testid="welcome-start"
        >
          {t("onboarding.start")}
        </Button>
        <Typography.Text type="secondary" className={styles.footnote}>
          {t("onboarding.footnote")}
        </Typography.Text>
      </div>
    </Modal>
  );
}

function Choice({
  selected,
  onSelect,
  icon,
  label,
  hint,
  testId,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: ReactNode;
  label: string;
  hint?: ReactNode;
  testId: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      data-testid={testId}
      className={`${styles.choice} ${selected ? styles.choiceOn : ""}`}
      onClick={onSelect}
    >
      {icon}
      <span className={styles.choiceLabel}>{label}</span>
      {hint}
      {selected ? <CheckCircleFilled className={styles.check} /> : null}
    </button>
  );
}
