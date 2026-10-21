import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useCurrentUser } from '@/shared/auth/session';
import { AppShell } from '@/shared/layout/AppShell';
import { formatDate, formatMillionVnd, formatTime } from '@/shared/lib/format';
import { getTaskInbox } from '../api/tasks.api';
import { Badge, type BadgeTone } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { PageMessage } from '../components/PageMessage';
import { evidenceName, lowerCase } from '../lib/display';
import type { TaskRow } from '../types';
import styles from './TaskInboxPage.module.css';

const badgeTones: Record<TaskRow['badge'], BadgeTone> = {
  LATE_PENALTY_RISK: 'danger',
  YOUR_TURN: 'primary',
  MILESTONE_ON_HOLD: 'warning',
  ON_TIME: 'success',
};

export default function TaskInboxPage() {
  const { t, i18n } = useTranslation('milestones');
  const { t: tc } = useTranslation('common');
  const user = useCurrentUser();
  const inbox = useQuery({ queryKey: ['milestones', 'inbox', user.id], queryFn: () => getTaskInbox(user.id) });
  const rows = inbox.data ?? [];

  return (
    <AppShell active="tasks" breadcrumb={[{ label: tc('nav.tasks') }]}>
      {inbox.isPending ? <PageMessage kind="loading" /> : null}
      {inbox.isError ? <PageMessage kind="error" /> : null}
      {inbox.data ? (
        <>
          <div className={styles.heading}>
            <h1>{t('inbox.title')}</h1>
            <span>{t('inbox.subtitle', { count: rows.length })}</span>
          </div>
          <p className={styles.intro}>{t('inbox.intro')}</p>

          <Card className={styles.tableCard}>
            {rows.length === 0 ? (
              <p className={styles.empty}>{t('inbox.empty')}</p>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">{t('inbox.columns.task')}</th>
                    <th scope="col">{t('inbox.columns.contractAndMilestone')}</th>
                    <th scope="col">{t('inbox.columns.due')}</th>
                    <th scope="col">{t('inbox.columns.required')}</th>
                    <th scope="col">{t('inbox.columns.status')}</th>
                    <th scope="col">
                      <span className={styles.srOnly}>{t('inbox.columns.actions')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <InboxRow key={row.id} row={row} language={i18n.language} />
                  ))}
                </tbody>
              </table>
            )}
            <div className={styles.footer}>{t('inbox.footer')}</div>
          </Card>
        </>
      ) : null}
    </AppShell>
  );
}

function InboxRow({ row, language }: { row: TaskRow; language: string }) {
  const { t } = useTranslation('milestones');
  const milestoneName = row.heading.kind === 'MILESTONE' ? t(`milestoneKind.${row.heading.milestoneKind}`) : '';

  const heading =
    row.heading.kind === 'MILESTONE'
      ? t('inbox.headingMilestone', { contractId: row.contractId, no: row.heading.no, name: milestoneName })
      : t('inbox.headingTitle', { contractId: row.contractId, title: row.heading.title });

  const subtitle =
    row.subtitle.kind === 'CONTRACT_AMOUNT'
      ? t('inbox.contractAmount', { title: row.subtitle.title, amount: formatMillionVnd(row.subtitle.amountMillion) })
      : row.subtitle.kind === 'BUYER_SIGNED'
        ? t('inbox.buyerSigned', { time: formatTime(row.subtitle.at) })
        : t('inbox.requestReason', { reason: row.subtitle.text });

  const isLate = row.overdueDays > 0;

  return (
    <tr className={isLate ? styles.highlight : undefined}>
      <td>
        <b>{t(`inbox.task.${row.kind}`, { milestone: lowerCase(milestoneName, language) })}</b>
      </td>
      <td>
        {heading}
        <div className={styles.sub}>{subtitle}</div>
      </td>
      <td>
        {isLate ? (
          <>
            <b className={styles.overdue}>{formatDate(row.dueDate)}</b>
            <div className={styles.overdueNote}>{t('inbox.overdue', { count: row.overdueDays })}</div>
          </>
        ) : (
          formatDate(row.dueDate)
        )}
      </td>
      <td>
        <ul className={styles.requirements}>
          {row.requirements.map((requirement) => (
            <li key={requirement}>{evidenceName(t, requirement)}</li>
          ))}
        </ul>
      </td>
      <td>
        <Badge tone={badgeTones[row.badge]}>{t(`inbox.badge.${row.badge}`)}</Badge>
      </td>
      <td className={styles.actionCell}>
        <Button to={row.href} size="row" variant={row.primary ? 'primary' : 'outlinePrimary'}>
          {t(`inbox.action.${row.kind}`)}
        </Button>
      </td>
    </tr>
  );
}
