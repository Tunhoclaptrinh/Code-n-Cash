import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './WizardStepper.module.css';

const STEPS = ['upload', 'positions', 'review', 'sign', 'effective'] as const;

/** Five-step contract registration progress bar; `current` is 1-based. */
export function WizardStepper({ current }: { current: number }) {
  const { t } = useTranslation('contracts');

  return (
    <ol className={styles.stepper} aria-label={t('contractUpload.steps.label')}>
      {STEPS.map((step, index) => {
        const number = index + 1;
        const isCurrent = number === current;
        return (
          <Fragment key={step}>
            {index > 0 ? <li className={styles.line} aria-hidden="true" /> : null}
            <li className={isCurrent ? styles.stepCurrent : styles.step} aria-current={isCurrent ? 'step' : undefined}>
              <span className={styles.bullet}>{number}</span>
              {isCurrent ? <b>{t(`contractUpload.steps.${step}`)}</b> : <span>{t(`contractUpload.steps.${step}`)}</span>}
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}
