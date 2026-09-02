'use client';

import { LineChart } from 'lucide-react';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import {
  Pill,
  TABLE_FRAME,
  TABLE_PAGE_SIZE,
  formatDateTime,
} from '@/components/partner/partner-ui';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { partnerApi, type IbClientPosition } from '@/lib/api/partner';
import { compareMoney, formatDecimal } from '@/lib/money';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/**
 * What this partner's clients have open right now.
 *
 * ## Why a partner sees this at all
 *
 * Their income depends on it, and the only other signal they have is a
 * commission total arriving after the fact. "Is my book actually trading" is the
 * question behind most partner support messages, and it is answerable from data
 * the platform already holds.
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
const PAGING = { noun: ['position', 'positions'] as [string, string], pageSize: TABLE_PAGE_SIZE };

export function PartnerPositions() {
  const query = useResource<IbClientPosition[]>(keys.partner.positions(), (signal) =>
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
        <Pill tone={row.side === 'buy' ? 'success' : 'destructive'}>
          {row.side === 'buy' ? t('partner.sideBuy') : t('partner.sideSell')}
        </Pill>
      ),
      sortable: true,
      sortKey: 'side',
    },
    {
      header: t('partner.colVolume'),
      cell: (row) => formatDecimal(row.volume),
      align: 'right',
      cellClassName: 'tabular',
      sortable: true,
      sortKey: 'volume',
      sortType: 'money',
    },
    {
      header: t('partner.colOpenPrice'),
      // A PRICE, not money: no currency, and every significant digit kept —
      // this rendered `157.4200000000`, which is the storage scale on screen.
      cell: (row) => formatDecimal(row.openPrice),
      align: 'right',
      cellClassName: 'tabular text-muted-foreground',
    },
    {
      /*
       * FLOATING, and coloured — the one number on the row that moves while
       * nobody is watching. A partner reading it as settled would misjudge their
       * own pipeline, so it is styled as a live figure rather than a total.
       */
      header: t('partner.colFloating'),
      cell: (row) => <Floating profit={row.profit} />,
      align: 'right',
      cellClassName: 'tabular',
      sortable: true,
      sortKey: 'profit',
      sortType: 'money',
    },
    {
      header: t('partner.colOpened'),
      cell: (row) => formatDateTime(row.openedAt),
      cellClassName: 'whitespace-nowrap text-muted-foreground',
      sortable: true,
      sortKey: 'openedAt',
      sortType: 'date',
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
    >
      <div className={TABLE_FRAME}>
        <DataTable
          caption={t('partner.tabPositions')}
          columns={columns}
          rows={query.data ?? []}
          rowKey={(row) => row.id}
          dimmed={query.isFetching}
          clientPagination={PAGING}
          fill
          empty={
            <EmptyState
              icon={LineChart}
              message={`${t('partner.positionsEmpty')} — ${t('partner.positionsEmptyBody')}`}
            />
          }
        />
      </div>
    </AsyncBoundary>
  );
}

/**
 * A floating P/L, coloured by its sign.
 *
 * `compareMoney`, never `Number(row.profit)`. The coercion this repo bans on
 * money paths was here twice — and a float is wrong before the comparison
 * happens, which on a P/L column decides whether a partner sees red or green.
 * `'-0.00000001'` is a real loss.
 */
function Floating({ profit }: { profit?: string | null }) {
  if (profit === null || profit === undefined)
    return <span className="text-muted-foreground">—</span>;

  const sign = compareMoney(profit, '0');
  const tone = sign > 0 ? 'text-success' : sign < 0 ? 'text-destructive' : 'text-muted-foreground';

  return <span className={tone}>{formatDecimal(profit)}</span>;
}
