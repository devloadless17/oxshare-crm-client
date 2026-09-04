'use client';

import { Receipt } from 'lucide-react';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, type Column } from '@/components/data-table';
import {
  EmptyPanel,
  TABLE_FRAME,
  TABLE_PAGE_SIZE,
  formatDate,
} from '@/components/partner/partner-ui';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { partnerApi, type IbWalletTransfer } from '@/lib/api/partner';
import { formatMoney } from '@/lib/money';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/**
 * Commission this partner has moved out of their commission wallet.
 *
 * ## Why it is a TAB now, and not a panel beside the commission list
 *
 * It was a short unpaged list — "the last few, newest first" — sharing the
 * Commission tab with the earnings table and the summary cards. That worked
 * while a partner had moved money a handful of times and got worse with every
 * transfer: the list silently stopped at whatever the endpoint returned, with
 * no pager and no count, so the one screen that answers "where did my money go"
 * could not answer it for a partner who had moved money often.
 *
 * It is also a different QUESTION from the one the Commission tab asks.
 * Commission is "what have I earned"; this is "what have I taken out". Sharing
 * a tab made the second look like a footnote to the first.
 *
 * ## What it answers that nothing else does
 *
 * The balances panel raises a question it cannot answer: "my balance is lower
 * than what I have earned — where did the rest go?" Lifetime earnings
 * deliberately do NOT move when a partner transfers money out — both legs are
 * written to the ledger as `transfer`, never `commission`, so moving earned
 * money cannot read as a clawback — which means the difference between the two
 * figures is exactly this list.
 *
 * ## The balances that came back with each transfer are still NOT shown
 *
 * `commissionBalance` and `mainBalance` are optional on the type for the reason
 * the DTO states: they are the balances as they stood at that moment, and the
 * history endpoint cannot honestly fill them. Restating today's figures beside
 * a three-week-old amount invites the reader to treat one row as current.
 *
 * ## Paged in the BROWSER, deliberately
 *
 * `GET /ib/wallet/transfers` returns an array rather than a page. A partner's
 * own transfer history is bounded by their own actions — tens of rows, not
 * thousands — so paging it here costs one small response and gains a pager that
 * cannot disagree with its own data. The commission table on the next tab makes
 * the same call for the same reason.
 */
/*
 * Ten rows a page, matching the frame's height — see `TABLE_PAGE_SIZE`, and the
 * commission table's own note on why the two must agree.
 */
const PAGING = { noun: ['transfer', 'transfers'] as [string, string], pageSize: TABLE_PAGE_SIZE };

export function PartnerTransfers() {
  const query = useResource<IbWalletTransfer[]>(keys.partner.walletTransfers(), (signal) =>
    partnerApi.walletTransfers(signal),
  );

  const rows = query.data ?? [];

  const columns: Column<IbWalletTransfer>[] = [
    {
      header: t('partner.colDate'),
      cell: (row) => formatDate(row.createdAt),
      cellClassName: 'whitespace-nowrap text-muted-foreground',
      sortable: true,
      sortKey: 'createdAt',
      sortType: 'date',
    },
    {
      /*
       * The AMOUNT leads on width and weight: it is what a partner checks
       * against their own memory of the move.
       */
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
       * WHERE IT CAME FROM and WHERE IT WENT, by wallet NUMBER.
       *
       * The tab is called "Moved to your wallet", which names only the
       * destination — and a partner holding commission wallets in two
       * currencies needs to know which one it left. The number is the short
       * identifier they see on their own wallet screen and quote to support; a
       * uuid would be neither readable nor quotable.
       *
       * A dash when the API could not name one: it comes from a LEFT join, and
       * "unknown" must not render as a blank that reads like a missing value.
       */
      header: t('partner.colFromWallet'),
      cell: (row) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.fromWalletNumber ?? '—'}
        </span>
      ),
    },
    {
      header: t('partner.colToWallet'),
      cell: (row) => (
        <span className="font-mono text-xs text-muted-foreground">{row.toWalletNumber ?? '—'}</span>
      ),
    },
    {
      header: t('partner.colCurrency'),
      cell: (row) => <span className="text-muted-foreground">{row.currency}</span>,
      align: 'right',
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <AsyncBoundary
        status={query.status}
        label={t('partner.transfersLoading')}
        endpoints={['GET /ib/wallet/transfers']}
        onRetry={() => query.refetch()}
        errorMessage={apiErrorMessage(query.error, t('partner.transfersFailed'))}
        error={query.error}
      >
        {rows.length === 0 ? (
          <EmptyPanel
            icon={Receipt}
            title={t('partner.transfersEmpty')}
            body={t('partner.transfersEmptyBody')}
          />
        ) : (
          <>
            <div className={TABLE_FRAME}>
              <DataTable
                caption={t('partner.tabTransfers')}
                columns={columns}
                rows={rows}
                rowKey={(row) => row.id}
                /* clientPagination, not `pagination`: the endpoint returns an
                   array rather than a page, so the table does the slicing —
                   same as the commission table on the tab beside it. */
                clientPagination={PAGING}
              />
            </div>
            {/*
              Kept from the panel this replaced: it explains why moving money
              does not reduce lifetime earnings, which is the question the
              numbers above raise and cannot answer themselves.
            */}
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t('partner.transfersNote')}
            </p>
          </>
        )}
      </AsyncBoundary>
    </div>
  );
}
