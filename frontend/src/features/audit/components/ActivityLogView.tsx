import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { formatDateTime } from '@/shared/lib/format';
import {
  actorName,
  contractReference,
  describeAction,
  downloadCsv,
  filterActivity,
  toCsv,
} from '../lib/activityText';
import type { ActivityCategory, ActivityEntry, ActivityFilters } from '../types';
import { DateFilter } from './DateFilter';
import styles from './ActivityLogView.module.css';

const CATEGORIES: ActivityCategory[] = ['SYSTEM', 'APPROVAL', 'EVIDENCE', 'DISPUTE', 'SIGN'];

const CATEGORY_CLASS: Record<ActivityCategory, string> = {
  SYSTEM: styles.badgeNeutral,
  APPROVAL: styles.badgeWarning,
  EVIDENCE: styles.badgeInfo,
  DISPUTE: styles.badgeDanger,
  SIGN: styles.badgeSuccess,
};

interface ActivityLogViewProps {
  entries: ActivityEntry[];
  defaultRange: { from: string; to: string };
}

export function ActivityLogView({ entries, defaultRange }: ActivityLogViewProps) {
  const { t } = useTranslation('audit');
  const [filters, setFilters] = useState<ActivityFilters>({
    contractCode: '',
    actorId: '',
    category: '',
    from: defaultRange.from,
    to: defaultRange.to,
  });

  const contractCodes = useMemo(
    () => [...new Set(entries.map((entry) => entry.contractCode))].sort(),
    [entries],
  );
  const actors = useMemo(() => {
    const byId = new Map<string, ActivityEntry>();
    for (const entry of entries) if (!byId.has(entry.actor.id)) byId.set(entry.actor.id, entry);
    return [...byId.values()].map((entry) => ({ id: entry.actor.id, name: actorName(t, entry) }));
  }, [entries, t]);

  const visible = useMemo(
    () =>
      filterActivity(entries, filters).sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()),
    [entries, filters],
  );

  function update(patch: Partial<ActivityFilters>) {
    setFilters((current) => ({ ...current, ...patch }));
  }

  function exportCsv() {
    const header = [
      t('table.columns.time'),
      t('table.columns.actor'),
      t('table.actorRoleColumn'),
      t('table.columns.category'),
      t('table.columns.action'),
      t('table.columns.contract'),
    ];
    const rows = visible.map((entry) => [
      formatDateTime(entry.at),
      actorName(t, entry),
      t(`actorRoles.${entry.actor.role}`),
      t(`categories.${entry.category}`),
      describeAction(t, entry.action),
      contractReference(t, entry),
    ]);
    downloadCsv(t('export.fileName'), toCsv([header, ...rows]));
  }

  return (
    <>
      <div className={styles.header}>
        <h1 className={styles.title}>{t('title')}</h1>
        <span className={styles.subtitle}>{t('subtitle')}</span>
        <div className={styles.headerActions}>
          <button type="button" className={styles.secondaryButton} onClick={exportCsv}>
            {t('export.button')}
          </button>
        </div>
      </div>

      <div className={styles.filters}>
        <div className={`${styles.filter} ${styles.wide}`}>
          <label htmlFor="log-contract" className={styles.filterLabel}>
            {t('filters.contract')}
          </label>
          <select
            id="log-contract"
            className={styles.control}
            value={filters.contractCode}
            onChange={(event) => update({ contractCode: event.target.value })}
          >
            <option value="">{t('filters.allContracts')}</option>
            {contractCodes.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </div>
        <div className={`${styles.filter} ${styles.medium}`}>
          <label htmlFor="log-actor" className={styles.filterLabel}>
            {t('filters.actor')}
          </label>
          <select
            id="log-actor"
            className={styles.control}
            value={filters.actorId}
            onChange={(event) => update({ actorId: event.target.value })}
          >
            <option value="">{t('filters.all')}</option>
            {actors.map((actor) => (
              <option key={actor.id} value={actor.id}>
                {actor.name}
              </option>
            ))}
          </select>
        </div>
        <div className={`${styles.filter} ${styles.narrow}`}>
          <label htmlFor="log-category" className={styles.filterLabel}>
            {t('filters.category')}
          </label>
          <select
            id="log-category"
            className={styles.control}
            value={filters.category}
            onChange={(event) => update({ category: event.target.value as ActivityCategory | '' })}
          >
            <option value="">{t('filters.all')}</option>
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {t(`categories.${category}`)}
              </option>
            ))}
          </select>
        </div>
        <div className={`${styles.filter} ${styles.date}`}>
          <DateFilter
            id="log-from"
            label={t('filters.from')}
            value={filters.from}
            max={filters.to || undefined}
            onChange={(from) => update({ from })}
          />
        </div>
        <div className={`${styles.filter} ${styles.date}`}>
          <DateFilter
            id="log-to"
            label={t('filters.to')}
            value={filters.to}
            min={filters.from || undefined}
            onChange={(to) => update({ to })}
          />
        </div>
        <div className={styles.count} aria-live="polite">
          {t('filters.rowCount', { count: visible.length })}
        </div>
      </div>

      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead>
            <tr className={styles.headRow}>
              <th className={styles.cellEdge}>{t('table.columns.time')}</th>
              <th className={styles.cell}>{t('table.columns.actor')}</th>
              <th className={styles.cell}>{t('table.columns.category')}</th>
              <th className={styles.cell}>{t('table.columns.action')}</th>
              <th className={styles.cellLast}>{t('table.columns.contract')}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((entry) => (
              <tr key={entry.id} className={styles.row}>
                <td className={`${styles.cellEdge} ${styles.time}`}>{formatDateTime(entry.at)}</td>
                <td className={styles.cell}>
                  <b>{actorName(t, entry)}</b>
                  <div className={styles.actorRole}>{t(`actorRoles.${entry.actor.role}`)}</div>
                </td>
                <td className={styles.cell}>
                  <span className={`${styles.badge} ${CATEGORY_CLASS[entry.category]}`}>
                    {t(`categories.${entry.category}`)}
                  </span>
                </td>
                <td className={styles.cell}>{describeAction(t, entry.action)}</td>
                <td className={`${styles.cellLast} ${styles.reference}`}>
                  <Link to={`/contracts/${entry.contractCode}`}>{contractReference(t, entry)}</Link>
                </td>
              </tr>
            ))}
            {visible.length === 0 ? (
              <tr className={styles.row}>
                <td className={styles.empty} colSpan={5}>
                  {t('table.empty')}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
