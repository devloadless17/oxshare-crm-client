'use client';

import { LineChart } from 'lucide-react';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { partnerApi, type IbClientPosition } from '@/lib/api/partner';
import { t } from '@/lib/i18n';

/**
 * What this partner's clients have open right now.
 *
 * ## Why a partner sees this at all
 *
 * Their income depends on it, and until now the only signal they had was a
 * commission total arriving after the fact. "Is my book actually trading" is
 * the question behind most partner support messages, and it is answerable from
 * data the platform already holds.
 *
 * ## What is deliberately NOT here
 *
 * No stop loss, no take profit, and nothing to click. A partner is not their
 * client's manager and has no authority over the trade — showing the levels
 * would invite them to advise on positions whose reasoning they cannot see, and
 * any control at all would be one person trading another's account.
 *
 * DIRECT clients only, enforced server-side: a sub-partner's clients are
 * somebody else's book, and listing them would hand one partner a view of
 * another's client list.
 */
const PAGING = { noun: ['position', 'positions'] as [string, string] };

export function PartnerPositions() {
  const query = useResource<IbClientPosition[]>(['ib-positions'], (signal) =>
    partnerApi.positions(signal),
  );

  const columns: Column<IbClientPosition>[] = [
    {
      header: t('partner.colClient'),
      cell: (row) => <span className="font-medium">{row.clientName}</span>,
      sortable: true,
      sortKey: 'clientName',
    },
    {
      header: t('partner.colSymbol'),
      cell: (row) => row.symbol,
      cellClassName: 'font-mono',
      sortable: true,
      sortKey: 'symbol',
    },
    {
      header: t('partner.colSide'),
      cell: (row) => (
        <span
          className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${
            row.side === 'buy'
              ? 'border-success/30 bg-success/10 text-success'
              : 'border-destructive/30 bg-destructive/10 text-destructive'
          }`}
        >
          {row.side === 'buy' ? t('partner.sideBuy') : t('partner.sideSell')}
        </span>
      ),
    },
    {
      header: t('partner.colVolume'),
      cell: (row) => trimLots(row.volume),
      align: 'right',
      cellClassName: 'tabular',
      sortable: true,
      sortKey: 'volume',
      sortType: 'money',
    },
    {
      header: t('partner.colOpenPrice'),
      cell: (row) => row.openPrice,
      align: 'right',
      cellClassName: 'tabular text-muted-foreground',
    },
    {
      /*
       * FLOATING, and coloured — the one number on the row that moves while
       * nobody is watching. A partner reading it as settled would misjudge
       * their own pipeline, so it is styled as a live figure rather than a
       * total.
       */
      header: t('partner.colFloating'),
      cell: (row) => (
        <span
          className={
            Number(row.profit ?? 0) > 0
              ? 'text-success'
              : Number(row.profit ?? 0) < 0
                ? 'text-destructive'
                : 'text-muted-foreground'
          }
        >
          {row.profit ?? '—'}
        </span>
      ),
      align: 'right',
      cellClassName: 'tabular',
      sortable: true,
      sortKey: 'profit',
      sortType: 'money',
    },
    {
      header: t('partner.colOpened'),
      cell: (row) => formatDate(row.openedAt),
      cellClassName: 'whitespace-nowrap text-muted-foreground',
      sortable: true,
      sortKey: 'openedAt',
    },
  ];

  return (
    <AsyncBoundary
      status={query.status}
      label={t('partner.positionsLoading')}
      endpoints={['GET /ib/positions']}
      onRetry={() => query.refetch()}
      errorMessage={apiErrorMessage(query.error, t('partner.positionsFailed'))}
      error={query.error}
      fill
    >
      <DataTable
        caption={t('partner.tabPositions')}
        columns={columns}
        rows={query.data ?? []}
        rowKey={(row) => row.id}
        dimmed={query.isFetching}
        clientPagination={PAGING}
        fill
        empty={<EmptyState icon={LineChart} message={t('partner.positionsEmpty')} />}
      />
    </AsyncBoundary>
  );
}

/** `'0.5000'` → `'0.5'`. Lots are read, not summed, at this scale. */
function trimLots(volume: string): string {
  return volume.includes('.') ? volume.replace(/0+$/, '').replace(/\.$/, '') : volume;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}
