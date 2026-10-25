import { Grid, Steps } from "antd";
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
  const compact = Grid.useBreakpoint().xs === true;
  return (
    <Steps
      size="small"
      responsive={false}
      current={WIZARD_STEPS.indexOf(current)}
      items={WIZARD_STEPS.map((s, index) => ({
        title:
          compact && index !== WIZARD_STEPS.indexOf(current)
            ? undefined
            : t(`wizard.steps.${s}`),
      }))}
    />
  );
}
