import { useTranslation } from 'react-i18next';

/** Minimal loading and error body shared by the signing pages. */
export function PageStatus({ isError }: { isError: boolean }) {
  const { t } = useTranslation('common');
  return isError ? <p role="alert">{t('common.loadError')}</p> : <p role="status">{t('common.loading')}</p>;
}
