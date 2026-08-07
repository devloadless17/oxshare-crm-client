'use client';

import * as React from 'react';
import { Info, TrendingUp, Users, Network, Award } from 'lucide-react';
import { AsyncBoundary } from '@/components/async-boundary';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { partnerApi, type IbOverview } from '@/lib/api/partner';
import { formatMoney } from '@/lib/money';
import { t } from '@/lib/i18n';

/**
 * The approved partner's working screen: what they earn, who they introduced,
 * and who sits beneath them.
 *
 * ## What a partner area needs, and what this one can honestly show
 *
 * The standard IB dashboard has four things on it: earnings, the referral link,
 * the client list and the sub-partner tree. All four are backed by real data
 * now — `users.referred_by_ib_user_id` is written at registration,
 * `ib_accounts.parent_ib_user_id` holds the tree, `ib_levels` holds the rate,
 * and the commission engine (backend `modules/ib/commission*`) accrues on a
 * client deposit and credits the wallet hourly.
 *
 * EARNINGS are read from the LEDGER — real `commission`/`rebate`/`payout`
 * entries — and never derived from referral count × rate. The difference
 * matters: one is money that has moved, the other is a projection, and a
 * partner cannot spend a projection.
 *
 * ## `engineLive` is what stops a zero from lying
 *
 * The server reports whether any accrual has ever been CONFIRMED. While that is
 * false, this screen says so beside the totals — because "nothing has been
 * credited yet" and "you have earned nothing" are different sentences, and a
 * partner who is owed money reads the second as a dispute. Same rule as the
 * wallet's "a missing wallet is not a zero".
 *
 * It is deliberately not re-derived here from `lifetime === '0'`: that is
 * per-partner, so a brand-new partner on a fully working platform would be told
 * the calculation is not running.
 *
 * Deliberately NOT rendered: a commission chart, a "this month vs last month"
 * delta, a conversion rate, or a projected-earnings figure. Every one of those
 * would have to be invented.
 */
export function PartnerDashboard() {
  const overview = useResource<IbOverview>(['ib-overview'], (signal) =>
    partnerApi.overview(signal),
  );

  return (
    <AsyncBoundary
      status={overview.status}
      label={t('partner.overviewLoading')}
      endpoints={['GET /ib/overview']}
      onRetry={() => void overview.refetch()}
      errorMessage={apiErrorMessage(overview.error, t('partner.overviewLoadFailed'))}
      error={overview.error}
    >
      {overview.data ? <DashboardBody data={overview.data} /> : null}
    </AsyncBoundary>
  );
}

