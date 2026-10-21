import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './WizardStepper.module.css';

export const WIZARD_STEPS = ['UPLOAD', 'SIGN_POSITIONS', 'REVIEW', 'SIGN', 'EFFECTIVE'] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

interface WizardStepperProps {
  current: WizardStep;
}

/** Progress of a contract through the intake and signing wizard; steps before `current` are done. */
export function WizardStepper({ current }: WizardStepperProps) {
  const { t } = useTranslation('signing');
  const currentIndex = WIZARD_STEPS.indexOf(current);

  return (
    <ol className={styles.stepper} aria-label={t('wizard.label')}>
      {WIZARD_STEPS.map((step, index) => {
        const state = index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'todo';
        return (
          <Fragment key={step}>
            {index > 0 ? (
              <li className={[styles.line, index <= currentIndex ? styles.lineDone : ''].join(' ')} aria-hidden="true" />
            ) : null}
            <li className={styles[state]} aria-current={state === 'current' ? 'step' : undefined}>
              <span className={styles.marker} aria-hidden={state === 'done' ? 'true' : undefined}>
                {state === 'done' ? '✓' : index + 1}
              </span>
              {state === 'current' ? <b>{t(`wizard.steps.${step}`)}</b> : <span>{t(`wizard.steps.${step}`)}</span>}
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}
