'use client';

import { Coins } from 'lucide-react';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { CommissionSummary } from '@/components/partner/commission-summary';
import {
  Pill,
  TABLE_FRAME,
  TABLE_PAGE_SIZE,
  formatDate,
  type Tone,
} from '@/components/partner/partner-ui';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { partnerApi, type IbCommissionRow } from '@/lib/api/partner';
import { formatMoney } from '@/lib/money';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/**
 * Every commission this partner has earned, claim and credit alike.
 *
 * ## Why the table exists beside the totals
 *
 * The figures above read the LEDGER — money actually credited — so a partner
 * whose accruals are inside the maturation window sees zero there and cannot
 * tell "nothing earned" from "earned, not yet released". Those are wildly
 * different facts to somebody waiting to be paid, so every row carries its
 * status and the summary panel adds them up by status.
 *
 * ## What the broker earned, and the partner's own rate, are NOT shown
 *
 * Both were columns here. They are gone at the operator's request, and the trade
 * is worth stating: the base column published the broker's own revenue on every
 * trade to every partner, which is commercially sensitive in a way the partner's
 * share is not, and the rate belongs to the LEVEL rather than the row — it is
 * shown once, on the overview tab, where it cannot disagree with itself.
 *
 * ## What was ADDED: the release date, and the transfers beside it
 *
 * `confirmedAt` was on the wire and unrendered. It answers "when did this
 * actually become mine", which is a different question from when it was earned,
 * and the gap between the two columns is the maturation window made visible
 * rather than described.
 *
 * The transfers that used to sit beside it are their own TAB now
 * (`PartnerTransfers`). They answer "what have I taken out", which is a
 * different question from this tab's "what have I earned" — and as a panel
 * they were an unpaged list capped at ten rows, so the screen meant to answer
 * "where did my money go" stopped being able to as soon as a partner moved
 * money often. Between the two tabs a partner still walks the whole loop:
 * earned → released → moved.
 */
/*
 * Ten rows a page, matching the frame's height — see `TABLE_PAGE_SIZE`. A page
 * that overflowed the frame would scroll inside it, and the page already
 * scrolls; a page shorter than it would leave the pager floating in white space.
 */
const PAGING = { noun: ['entry', 'entries'] as [string, string], pageSize: TABLE_PAGE_SIZE };

export function PartnerCommissions() {
  const query = useResource<IbCommissionRow[]>(keys.partner.commissions(), (signal) =>
    partnerApi.commissions(signal),
  );

  const rows = query.data ?? [];

  const columns: Column<IbCommissionRow>[] = [
    {
      header: t('partner.colDate'),
      cell: (row) => formatDate(row.createdAt),
      cellClassName: 'whitespace-nowrap text-muted-foreground',
      sortable: true,
      sortKey: 'createdAt',
      sortType: 'date',
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
          {row.depth > 1 && <span className="ms-1 text-[10px]">{t('partner.viaSubPartner')}</span>}
        </span>
      ),
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
      /*
       * WHAT the rate was applied to, and at what rate — the two figures that
       * turn an amount into something a partner can check. Both were on the
       * wire and unrendered, so the one party most likely to dispute a
       * commission saw only the answer.
       */
      header: t('partner.colBase'),
      cell: (row) => formatMoney(row.baseAmount, row.currency),
      align: 'right',
      cellClassName: 'tabular text-muted-foreground',
    },
    {
      header: t('partner.colRate'),
      cell: (row) => row.rateValue,
      align: 'right',
      cellClassName: 'tabular text-muted-foreground',
    },
    {
      header: t('partner.colStatus'),
      cell: (row) => <StatusPill status={row.status} />,
      sortable: true,
      sortKey: 'status',
    },
    {
      /*
       * WHEN it became theirs. Null while an accrual is still maturing, and an
       * em dash is the honest rendering of that — falling back to the earned
       * date would say the money was released the moment it was earned, which is
       * the one thing this column exists to disprove.
       */
      header: t('partner.colReleasedAt'),
      cell: (row) => (row.confirmedAt ? formatDate(row.confirmedAt) : '—'),
      cellClassName: 'whitespace-nowrap text-muted-foreground',
      sortable: true,
      sortKey: 'confirmedAt',
      sortType: 'date',
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
    >
      <div className="flex flex-col gap-5">
        {/*
          Hidden when there is nothing to summarise: a row of zeroes above an
          empty table is two ways of saying the same nothing.

          It takes the full width now. "Moved to your wallet" used to sit beside
          it and is its own TAB — it answers "what have I taken out", which is a
          different question from this tab's "what have I earned", and as a
          panel it was an unpaged list that got less useful with every transfer.
        */}
        {rows.length > 0 && <CommissionSummary rows={rows} />}

        <div className={TABLE_FRAME}>
          <DataTable
            caption={t('partner.tabCommissions')}
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
            dimmed={query.isFetching}
            clientPagination={PAGING}
            fill
            empty={
              <EmptyState
                icon={Coins}
                message={`${t('partner.commissionsEmpty')} — ${t('partner.commissionsEmptyBody')}`}
              />
            }
          />
        </div>
      </div>
    </AsyncBoundary>
  );
}

/**
 * The three states, and the middle one is the point.
 *
 * `pending` is earned and not yet spendable — inside the window that exists so a
 * reversed trade can be undone before the money has left. Saying "pending"
 * rather than showing a bare amount is what stops a partner adding up a total
 * they cannot withdraw.
 */
function StatusPill({ status }: { status: IbCommissionRow['status'] }) {
  const tone: Tone =
    status === 'confirmed' ? 'success' : status === 'reversed' ? 'destructive' : 'warning';

  const label =
    status === 'confirmed'
      ? t('partner.statusPaid')
      : status === 'reversed'
        ? t('partner.statusReversed')
        : t('partner.statusPending');

  return <Pill tone={tone}>{label}</Pill>;
}
