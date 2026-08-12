'use client';

import { Coins } from 'lucide-react';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { partnerApi, type IbCommissionRow } from '@/lib/api/partner';
import { formatMoney } from '@/lib/money';
import { t } from '@/lib/i18n';

/**
 * Every commission this partner has earned, claim and credit alike.
 *
 * ## Why this table exists beside the totals
 *
 * The dashboard figures read the LEDGER — money actually credited — so a
 * partner whose accruals are inside the maturation window sees zero there and
 * cannot tell "nothing earned" from "earned, not yet released". Those are
 * wildly different facts to somebody waiting to be paid, so every row carries
 * its status and the two numbers explain each other.
 *
 * ## The base and the rate are columns, not a tooltip
 *
 * A partner reading "2.80" cannot check it. Reading "4.00 × 70%" they can, and
 * the first question support gets — "why is this so small" — is answered on the
 * row instead of by an email.
 *
 * `DataTable` rather than a hand-rolled table, so this sorts, pages and scrolls
 * exactly like the transactions screen. A partner should not have to learn a
 * second table in the same app.
 */
const PAGING = { noun: ['entry', 'entries'] as [string, string] };

export function PartnerCommissions() {
  const query = useResource<IbCommissionRow[]>(['ib-commissions'], (signal) =>
    partnerApi.commissions(signal),
  );

  const columns: Column<IbCommissionRow>[] = [
    {
      header: t('partner.colDate'),
      cell: (row) => formatDate(row.createdAt),
      cellClassName: 'whitespace-nowrap text-muted-foreground',
      sortable: true,
      sortKey: 'createdAt',
    },
    {
      header: t('partner.colClient'),
      cell: (row) => <span className="font-medium">{row.clientName}</span>,
      sortable: true,
      sortKey: 'clientName',
    },
    {
      header: t('partner.colSource'),
      cell: (row) => (
        <span className="text-muted-foreground">
          {row.source === 'position' ? t('partner.sourceTrade') : t('partner.sourceDeposit')}
          {/* Depth 2 is a sub-partner's client — a different kind of earning,
              and the one a partner is most likely to query. */}
          {row.depth > 1 && <span className="ml-1 text-[10px]">{t('partner.viaSubPartner')}</span>}
        </span>
      ),
    },
    {
      header: t('partner.colBase'),
      cell: (row) => formatMoney(row.baseAmount, row.currency),
      align: 'right',
      cellClassName: 'tabular text-muted-foreground',
      sortable: true,
      sortKey: 'baseAmount',
      sortType: 'money',
    },
    {
      header: t('partner.colRate'),
      cell: (row) => trimRate(row.rateValue),
      align: 'right',
      cellClassName: 'tabular text-muted-foreground',
    },
    {
      header: t('partner.colAmount'),
      cell: (row) => formatMoney(row.amount, row.currency),
      align: 'right',
      cellClassName: 'tabular font-semibold',
      sortable: true,
      sortKey: 'amount',
      sortType: 'money',
    },
    {
      header: t('partner.colStatus'),
      cell: (row) => <StatusPill status={row.status} />,
      sortable: true,
      sortKey: 'status',
    },
  ];

  return (
    <AsyncBoundary
      status={query.status}
      label={t('partner.commissionsLoading')}
      endpoints={['GET /ib/commissions']}
      onRetry={() => query.refetch()}
      errorMessage={apiErrorMessage(query.error, t('partner.commissionsFailed'))}
      error={query.error}
      fill
    >
      <DataTable
        caption={t('partner.tabCommissions')}
        columns={columns}
        rows={query.data ?? []}
        rowKey={(row) => row.id}
        dimmed={query.isFetching}
        clientPagination={PAGING}
        fill
        empty={<EmptyState icon={Coins} message={t('partner.commissionsEmpty')} />}
      />
    </AsyncBoundary>
  );
}

/**
 * The three states, and the middle one is the point.
 *
 * `pending` is earned and not yet spendable — inside the window that exists so
 * a reversed trade can be undone before the money has left. Saying "pending"
 * rather than showing a bare amount is what stops a partner adding up a total
 * they cannot withdraw.
 */
function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'confirmed'
      ? 'border-success/30 bg-success/10 text-success'
      : status === 'reversed'
        ? 'border-destructive/30 bg-destructive/10 text-destructive'
        : 'border-warning/30 bg-warning/10 text-warning';

  const label =
    status === 'confirmed'
      ? t('partner.statusPaid')
      : status === 'reversed'
        ? t('partner.statusReversed')
        : t('partner.statusPending');

  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${tone}`}
    >
      {label}
    </span>
  );
}

/** `'70.0000'` → `'70%'`. The stored scale is for arithmetic, not for reading. */
function trimRate(rate: string): string {
  const value = rate.includes('.') ? rate.replace(/0+$/, '').replace(/\.$/, '') : rate;
  return `${value}%`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}
