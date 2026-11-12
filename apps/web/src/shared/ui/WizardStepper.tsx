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

/**
 * The five steps of putting a contract into force, the same bar on every screen of that flow
 * (upload, signature positions, term review, signing): one row across the top of the page, only
 * the current step named on a phone.
 */
export function WizardStepper({ current }: { current: WizardStep }) {
  const { t } = useTranslation("signing");
  const compact = Grid.useBreakpoint().xs === true;
  const index = WIZARD_STEPS.indexOf(current);
  return (
    <Steps
      size="small"
      responsive={false}
      current={index}
      aria-label={t("wizard.label")}
      items={WIZARD_STEPS.map((step, at) => ({
        title: compact && at !== index ? undefined : t(`wizard.steps.${step}`),
      }))}
      data-testid="wizard-steps"
    />
  );
}
