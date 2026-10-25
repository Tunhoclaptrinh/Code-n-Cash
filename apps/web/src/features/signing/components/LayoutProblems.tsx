import { Alert } from "antd";
import { useTranslation } from "react-i18next";

/** Unmet layout rules, announced politely to assistive tech. */
export function LayoutProblems({ problems }: { problems: string[] }) {
  const { t } = useTranslation("signing");
  return (
    <div aria-live="polite">
      {problems.map((code) => (
        <Alert
          key={code}
          type="error"
          showIcon
          title={t(`prepLite.positions.checks.${code}`)}
          style={{ marginBottom: 8 }}
        />
      ))}
    </div>
  );
}
