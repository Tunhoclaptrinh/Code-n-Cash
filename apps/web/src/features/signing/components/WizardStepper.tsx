import { Steps } from "antd";
import { useTranslation } from "react-i18next";
export const WIZARD_STEPS = [
  "UPLOAD",
  "SIGN_POSITIONS",
  "REVIEW",
  "SIGN",
  "EFFECTIVE",
] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];
export function WizardStepper({ current }: { current: WizardStep }) {
  const { t } = useTranslation("signing");
  return (
    <Steps
      current={WIZARD_STEPS.indexOf(current)}
      items={WIZARD_STEPS.map((s) => ({ title: t(`wizard.steps.${s}`) }))}
    />
  );
}
