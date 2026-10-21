import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, NavLink } from 'react-router-dom';
import { getPendingTaskCount } from '../api/tasks.api';
import { useCurrentUser, useSession } from '../auth/session';
import { Icon } from '../ui/Icon';
import { navByRole, type NavKey } from './navConfig';
import styles from './AppShell.module.css';

export interface BreadcrumbItem {
  label: string;
  to?: string;
}

interface AppShellProps {
  /** Which side-navigation entry is highlighted on this screen. */
  active: NavKey;
  breadcrumb: BreadcrumbItem[];
  /** Adds the notification bell next to the user chip. */
  showNotifications?: boolean;
  /** Extra class for the scrollable content area, used by screens with their own padding. */
  contentClassName?: string;
  children: ReactNode;
}

export function AppShell({ active, breadcrumb, showNotifications = false, contentClassName, children }: AppShellProps) {
  const { t } = useTranslation('common');
  const user = useCurrentUser();
  const taskCount = useQuery({
    queryKey: ['pending-task-count', user.id],
    queryFn: () => getPendingTaskCount(user.id),
  });

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <div className={styles.logo}>
            <Icon name="check" size={20} strokeWidth={2.4} />
          </div>
          <div className={styles.brandText}>
            <b>{t('brand.name')}</b>
            <span>{t('brand.product')}</span>
          </div>
        </div>
        <nav className={styles.nav} aria-label={t('nav.label')}>
          {navByRole[user.role].map((item) => (
            <NavLink
              key={item.key}
              to={item.to}
              end
              className={[styles.navItem, item.key === active ? styles.navItemActive : ''].join(' ')}
              aria-current={item.key === active ? 'page' : undefined}
            >
              <Icon name={item.icon} />
              <span className={styles.navLabel}>{t(item.labelKey)}</span>
              {item.badge && taskCount.data ? <span className={styles.navBadge}>{taskCount.data}</span> : null}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className={styles.body}>
        <header className={styles.topbar}>
          <span className={styles.breadcrumb}>
            {breadcrumb.map((item, index) => {
              const isLast = index === breadcrumb.length - 1;
              return (
                <span key={`${item.label}-${index}`}>
                  {isLast ? (
                    <b>{item.label}</b>
                  ) : item.to ? (
                    <Link to={item.to}>{item.label}</Link>
                  ) : (
                    item.label
                  )}
                  {isLast ? null : <span aria-hidden="true"> / </span>}
                </span>
              );
            })}
          </span>
          <span className={styles.roleChip}>
            <span>{t('topbar.role')}</span>
            <b>{`${t(`roles.${user.role}.name`)}, ${user.roleChipOrganization}`}</b>
          </span>
          {showNotifications ? (
            <button type="button" className={styles.bell} aria-label={t('topbar.notifications')}>
              <Icon name="bell" />
            </button>
          ) : null}
          <AccountMenu />
        </header>
        <main className={[styles.content, contentClassName ?? ''].join(' ')}>{children}</main>
      </div>
    </div>
  );
}

function AccountMenu() {
  const { t, i18n } = useTranslation('common');
  const user = useCurrentUser();
  const { signOut } = useSession();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const activeLanguage = i18n.language?.startsWith('vi') ? 'vi' : 'en';

  return (
    <div className={styles.account} ref={containerRef}>
      <button
        type="button"
        className={styles.avatar}
        data-role={user.role}
        aria-label={t('topbar.account')}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {t(`roles.${user.role}.short`)}
      </button>
      {open ? (
        <div className={styles.menu} role="menu">
          <div className={styles.menuUser}>
            <b>{user.displayName}</b>
            <span>{user.email}</span>
          </div>
          <div className={styles.menuLanguages} role="group" aria-label={t('topbar.language')}>
            {(['vi', 'en'] as const).map((language) => (
              <button
                key={language}
                type="button"
                className={language === activeLanguage ? styles.languageActive : styles.language}
                onClick={() => void i18n.changeLanguage(language)}
              >
                {t(`languages.${language}`)}
              </button>
            ))}
          </div>
          <button type="button" className={styles.menuItem} role="menuitem" onClick={signOut}>
            {t('topbar.signOut')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
