import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { ContractStatus } from '@/shared/api/types';
import { useCurrentUser } from '@/shared/auth/session';
import { AppShell } from '@/shared/layout/AppShell';
import { formatMillionVnd } from '@/shared/lib/format';
import { Icon } from '@/shared/ui/Icon';
import { getContractList } from '../api/contractList.api';
import type { ContractRow } from '../types';
import styles from './ContractListPage.module.css';

const STATUSES: ContractStatus[] = ['AWAITING_SIGNATURE', 'DISPUTED', 'AWAITING_EVIDENCE', 'COMPLETED'];

type TileKind = 'signature' | 'dispute' | 'evidence' | 'completed';

const TILE_ORDER: Record<'buyer' | 'supplier', TileKind[]> = {
  buyer: ['signature', 'dispute', 'evidence', 'completed'],
  supplier: ['evidence', 'dispute', 'signature', 'completed'],
};

function countTile(contracts: ContractRow[], kind: TileKind): number {
  switch (kind) {
    case 'signature':
      return contracts.filter((contract) => contract.waitingFor.kind === 'OWNER_SIGNS_FIRST').length;
    case 'dispute':
      return contracts.filter((contract) => contract.status === 'DISPUTED').length;
    case 'evidence':
      return contracts.filter((contract) => contract.status === 'AWAITING_EVIDENCE').length;
    case 'completed':
      return contracts.filter((contract) => contract.status === 'COMPLETED').length;
  }
}

