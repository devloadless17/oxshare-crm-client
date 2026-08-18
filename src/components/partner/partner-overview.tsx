'use client';

import * as React from 'react';
import { Info, TrendingUp, Users, Network, Award } from 'lucide-react';
import { AsyncBoundary } from '@/components/async-boundary';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { partnerApi, type IbOverview } from '@/lib/api/partner';
import { formatDecimal, formatMoney } from '@/lib/money';
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
 * ## The commission BALANCE is not here - it is the card at the top of /partner
 *
 * `commissionWallets` rides on this same `GET /ib/overview` response, but it is
 * rendered above the tabs by the panel on /partner rather than in this tab.
 * That is a LAYOUT decision and it costs the figures nothing: both read the one
 * cached response under the `ib-overview` query key, so the card and the totals
 * below can never come from two different instants.
 *
 * The BALANCE and the lifetime TOTAL are different figures and both are here:
 * the total is what has ever been earned and does not move when money is
 * transferred out; the balance is what is left to move. A screen showing only
 * one of them makes the other unanswerable.
 *
 * Deliberately NOT rendered: a commission chart, a "this month vs last month"
 * delta, a conversion rate, or a projected-earnings figure. Every one of those
 * would have to be invented.
 */
export function PartnerOverview() {
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
    <div className="space-y-5">
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

      {/* `items-stretch` is what actually equalises the two cards — without it
          each is only as tall as its own content and the row looks ragged. */}
      <div className="grid items-stretch gap-5 xl:grid-cols-3">
        {/* The level card — narrow, because it is three facts. */}
        <section className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card xl:col-span-1">
          <CardHeader icon={Award} title={t('partner.levelHeading')} />

          {level ? (
            <div className="flex-1 space-y-3 p-5">
              <div>
                <p className="text-2xl font-bold tracking-tight">{level.name}</p>
                <p className="text-xs text-muted-foreground">
                  {t('partner.subPartnerLevel', { level: level.level })}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-muted/30 p-3">
                {/*
                  ALWAYS a percentage now. This branched on `payoutModel`,
                  because "70" meant 70% under revenue_share and $70 per lot
                  under per_lot — the backend dropped that column (migration
                  0055), so the rate has one unit and there is no model to read
                  before rendering it.

                  `maxDirectPartners` went with it, and the recruiting-limit line
                  beneath went with that: it said "Unlimited direct partners" on
                  every partner who ever saw it, because the cap was never set.
                */}
                <p className="text-sm font-semibold">
                  {t('partner.levelRateRevenue', { rate: formatDecimal(level.rateValue) })}
                </p>
              </div>
            </div>
          ) : (
            // The level row can be missing if the ladder was edited underneath
            // this partner. Saying so beats an empty card.
            <p className="flex-1 p-5 text-xs text-muted-foreground">{t('partner.levelUnknown')}</p>
          )}
        </section>

        {/* The client list — wide, because it is the screen's real content. */}
        <section className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card xl:col-span-2">
          <CardHeader
            icon={Users}
            title={t('partner.clientsHeading')}
            meta={t('partner.clientsCount', {
              count: referredClients.length,
              verified: verifiedReferredCount,
            })}
          />

          {referredClients.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm font-semibold">{t('partner.clientsEmpty')}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t('partner.clientsEmptyBody')}</p>
            </div>
          ) : (
            /* The same ceiling as the sub-partner list below, so a long client
               table and a short one produce the same card. */
            <div className="max-h-[22rem] flex-1 overflow-y-auto">
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
      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <CardHeader
          icon={Network}
          title={t('partner.subPartnersHeading')}
          meta={String(subPartners.length)}
        />

        {subPartners.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm font-semibold">{t('partner.subPartnersEmpty')}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('partner.subPartnersEmptyBody')}
            </p>
          </div>
        ) : (
          /*
            CAPPED and scrollable, matching the client table above it.

            Both lists are unbounded — a partner with sixty sub-partners would
            otherwise push every card below them off the screen, and the
            headline figures are what the page is opened for. A fixed ceiling
            keeps the card a predictable size whatever the tree looks like.
          */
          <ul className="max-h-[22rem] divide-y divide-border overflow-y-auto">
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

/**
 * One figure, with a deliberate hierarchy between the four.
 *
 * ## The primary tile is not merely a different colour
 *
 * Lifetime earnings is what a partner opens this page to see; the other three
 * are context for it. Four identically-weighted tiles make the reader do that
 * ranking themselves on every visit. The primary one gets the accent ring, the
 * tinted chip and a larger figure, so the eye lands on it first and the rest
 * read as support.
 *
 * ## The icon sits in a CHIP rather than loose beside the label
 *
 * A bare 16px glyph next to 11px text is visual noise at that size — it reads as
 * a bullet. Inside a tinted rounded square it becomes a deliberate mark, and the
 * four tiles line up on a consistent left edge whatever the icon's shape.
 *
 * ## The primary tile carries a GLOW, the others a hover border
 *
 * The glow is one soft radial behind the figure, clipped by the tile. It is what
 * makes the row read as designed rather than as four divs — but only on the tile
 * that ranks: four glows is a gradient soup, and the ranking it exists to
 * express would be gone.
 */
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
  const primary = tone === 'primary';

  return (
    <div
      className={`relative flex flex-col justify-between overflow-hidden rounded-2xl border p-4 transition-colors ${
        primary
          ? 'border-primary/30 bg-primary/[0.05]'
          : 'border-border bg-card hover:border-primary/25'
      }`}
    >
      {primary && (
        /* Decorative, and clipped by the tile's own `overflow-hidden`. */
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-16 -end-10 h-40 w-40 rounded-full bg-primary/15 blur-3xl"
        />
      )}

      <div className="relative flex items-center gap-2.5">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
            primary ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
          }`}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          {label}
        </span>
      </div>

      {/* `tabular-nums` so a refresh does not shift the digits sideways. */}
      <p
        className={`relative mt-3 font-bold tracking-tight tabular-nums ${
          primary ? 'text-3xl text-primary' : 'text-2xl'
        }`}
      >
        {value}
      </p>
      {/*
        The hint keeps its line even when empty, so the four tiles stay the same
        height and the row does not step up and down as data arrives.
      */}
      <p className="relative mt-0.5 min-h-[1rem] text-[11px] text-muted-foreground">{hint ?? ''}</p>
    </div>
  );
}

/**
 * The header every card on this screen shares.
 *
 * Built once because the three sections had drifted: different icon colours,
 * different weights, the count on one and not the others. A dashboard reads as
 * professional when its panels are visibly the same KIND of object — that is
 * mostly consistency, not decoration.
 */
function CardHeader({
  icon: Icon,
  title,
  meta,
}: {
  icon: React.ElementType;
  title: string;
  meta?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-link">
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <h2 className="text-sm font-bold tracking-tight">{title}</h2>
      </div>
      {meta && (
        <span className="shrink-0 text-[11px] font-semibold text-muted-foreground tabular-nums">
          {meta}
        </span>
      )}
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
