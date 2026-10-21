import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { AppShell } from '@/shared/layout/AppShell';
import { formatDate, formatMillionVnd } from '@/shared/lib/format';
import { getContractOverview } from '../api/contracts.api';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { PageMessage } from '../components/PageMessage';
import { PdfTile } from '../components/PdfTile';
import { StatusBadge } from '../components/StatusBadge';
import { evidenceName, initialsOf } from '../lib/display';
import type { ContractOverview, MilestoneRow, MilestoneStatus, Participant } from '../types';
import styles from './ContractDetailPage.module.css';

type TabKey = 'milestones' | 'documents' | 'participants' | 'history';
const TABS: TabKey[] = ['milestones', 'documents', 'participants', 'history'];

type Emphasis = 'done' | 'attention' | 'danger' | 'active' | 'idle';

const emphasisOf: Record<MilestoneStatus, Emphasis> = {
  RELEASE: 'done',
  PENALTY: 'attention',
  HOLD: 'attention',
  REJECT: 'danger',
  AWAITING_EVIDENCE: 'active',
  AWAITING_APPROVAL: 'active',
  NOT_DUE: 'idle',
  NOT_OPEN: 'idle',
};

const markerClass: Record<Emphasis, string> = {
  done: styles.markerDone,
  attention: styles.markerAttention,
  danger: styles.markerDanger,
  active: styles.markerActive,
  idle: styles.markerIdle,
};

const cardClass: Record<Emphasis, string> = {
  done: '',
  attention: styles.cardAttention,
  danger: styles.cardDanger,
  active: styles.cardActive,
  idle: '',
};

