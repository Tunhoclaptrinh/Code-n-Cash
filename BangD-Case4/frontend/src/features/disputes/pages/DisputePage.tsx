import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AppShell } from '@/shared/layout/AppShell';
import { getDispute } from '../api/dispute.api';
import { DecisionPanel } from '../components/DecisionPanel';
import { SubmissionPanel } from '../components/SubmissionPanel';
import type { DisputeStatus } from '../types';
import styles from './DisputePage.module.css';

const STATUS_CLASS: Record<DisputeStatus, string> = {
  OPEN: styles.statusOpen,
  AWAITING_EVIDENCE: styles.statusOpen,
  RESOLVED: styles.statusResolved,
};

/** Milestone currently on HOLD while the dispute is unresolved. */
const HELD_DECISION = 'HOLD';

export default function DisputePage() {
  const { t } = useTranslation('disputes');
  const { t: tc } = useTranslation('common');
  const params = useParams();
  const contractCode = params.contractId ?? '';
  const milestoneNo = Number(params.milestoneNo);

  const dispute = useQuery({
    queryKey: ['dispute', contractCode, milestoneNo],
    queryFn: () => getDispute(contractCode, milestoneNo),
  });

  const data = dispute.data;

  return (
    <AppShell
      active="contracts"
      breadcrumb={[
        { label: contractCode, to: `/contracts/${contractCode}` },
        { label: t('breadcrumb.dispute', { milestoneNo }) },
      ]}
    >
      {dispute.isPending ? <p>{tc('common.loading')}</p> : null}
      {dispute.isError ? <p role="alert">{tc('common.notFound')}</p> : null}
      {data ? (
        <>
          <div className={styles.header}>
            <h1 className={styles.title}>
              {t('title', { milestoneNo, milestone: t(`milestones.${data.milestoneKind}`) })}
            </h1>
            <span className={`${styles.status} ${STATUS_CLASS[data.status]}`}>
              {t(`status.${data.status}`, { decision: HELD_DECISION })}
            </span>
          </div>
          <div className={styles.columns}>
            <SubmissionPanel dispute={data} />
            <DecisionPanel dispute={data} />
          </div>
        </>
      ) : null}
    </AppShell>
  );
}
