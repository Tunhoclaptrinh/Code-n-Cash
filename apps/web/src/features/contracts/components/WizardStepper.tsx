import { Steps } from "antd";
import { useTranslation } from "react-i18next";
const steps = ["upload", "positions", "review", "sign", "effective"];
export function WizardStepper({ current }: { current: number }) {
  const { t } = useTranslation("contracts");
  return (
    <Steps
      current={current - 1}
      items={steps.map((s) => ({ title: t(`contractUpload.steps.${s}`) }))}
    />
  );
}