function DashboardBody({ data }: { data: IbOverview }) {
  const { earnings, level, referredClients, subPartners, verifiedReferredCount } = data;

  return (
    <div className="space-y-6">
      {/*
        The figure row. Four tiles, because these are the four numbers a partner
        opens this screen to read — and they are read together, which is why the
        API returns them in one response rather than four.
      */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={TrendingUp}
          label={t('partner.earningsLifetime')}
          value={formatMoney(earnings.lifetime, earnings.currency)}
          tone="primary"
        />
        <StatTile
          icon={TrendingUp}
          label={t('partner.earningsRecent')}
          value={formatMoney(earnings.last30Days, earnings.currency)}
        />
        <StatTile
          icon={Users}
          label={t('partner.clientsHeading')}
          value={String(referredClients.length)}
          hint={t('partner.clientsCount', {
            count: referredClients.length,
            verified: verifiedReferredCount,
          })}
        />
        <StatTile
          icon={Network}
          label={t('partner.subPartnersHeading')}
          value={String(subPartners.length)}
        />
      </div>

      {/*
        THE honesty notice, and the reason `engineLive` crosses the wire.

        Rendered directly beneath the totals it qualifies — not in a footer,
        where it would be read after the conclusion it is meant to prevent.
      */}
      {!earnings.engineLive && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-xl border border-info/30 bg-info/5 p-3 text-xs leading-relaxed text-muted-foreground"
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden="true" />
          <span>{t('partner.earningsNotLive')}</span>
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        {/* The level card — narrow, because it is three facts. */}
        <section className="rounded-2xl border border-border bg-card p-5 xl:col-span-1">
          <div className="flex items-center gap-2">
            <Award className="h-4 w-4 text-link" aria-hidden="true" />
            <h2 className="text-sm font-bold">{t('partner.levelHeading')}</h2>
          </div>

          {level ? (
            <div className="mt-4 space-y-3">
              <div>
                <p className="text-2xl font-bold tracking-tight">{level.name}</p>
                <p className="text-xs text-muted-foreground">
                  {t('partner.subPartnerLevel', { level: level.level })}
                </p>
              </div>
              <div className="border-t border-border pt-3">
                {/*
                  The rate's UNIT depends on the payout model — "70" means 70%
                  under revenue_share and $70 per lot under per_lot. Rendering
                  the number without reading the model is exactly the ambiguity
                  the DTO comment warns about.
                */}
                <p className="text-sm font-semibold">
                  {level.payoutModel === 'revenue_share'
                    ? t('partner.levelRateRevenue', { rate: trimRate(level.rateValue) })
                    : t('partner.levelRatePerLot', {
                        rate: formatMoney(level.rateValue, earnings.currency),
                      })}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {level.maxDirectPartners === null
                    ? t('partner.levelDirectUnlimited')
                    : t('partner.levelDirectLimit', { max: level.maxDirectPartners })}
                </p>
              </div>
            </div>
          ) : (
            // The level row can be missing if the ladder was edited underneath
            // this partner. Saying so beats an empty card.
            <p className="mt-4 text-xs text-muted-foreground">{t('partner.levelUnknown')}</p>
          )}
        </section>

        {/* The client list — wide, because it is the screen's real content. */}
        <section className="rounded-2xl border border-border bg-card xl:col-span-2">
          <div className="flex items-center justify-between gap-3 border-b border-border p-5">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-link" aria-hidden="true" />
              <h2 className="text-sm font-bold">{t('partner.clientsHeading')}</h2>
            </div>
            <span className="text-[11px] font-semibold text-muted-foreground">
              {t('partner.clientsCount', {
                count: referredClients.length,
                verified: verifiedReferredCount,
              })}
            </span>
          </div>

          {referredClients.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm font-semibold">{t('partner.clientsEmpty')}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t('partner.clientsEmptyBody')}</p>
            </div>
          ) : (
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-5 py-2.5 font-semibold">{t('partner.clientsColName')}</th>
                    <th className="px-5 py-2.5 font-semibold">{t('partner.clientsColStatus')}</th>
                    <th className="px-5 py-2.5 font-semibold">{t('partner.clientsColSince')}</th>
                  </tr>
                </thead>
                <tbody>
                  {referredClients.map((client) => (
                    <tr
                      key={client.userId}
                      className="border-b border-border last:border-0 transition-colors hover:bg-muted/30"
                    >
                      <td className="px-5 py-3 font-medium">{client.name}</td>
                      <td className="px-5 py-3">
                        {/*
                          Verified vs not is the distinction that matters to a
                          partner: an unverified registration cannot fund, so it
                          cannot generate anything to be paid on.
                        */}
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                            client.verified
                              ? 'border-success/20 bg-success/10 text-success'
                              : 'border-border bg-muted text-muted-foreground'
                          }`}
                        >
                          {client.verified
                            ? t('partner.clientVerified')
                            : t('partner.clientUnverified')}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {formatDate(client.since)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/*
        Sub-partners. DIRECT only — one hop, matching how the payout ladder
        actually resolves (resolution stops at a single parent, no closure
        table). Rendering a deep tree would show a structure the payout logic
        does not honour.
      */}
      <section className="rounded-2xl border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border p-5">
          <Network className="h-4 w-4 text-link" aria-hidden="true" />
          <h2 className="text-sm font-bold">{t('partner.subPartnersHeading')}</h2>
        </div>

        {subPartners.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm font-semibold">{t('partner.subPartnersEmpty')}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('partner.subPartnersEmptyBody')}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {subPartners.map((partner) => (
              <li
                key={partner.userId}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{partner.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {t('partner.subPartnerLevel', { level: partner.level })} ·{' '}
                    {formatDate(partner.since)}
                  </p>
                </div>
                {/* A suspended sub-partner keeps their tree and stops earning —
                    both halves matter, so the state is shown rather than the
                    row being hidden. */}
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                    partner.active
                      ? 'border-success/20 bg-success/10 text-success'
                      : 'border-warning/20 bg-warning/10 text-warning'
                  }`}
                >
                  {partner.active
                    ? t('partner.subPartnerActive')
                    : t('partner.subPartnerSuspended')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  hint?: string;
  tone?: 'primary';
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Icon
          className={`h-4 w-4 ${tone === 'primary' ? 'text-primary' : 'text-muted-foreground'}`}
          aria-hidden="true"
        />
        <span className="text-[11px] font-semibold text-muted-foreground">{label}</span>
      </div>
      {/* `tabular-nums` so a refresh does not shift the digits sideways. */}
      <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * `'70.0000'` → `'70'`, `'2.5000'` → `'2.5'`.
 *
 * A percentage rate is stored at 4dp so a per-lot amount fits the same column,
 * but "70.0000% revenue share" reads as false precision. The trailing zeros are
 * trimmed as TEXT rather than by parsing to a number — this value shares a
 * column with money, and `Number()` on that path is banned for the reason
 * `money.ts` records.
 */
function trimRate(rate: string): string {
  if (!rate.includes('.')) return rate;
  return rate.replace(/0+$/, '').replace(/\.$/, '');
}

/**
 * A date in the reader's own locale.
 *
 * Guarded, because the value arrives as a string from the API and "Invalid Date"
 * on a partner's own client list reads as a broken screen.
 */
function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}
