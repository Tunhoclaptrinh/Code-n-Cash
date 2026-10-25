import { Grid, Steps } from "antd";
import { useTranslation } from "react-i18next";
const steps = ["upload", "positions", "review", "sign", "effective"];
export function WizardStepper({ current }: { current: number }) {
  const { t } = useTranslation("contracts");
  const compact = Grid.useBreakpoint().xs === true;
  return (
    <Steps
      size="small"
      responsive={false}
      current={current - 1}
      items={steps.map((s, index) => ({
        title:
          compact && index !== current - 1
            ? undefined
            : t(`contractUpload.steps.${s}`),
      }))}
    />
  );
}