export default function ContractDetailPage() {
  const { t } = useTranslation('milestones');
  const { t: tc } = useTranslation('common');
  const contractId = useParams().contractId ?? '';
  const [tab, setTab] = useState<TabKey>('milestones');

  const overview = useQuery({
    queryKey: ['milestones', 'overview', contractId],
    queryFn: () => getContractOverview(contractId),
  });
  const data = overview.data;

  return (
    <AppShell
      active="contracts"
      breadcrumb={[
        { label: tc('nav.contracts'), to: '/contracts' },
        { label: t('detail.breadcrumb', { contractId }) },
      ]}
      contentClassName={styles.page}
    >
      {overview.isPending ? <PageMessage kind="loading" /> : null}
      {overview.isError ? <PageMessage kind="error" /> : null}
      {data ? (
        <>
          <div className={styles.header}>
            <div className={styles.headerText}>
              <div className={styles.meta}>
                {t('detail.meta', { kind: t(`contractKind.${data.kind}`), supplier: data.supplierName })}
              </div>
              <h1>{data.title}</h1>
            </div>
            <Badge tone={data.phase === 'COMPLETED' ? 'neutral' : 'success'} size="lg">
              {t(`detail.phase.${data.phase}`)}
            </Badge>
            <div className={styles.headerActions}>
              <Button variant="outline" size="header">
                {t('detail.actions.download')}
              </Button>
              <Button to={`/verify/${data.contractId}`} variant="outline" size="header">
                {t('detail.actions.verify')}
              </Button>
            </div>
          </div>

          <div className={styles.tabs} role="tablist" aria-label={t('detail.tabs.label')}>
            {TABS.map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                id={`tab-${key}`}
                aria-selected={tab === key}
                aria-controls={`panel-${key}`}
                className={`${styles.tab} ${tab === key ? styles.tabActive : ''}`}
                onClick={() => setTab(key)}
              >
                {t(`detail.tabs.${key}`)}
              </button>
            ))}
          </div>

          {tab === 'milestones' ? (
            <div className={styles.grid} role="tabpanel" id="panel-milestones" aria-labelledby="tab-milestones">
              <ol className={styles.timeline}>
                {data.milestones.map((row, index) => (
                  <MilestoneItem
                    key={row.no}
                    row={row}
                    contractId={data.contractId}
                    isLast={index === data.milestones.length - 1}
                  />
                ))}
              </ol>
              <div className={styles.sidebar}>
                <PaymentOverview data={data} />
                <Card className={`${styles.sideCard} ${styles.people}`}>
                  <h2>{t('detail.participants.title')}</h2>
                  <ParticipantRows participants={data.participants} />
                </Card>
              </div>
            </div>
          ) : null}

          {tab === 'documents' ? (
            <Card className={styles.tabPanel}>
              <div role="tabpanel" id="panel-documents" aria-labelledby="tab-documents" className={styles.panelBody}>
                <h2>{t('detail.documents.title')}</h2>
                {data.documents.length === 0 ? <p className={styles.empty}>{t('detail.documents.empty')}</p> : null}
                {data.documents.map(({ milestoneNo, file }) => (
                  <div key={`${milestoneNo}-${file.id}`} className={styles.documentRow}>
                    <PdfTile variant="plain" />
                    <div className={styles.documentName}>
                      <b>{file.fileName}</b>
                      <div className={styles.documentMeta}>
                        {t('detail.documents.meta', { no: milestoneNo, type: evidenceName(t, file.type) })}
                      </div>
                    </div>
                    <Badge tone={file.signature?.valid ? 'success' : 'primary'}>
                      {file.signature?.valid ? t('common.signatureValid') : t('submit.file.unsigned')}
                    </Badge>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          {tab === 'participants' ? (
            <Card className={styles.tabPanel}>
              <div role="tabpanel" id="panel-participants" aria-labelledby="tab-participants" className={styles.panelBody}>
                <h2>{t('detail.participants.title')}</h2>
                <ParticipantRows participants={data.participants} />
              </div>
            </Card>
          ) : null}

          {tab === 'history' ? (
            <Card className={styles.tabPanel}>
              <div role="tabpanel" id="panel-history" aria-labelledby="tab-history" className={styles.panelBody}>
                <p>{t('detail.history.body')}</p>
                <Link to="/activity-log" className={styles.link}>
                  {t('detail.history.link')}
                </Link>
              </div>
            </Card>
          ) : null}
        </>
      ) : null}
    </AppShell>
  );
}

function MilestoneItem({ row, contractId, isLast }: { row: MilestoneRow; contractId: string; isLast: boolean }) {
  const { t } = useTranslation('milestones');
  const { t: tc } = useTranslation('common');
  const emphasis = emphasisOf[row.status];
  const name = t(`milestoneKind.${row.kind}`);

  const dueLine = row.deliveredOn
    ? t('detail.milestone.dueDelivered', { due: formatDate(row.dueDate), delivered: formatDate(row.deliveredOn) })
    : t('detail.milestone.due', { due: formatDate(row.dueDate) });

  return (
    <li className={styles.milestone}>
      <div className={styles.rail}>
        {isLast ? null : <span className={styles.railLine} />}
        <span className={`${styles.marker} ${markerClass[emphasis]}`}>
          {emphasis === 'done' ? '✓' : emphasis === 'attention' || emphasis === 'danger' ? '!' : row.no}
        </span>
      </div>
      <Card as="div" className={`${styles.milestoneCard} ${cardClass[emphasis]}`}>
        <div className={styles.info}>
          <div className={styles.nameRow}>
            <b className={styles.name}>{t('detail.milestone.name', { no: row.no, name })}</b>
            <StatusBadge status={row.status} />
          </div>
          <div className={styles.due}>{dueLine}</div>
          {factsOf(t, tc, row).map((fact) => (
            <div key={fact.label} className={styles.fact}>
              <span className={styles.factLabel}>{fact.label} </span>
              <b>{fact.value}</b>
            </div>
          ))}
        </div>
        <div>
          <b className={styles.amount}>{formatMillionVnd(row.plannedMillion)}</b>
          <span className={styles.amountUnit}> {t('detail.milestone.amountUnit')}</span>
        </div>
        <div className={styles.side}>{sideOf(t, tc, row, contractId)}</div>
      </Card>
    </li>
  );
}

function factsOf(t: TFunction<'milestones'>, tc: TFunction<'common'>, row: MilestoneRow): Array<{ label: string; value: string }> {
  const fact = (key: string) => t(`detail.milestone.fact.${key}`);
  const evidence = row.requiredEvidence.map((type) => evidenceName(t, type)).join(', ');
  const paid = formatMillionVnd(row.payableMillion ?? 0);

  switch (row.status) {
    case 'RELEASE':
      return [
        ...(row.completedOn ? [{ label: fact('completed'), value: formatDate(row.completedOn) }] : []),
        { label: fact('paid'), value: paid },
      ];
    case 'PENALTY':
      return [
        { label: fact('penalty'), value: formatMillionVnd(row.penaltyMillion ?? 0) },
        { label: fact('paid'), value: paid },
      ];
    case 'HOLD':
    case 'REJECT':
      return [{ label: fact('paid'), value: paid }];
    case 'AWAITING_APPROVAL':
      return [
        { label: fact('required'), value: evidence },
        ...(row.deliveredOn ? [{ label: fact('submittedOn'), value: formatDate(row.deliveredOn) }] : []),
      ];
    case 'NOT_OPEN':
      return [
        { label: fact('required'), value: evidence },
        { label: fact('opensWhen'), value: t('detail.milestone.opensWhenValue', { no: row.opensAfterNo ?? row.no - 1 }) },
      ];
    case 'AWAITING_EVIDENCE':
    case 'NOT_DUE':
      return [
        { label: fact('required'), value: evidence },
        { label: fact('submitter'), value: tc(`roles.${row.submitterRole}.name`) },
      ];
  }
}

function sideOf(t: TFunction<'milestones'>, tc: TFunction<'common'>, row: MilestoneRow, contractId: string): ReactNode {
  switch (row.status) {
    case 'RELEASE':
      return row.transferredToAccounting ? (
        <span className={styles.sideDone}>{t('detail.milestone.side.transferred')}</span>
      ) : (
        <span className={styles.sideMuted}>{t('detail.milestone.side.notTransferred')}</span>
      );
    case 'PENALTY':
    case 'HOLD':
    case 'REJECT':
      return (
        <Button
          to={`/contracts/${contractId}/milestones/${row.no}/decision`}
          variant="primary"
          size="compact"
        >
          {t('detail.milestone.side.viewDecision')}
        </Button>
      );
    case 'AWAITING_APPROVAL':
      return <span className={styles.sideMuted}>{t('detail.milestone.side.awaitingApproval')}</span>;
    case 'AWAITING_EVIDENCE':
    case 'NOT_DUE':
      return (
        <span className={styles.sideMuted}>
          {t('detail.milestone.side.waitingSubmitter', { role: tc(`roles.${row.submitterRole}.name`) })}
        </span>
      );
    case 'NOT_OPEN':
      return <span className={styles.sideMuted}>{t('detail.milestone.side.noTask')}</span>;
  }
}

function PaymentOverview({ data }: { data: ContractOverview }) {
  const { t } = useTranslation('milestones');
  const percent = (part: number) => `${Math.round((part / data.valueMillion) * 1000) / 10}%`;
  return (
    <Card className={`${styles.sideCard} ${styles.payment}`}>
      <h2>{t('detail.payment.title')}</h2>
      <div className={styles.paymentRow}>
        <span className={styles.paymentLabel}>{t('detail.payment.contractValue')}</span>
        <b className={styles.paymentValue}>{formatMillionVnd(data.valueMillion)}</b>
      </div>
      <div className={styles.paymentRow}>
        <span className={styles.paymentLabel}>{t('detail.payment.settled')}</span>
        <b className={`${styles.paymentValue} ${styles.paymentSettled}`}>{formatMillionVnd(data.settledMillion)}</b>
      </div>
      <div className={styles.paymentRow}>
        <span className={styles.paymentLabel}>{t('detail.payment.penalty')}</span>
        <b className={`${styles.paymentValue} ${styles.paymentPenalty}`}>{formatMillionVnd(data.penaltyMillion)}</b>
      </div>
      <div className={styles.paymentRow}>
        <span className={styles.paymentLabel}>{t('detail.payment.notDue')}</span>
        <b className={styles.paymentValue}>{formatMillionVnd(data.notDueMillion)}</b>
      </div>
      {data.inProgressMillion > 0 ? (
        <div className={styles.paymentRow}>
          <span className={styles.paymentLabel}>{t('detail.payment.inProgress')}</span>
          <b className={styles.paymentValue}>{formatMillionVnd(data.inProgressMillion)}</b>
        </div>
      ) : null}
      <div className={styles.bar} role="img" aria-label={t('detail.payment.progressAria')}>
        <span className={styles.barSettled} style={{ width: percent(data.settledMillion) }} />
        <span className={styles.barPenalty} style={{ width: percent(data.penaltyMillion) }} />
      </div>
      <div className={styles.unit}>{t('detail.payment.unit')}</div>
    </Card>
  );
}

function ParticipantRows({ participants }: { participants: Participant[] }) {
  const { t } = useTranslation('milestones');
  return (
    <>
      {participants.map((person) => (
        <div key={person.id} className={styles.person}>
          <span className={styles.avatar}>{initialsOf(person.name)}</span>
          <div className={styles.personInfo}>
            <b>{person.name}</b>
            <div className={styles.personRole}>
              {person.side === 'BUYER'
                ? t('detail.participants.role', {
                    role: t(`participantRole.${person.role}`),
                    side: t(`side.${person.side}`),
                  })
                : t(`participantRole.${person.role}`)}
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
