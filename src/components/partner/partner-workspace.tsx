'use client';

import { AsyncBoundary } from '@/components/async-boundary';
import { CommissionBalances } from '@/components/partner/commission-balances';
import { PartnerHeader } from '@/components/partner/partner-header';
import { PartnerSummary } from '@/components/partner/partner-summary';
import { PartnerTabs } from '@/components/partner/partner-tabs';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { partnerApi, type IbOverview, type IbStatus } from '@/lib/api/partner';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/**
 * An approved partner's screen, top to bottom.
 *
 * ## The reading order, which is the design
 *
 *   1. WHO THEY ARE, and the referral code and link — from `GET /ib/status`,
 *      which the page already holds, so this paints immediately.
 *   2. WHAT THEY HAVE — four figures on one statement row, then every commission
 *      balance they hold with the control that moves each one.
 *   3. THE EVIDENCE — five tabs, each answering one question at length.
 *
 * Identity, then money, then detail. The screen this replaced interleaved the
 * first two in a three-column row and then hid every figure inside the first
 * tab, so opening the commission table took the totals off the screen — and the
 * table is precisely where a partner needs them, because the rows are what
 * explain them.
 *
 * ## ONE read of `GET /ib/overview`, shared by everything below the header
 *
 * Seven panels need this response. Each calling `useResource` under the same key
 * would be served from one cached fetch, so the cost is not requests — it is
 * seven boundaries rendering seven spinners on load and seven retry cards for
 * one failure.
 *
 * So it is read ONCE here and passed down. The tabs that need something else —
 * the commission list, the open positions — still own their reads, and still
 * only fire when their tab is opened.
 *
 * The header is deliberately OUTSIDE that boundary: "am I still a partner, and
 * what is my link" is answered by the status call, and covering the answer with
 * a spinner while a second request lands is a worse screen than one that fills
 * in.
 */
export function ApprovedPanel({ account }: { account: NonNullable<IbStatus['account']> }) {
  const overview = useResource<IbOverview>(keys.partner.overview(), (signal) =>
    partnerApi.overview(signal),
  );

  /*
   * A DOCUMENT, not a fill screen — no `flex-1 min-h-0` on this root.
   *
   * `portal-layout` makes `<main>` the one scroll container, and its note
   * spells out the consequence of the alternative: a `flex-1 min-h-0` child
   * has `flex-basis: 0` and contributes ZERO to its parent's content height,
   * so the padded div stays exactly `<main>`'s height and everything below
   * the fold overflows it — bottom padding stranded, and any inner `fill`
   * region becoming a SECOND scrollbar inside the page's own.
   *
   * That is the right shape for /transactions, which is one table owning the
   * viewport. It is the wrong shape here: this screen is a header, a figure
   * row, a balances panel and a tab full of panels, stacked. It is taller than
   * the viewport by design, so the page scrolls and nothing inside it does.
   */
  return (
    <div className="flex flex-col gap-5">
      {/* The PROGRAMME name in the header, replacing the rung's (0102). It is
          what a partner is paid on, so it is the one word worth carrying above
          the fold. */}
      <PartnerHeader account={account} programmeName={overview.data?.programme?.name} />

      <AsyncBoundary
        status={overview.status}
        label={t('partner.overviewLoading')}
        endpoints={['GET /ib/overview']}
        onRetry={() => overview.refetch()}
        errorMessage={apiErrorMessage(overview.error, t('partner.overviewLoadFailed'))}
        error={overview.error}
      >
        {overview.data ? <PartnerBody data={overview.data} account={account} /> : null}
      </AsyncBoundary>
    </div>
  );
}

function PartnerBody({
  data,
  account,
}: {
  data: IbOverview;
  account: NonNullable<IbStatus['account']>;
}) {
  return (
    <div className="flex flex-col gap-5">
      <PartnerSummary data={data} />
      <CommissionBalances wallets={data.commissionWallets} />
      <PartnerTabs data={data} account={account} />
    </div>
  );
}
