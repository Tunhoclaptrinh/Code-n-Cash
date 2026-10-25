import { useTranslation } from "react-i18next";
import type { SignStepView } from "../types";
import styles from "./SignaturePositions.module.css";

export function SignatureBlock({
  step,
  left,
  headingTop,
  nameTop,
}: {
  step: SignStepView;
  left: number;
  headingTop: number;
  nameTop: number;
}) {
  const { t } = useTranslation("signing");
  return (
    <>
      <div className={styles.blockHeading} style={{ left, top: headingTop }}>
        {t(`document.representative.${step.party}`)}
      </div>
      <div className={styles.blockSigner} style={{ left, top: nameTop }}>
        <div className={styles.blockName}>{step.signerName}</div>
        <div className={styles.blockTitle}>{step.signerTitle}</div>
      </div>
    </>
  );
}
