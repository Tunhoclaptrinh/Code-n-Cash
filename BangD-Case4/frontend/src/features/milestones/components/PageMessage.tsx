import { useTranslation } from 'react-i18next';
import styles from './PageMessage.module.css';

interface PageMessageProps {
  kind: 'loading' | 'error' | 'notFound';
}

/** Minimal loading, error and empty states shared by the milestone pages. */
export function PageMessage({ kind }: PageMessageProps) {
  const { t } = useTranslation(['common', 'milestones']);
  const text =
    kind === 'loading'
      ? t('common.loading', { ns: 'common' })
      : kind === 'error'
        ? t('common.loadError', { ns: 'common' })
        : t('common.notFound', { ns: 'milestones' });
  return (
    <p className={styles.message} role={kind === 'error' ? 'alert' : 'status'}>
      {text}
    </p>
  );
}