export default function ContractListPage() {
  const { t } = useTranslation('contracts');
  const { t: tc } = useTranslation('common');
  const user = useCurrentUser();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ContractStatus | ''>('');

  const list = useQuery({
    queryKey: ['contract-summaries', user.id],
    queryFn: () => getContractList({ id: user.id, role: user.role, organizationId: user.organizationId }),
  });

  const perspective = user.role === 'SUPPLIER' ? 'supplier' : 'buyer';
  const contracts = list.data?.contracts;

  const visibleContracts = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (contracts ?? []).filter((contract) => {
      if (status && contract.status !== status) return false;
      if (!needle) return true;
      return [contract.code, contract.title, contract.supplierName].some((value) =>
        value.toLowerCase().includes(needle),
      );
    });
  }, [contracts, search, status]);

  return (
    <AppShell
      active="contracts"
      showNotifications
      contentClassName={styles.page}
      breadcrumb={[{ label: t('breadcrumb.home') }, { label: t('breadcrumb.contracts') }]}
    >
      {list.isPending ? <p>{tc('common.loading')}</p> : null}
      {list.isError ? <p role="alert">{tc('common.loadError')}</p> : null}
      {list.data && contracts ? (
        <>
          <div className={styles.header}>
            <div>
              <h1 className={styles.title}>{t('contractList.title')}</h1>
              <span className={styles.subtitle}>
                {t('contractList.subtitle', { count: contracts.length, organization: list.data.organizationName })}
              </span>
            </div>
            {user.role === 'CONTRACT_OWNER' ? (
              <Link to="/contracts/new" className={styles.primaryButton}>
                <Icon name="upload" size={18} strokeWidth={2} />
                {t('contractList.upload')}
              </Link>
            ) : null}
          </div>

          <div className={styles.tiles}>
            {TILE_ORDER[perspective].map((kind, index) => (
              <div key={kind} className={index === 0 ? styles.tileHighlight : styles.tile}>
                <div className={styles.tileValue}>{countTile(contracts, kind)}</div>
                <div className={styles.tileLabel}>{t(`contractList.tiles.${perspective}.${kind}`)}</div>
              </div>
            ))}
          </div>

          <div className={styles.filters}>
            <label className={styles.search}>
              <Icon name="search" size={18} />
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('contractList.filters.searchPlaceholder')}
                aria-label={t('contractList.filters.searchLabel')}
              />
            </label>
            <select className={styles.select} aria-label={t('contractList.filters.typeLabel')}>
              <option>{t('contractList.filters.allTypes')}</option>
            </select>
            <select
              className={styles.select}
              aria-label={t('contractList.filters.statusLabel')}
              value={status}
              onChange={(event) => setStatus(event.target.value as ContractStatus | '')}
            >
              <option value="">{t('contractList.filters.allStatuses')}</option>
              {STATUSES.map((value) => (
                <option key={value} value={value}>
                  {t(`contractList.status.${value}`)}
                </option>
              ))}
            </select>
            <select className={styles.select} aria-label={t('contractList.filters.policyLabel')}>
              <option>{t('contractList.filters.allPolicies')}</option>
            </select>
          </div>

          <div className={styles.tableCard}>
            <table className={styles.table}>
              <thead>
                <tr className={styles.headRow}>
                  <th className={styles.cellEdge}>{t('contractList.table.columns.contract')}</th>
                  <th className={styles.cell}>{t('contractList.table.columns.supplier')}</th>
                  <th className={`${styles.cell} ${styles.right}`}>{t('contractList.table.columns.value')}</th>
                  <th className={styles.cellEdge}>{t('contractList.table.columns.progress')}</th>
                  <th className={styles.cell}>{t('contractList.table.columns.status')}</th>
                  <th className={styles.cell}>{t('contractList.table.columns.waiting')}</th>
                  <th className={styles.cellEdge}>
                    <span className={styles.srOnly}>{t('contractList.table.columns.actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleContracts.map((contract) => (
                  <ContractTableRow key={contract.code} contract={contract} isOwner={user.role === 'CONTRACT_OWNER'} />
                ))}
                {visibleContracts.length === 0 ? (
                  <tr className={styles.row}>
                    <td className={styles.empty} colSpan={7}>
                      {t('contractList.table.empty')}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </AppShell>
  );
}

const STATUS_CLASS: Record<ContractStatus, string> = {
  AWAITING_SIGNATURE: styles.badgeNeutral,
  DISPUTED: styles.badgeDanger,
  AWAITING_EVIDENCE: styles.badgeNeutral,
  COMPLETED: styles.badgeSuccess,
};

function ContractTableRow({ contract, isOwner }: { contract: ContractRow; isOwner: boolean }) {
  const { t } = useTranslation('contracts');
  const percent = Math.round((contract.milestonesDone / contract.milestonesTotal) * 100);
  const isComplete = contract.milestonesDone === contract.milestonesTotal;
  const progressKey = contract.deductedMilestones > 0 ? 'milestonesDeducted' : 'milestones';
  const signsNow = isOwner && contract.waitingFor.kind === 'OWNER_SIGNS_FIRST';

  return (
    <tr className={[styles.row, contract.isNewlyDigitized ? styles.rowHighlight : ''].join(' ')}>
      <td className={styles.cellEdge}>
        <b>{contract.code}</b>{' '}
        {contract.isNewlyDigitized ? <span className={styles.badgeNew}>{t('contractList.newlyDigitized')}</span> : null}
        <div className={styles.muted}>{contract.title}</div>
      </td>
      <td className={styles.cell}>{contract.supplierName}</td>
      <td className={`${styles.cell} ${styles.right} ${styles.number}`}>{formatMillionVnd(contract.valueMillion)}</td>
      <td className={styles.cellEdge}>
        <div className={styles.track}>
          {percent > 0 ? (
            <div className={`${styles.fill} ${isComplete ? styles.fillDone : ''}`} style={{ width: `${percent}%` }} />
          ) : null}
        </div>
        <span className={styles.progressText}>
          {t(`contractList.progress.${progressKey}`, {
            done: contract.milestonesDone,
            total: contract.milestonesTotal,
            deducted: contract.deductedMilestones,
          })}
        </span>
      </td>
      <td className={styles.cell}>
        <span className={`${styles.badge} ${STATUS_CLASS[contract.status]}`}>
          {t(`contractList.status.${contract.status}`)}
        </span>
      </td>
      <td className={`${styles.cell} ${contract.waitingFor.kind === 'NOTHING' ? styles.muted : ''}`}>
        <WaitingFor contract={contract} />
      </td>
      <td className={`${styles.cellEdge} ${styles.right}`}>
        {signsNow ? (
          <Link to={`/contracts/${contract.code}/signing`} className={styles.rowPrimary}>
            {t('contractList.actions.signNow')}
          </Link>
        ) : (
          <Link to={`/contracts/${contract.code}`} className={styles.rowSecondary}>
            {t('contractList.actions.open')}
          </Link>
        )}
      </td>
    </tr>
  );
}

function WaitingFor({ contract }: { contract: ContractRow }) {
  const { t } = useTranslation('contracts');
  const { role } = useCurrentUser();
  const { waitingFor } = contract;

  if (waitingFor.kind === 'NOTHING') return <>{t('contractList.waiting.NOTHING')}</>;

  const isSelf =
    waitingFor.kind === 'SUPPLIER_SUBMITS_EVIDENCE' ? role === 'SUPPLIER' : role === 'CONTRACT_OWNER';
  const milestoneNo = 'milestoneNo' in waitingFor ? waitingFor.milestoneNo : undefined;

  return (
    <Trans
      t={t}
      i18nKey={`contractList.waiting.${waitingFor.kind}.${isSelf ? 'self' : 'other'}`}
      values={{ milestoneNo }}
      components={{ b: <b /> }}
    />
  );
}
