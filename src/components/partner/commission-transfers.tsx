'use client';

import Link from 'next/link';
import { Receipt } from 'lucide-react';
import { AsyncBoundary } from '@/components/async-boundary';
import { Button } from '@/components/ui/button';
import { EmptyPanel, SectionHeader, Surface, formatDate } from '@/components/partner/partner-ui';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { partnerApi, type IbWalletTransfer } from '@/lib/api/partner';
import { formatMoney } from '@/lib/money';
import { t } from '@/lib/i18n';

/**
 * The commission a partner has already moved into their main wallet.
 *
 * ## Why it sits beside the commission list
 *
 * It answers the question the balances panel raises and cannot answer: "my
 * balance is lower than what I have earned — where did the rest go". Lifetime
 * earnings deliberately do NOT move when a partner transfers money out (both
 * legs are written to the ledger as `transfer`, never `commission`, so moving
 * earned money cannot read as a clawback), which means the difference between
 * the two figures is exactly this list.
 *
 * ## The balances that came back with each transfer are NOT shown
 *
 * `commissionBalance` and `mainBalance` are optional on the type for a reason
 * the DTO states: they are the balances as they stood at that moment, and the
 * history endpoint cannot honestly fill them. Restating today's figures beside a
 * three-week-old amount invites the reader to treat one row as current — the
 * two-unlabelled-balances failure again.
 *
 * ## A SHORT list, with the full record one link away
 *
 * `GET /ib/wallet/transfers` returns the last few, newest first. The complete
 * history is /transactions, where these rows sit alongside every other movement
 * — a partner's own money should not be split across two histories that have to
 * be reconciled against each other.
 */
export function CommissionTransfers() {
  const query = useResource<IbWalletTransfer[]>(['ib-wallet-transfers'], (signal) =>
    partnerApi.walletTransfers(signal),
  );

  const transfers = query.data ?? [];

  return (
    <Surface>
      <SectionHeader
        title={t('partner.transfersHeading')}
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/transactions">{t('partner.transfersAll')}</Link>
          </Button>
        }
      />

      <AsyncBoundary
        status={query.status}
        label={t('partner.transfersLoading')}
        endpoints={['GET /ib/wallet/transfers']}
        onRetry={() => query.refetch()}
        errorMessage={apiErrorMessage(query.error, t('partner.transfersFailed'))}
        error={query.error}
      >
        {transfers.length === 0 ? (
          <EmptyPanel
            icon={Receipt}
            title={t('partner.transfersEmpty')}
            body={t('partner.transfersEmptyBody')}
          />
        ) : (
          <>
            <ul className="flex-1 divide-y divide-border">
              {transfers.map((transfer) => (
                <li key={transfer.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    {/* The AMOUNT leads: it is what the reader checks against
                        their own memory of the move. */}
                    <p className="truncate text-sm font-semibold tabular-nums">
                      {formatMoney(transfer.amount, transfer.currency)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(transfer.createdAt)}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-medium text-muted-foreground">
                    {transfer.currency}
                  </span>
                </li>
              ))}
            </ul>
            <p className="border-t border-border px-5 py-3 text-xs leading-relaxed text-muted-foreground">
              {t('partner.transfersNote')}
            </p>
          </>
        )}
      </AsyncBoundary>
    </Surface>
  );
}
