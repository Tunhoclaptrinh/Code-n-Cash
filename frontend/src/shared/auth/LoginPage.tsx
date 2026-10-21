import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { homeByRole } from '../layout/navConfig';
import { Icon } from '../ui/Icon';
import { useSession } from './session';
import styles from './LoginPage.module.css';

export default function LoginPage() {
  const { t } = useTranslation('common');
  const { user, signIn } = useSession();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to={homeByRole[user.role]} replace />;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const signedIn = await signIn(email, password);
      navigate(homeByRole[signedIn.role], { replace: true });
    } catch (caught) {
      setError(caught instanceof ApiError ? t(`login.errors.${caught.code}`) : t('login.errors.UNKNOWN'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      <form className={styles.card} onSubmit={onSubmit} noValidate>
        <div className={styles.brand}>
          <div className={styles.logo}>
            <Icon name="check" size={20} strokeWidth={2.4} />
          </div>
          <div className={styles.brandText}>
            <b>{t('brand.name')}</b>
            <span>{t('brand.product')}</span>
          </div>
        </div>
        <h1 className={styles.title}>{t('login.title')}</h1>

        <label className={styles.field}>
          <span>{t('login.email')}</span>
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label className={styles.field}>
          <span>{t('login.password')}</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>

        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}

        <button type="submit" className={styles.submit} disabled={submitting || !email || !password}>
          {t('login.submit')}
        </button>
      </form>
    </div>
  );
}
