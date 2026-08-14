'use client';

import { AsyncBoundary } from '@/components/async-boundary';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { tradingApi, type AccountStats } from '@/lib/api/trading';
import { formatDecimal, formatMoney } from '@/lib/money';
import { moneySign, winRate } from '@/lib/account-stats';
import { t } from '@/lib/i18n';

/**
 * What this account has actually done — closed trades only.
 *
 * ## Every figure here is REALISED, and the panel says so once
 *
 * Floating P/L belongs to the live panel above, because it belongs to this
 * instant rather than to the history. Mixing an unrealised figure into a
 * statistics grid would produce a "total" that changes on every tick while
 * sitting beside numbers that only change when a trade closes.
 *
 * ## There is no combined "net after costs"
 *
 * Realised P/L, commission and swap are three lines and are deliberately not
 * summed into one. MT5's `profit` on a deal may or may not already carry the
 * costs depending on the broker's configuration, so a combined total is a figure
 * that is right on some deployments and double-counts on others — and it would
 * look equally plausible either way. Three labelled lines a client can add up
 * themselves beats one number that might be wrong.
 */
export function AccountStatsPanel({
  accountId,
  currency,
}: {
  accountId: string;
  currency: string;
}) {
  const stats = useResource(['trading-account-stats', accountId], (signal) =>
    tradingApi.getAccountStats(accountId, signal),
  );

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{t('accounts.statsTitle')}</h2>
        <p className="text-xs text-muted-foreground">{t('accounts.statsNote')}</p>
      </header>

      <div className="mt-4">
        <AsyncBoundary
          status={stats.status}
          label={t('accounts.detailLoading')}
          endpoints={['GET /trading/accounts/:id/stats']}
          onRetry={() => void stats.refetch()}
          errorMessage={apiErrorMessage(stats.error, t('accounts.detailLoadFailed'))}
          error={stats.error}
        >
          {stats.data && <Figures stats={stats.data} currency={currency} />}
        </AsyncBoundary>
      </div>
    </section>
  );
}

function Figures({ stats, currency }: { stats: AccountStats; currency: string }) {
  /*
   * `trades === 0` is the empty state, NOT `netProfit === '0'`.
   *
   * An account can close trades that net to exactly zero, and telling that
   * client "no closed trades yet" contradicts a history panel directly below
   * listing them. The count is the fact; the total is a consequence of it.
   */
  if (stats.trades === 0) {
    return (
      <div className="flex min-h-[8rem] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border p-6 text-center">
        <p className="text-sm font-semibold">{t('accounts.statsEmpty')}</p>
        <p className="max-w-md text-xs text-muted-foreground">{t('accounts.statsEmptyBody')}</p>
        {/*
          The dates still render when there are no trades. `firstDealAt` spans
          EVERY deal, so a funded-but-untraded account has a real "active since"
          — and a blank there would read as an account nothing has ever happened
          on, which is a different and wrong statement.
        */}
        {stats.firstDealAt && (
          <p className="mt-1 text-xs text-muted-foreground">
            {t('accounts.statsFirstDeal')}: {formatDateTime(stats.firstDealAt)}
          </p>
        )}
      </div>
    );
  }

  const rate = winRate(stats);

  return (
    <div className="space-y-4">
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t('accounts.statsTrades')} value={String(stats.trades)} />
        <Stat
          label={t('accounts.statsWinRate')}
          /*
           * Null only when there are no trades, which the branch above already
           * caught — the em dash is the belt to that braces. Rounded for
           * display: a win rate is a ratio of counts, so this is not a money
           * path and `toFixed` on a number is correct here in a way it would
           * never be on a balance.
           */
          value={
            rate === null
              ? t('accounts.unknownValue')
              : t('accounts.statsWinRateValue', { rate: rate.toFixed(1) })
          }
          hint={t('accounts.statsWinLoss', { wins: stats.wins, losses: stats.losses })}
        />
        <Stat
          label={t('accounts.statsVolume')}
          value={t('accounts.statsVolumeUnit', { lots: formatDecimal(stats.volume) })}
        />
        <SignedStat
          label={t('accounts.statsNetProfit')}
          amount={stats.netProfit}
          currency={currency}
        />
      </dl>

      <dl className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-4">
        <SignedStat
          label={t('accounts.statsGrossProfit')}
          amount={stats.grossProfit}
          currency={currency}
          small
        />
        <SignedStat
          label={t('accounts.statsGrossLoss')}
          amount={stats.grossLoss}
          currency={currency}
          small
        />
        <SignedStat
          label={t('accounts.statsCommission')}
          amount={stats.commission}
          currency={currency}
          small
        />
        <SignedStat label={t('accounts.statsSwap')} amount={stats.swap} currency={currency} small />

        {/*
          Null with no trades, and null is rendered as an em dash rather than as
          zero. `'0'` beside a currency symbol claims there WAS a best trade and
          it broke even. Unreachable in this branch, and kept honest anyway
          because the alternative costs nothing and the wrong version reads as
          correct.
        */}
        <SignedStat
          label={t('accounts.statsBest')}
          amount={stats.bestTrade}
          currency={currency}
          small
        />
        <SignedStat
          label={t('accounts.statsWorst')}
          amount={stats.worstTrade}
          currency={currency}
          small
        />
        <Stat
          label={t('accounts.statsFirstDeal')}
          value={stats.firstDealAt ? formatDateTime(stats.firstDealAt) : t('accounts.unknownValue')}
          small
        />
        <Stat
          label={t('accounts.statsLastDeal')}
          value={stats.lastDealAt ? formatDateTime(stats.lastDealAt) : t('accounts.unknownValue')}
          small
        />
      </dl>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  small = false,
}: {
  label: string;
  value: string;
  hint?: string;
  small?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className={`mt-1 font-bold tabular-nums ${small ? 'text-sm' : 'text-xl'}`}>{value}</dd>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * An amount coloured by its sign, or an em dash when the API sent null.
 *
 * The sign is decided by `moneySign` on the raw decimal string, never by
 * inspecting the formatted output — see the note on the live panel's twin of
 * this component for why reading a minus back off rendered text is a bug that
 * ships looking correct.
 */
function SignedStat({
  label,
  amount,
  currency,
  small = false,
}: {
  label: string;
  amount: string | null;
  currency: string;
  small?: boolean;
}) {
  const sign = amount === null ? 'zero' : moneySign(amount);
  const formatted = amount === null ? t('accounts.unknownValue') : formatMoney(amount, currency);

  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
        {label}
      </dt>
      <dd
        className={`mt-1 font-bold tabular-nums ${small ? 'text-sm' : 'text-xl'} ${
          sign === 'positive' ? 'text-success' : sign === 'negative' ? 'text-destructive' : ''
        }`}
      >
        {sign === 'positive' ? `+${formatted}` : formatted}
      </dd>
    </div>
  );
}

/**
 * A timestamp in the reader's own locale.
 *
 * Guarded because the value arrives as a string: an unparseable one would
 * otherwise render as "Invalid Date" on a screen a client reads to check their
 * own trading — the same guard the accounts list applies to `createdAt`.
 */
function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? t('accounts.unknownValue') : date.toLocaleString();
}
