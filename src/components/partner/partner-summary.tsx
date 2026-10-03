'use client';

import { Info } from 'lucide-react';
import { HAIRLINE_GRID, Stat } from '@/components/partner/partner-ui';
import type { IbOverview } from '@/lib/api/partner';
import { moneyText } from '@/lib/bidi';
import { t } from '@/lib/i18n';

/**
 * The four figures a partner opens this page to read, as one statement row.
 *
 * ## Why they are above the tabs
 *
 * They were inside the first tab, so opening the commission table took them off
 * the screen — and the commission table is exactly where a partner needs the
 * totals in view, because the rows are what explain them. They are read
 * together, which is also why the API returns them in one response.
 *
 * ## `lifetime` is the SERVER's sum over the whole ledger
 *
 * Computed in the database over every commission, rebate and payout entry. It is
 * NOT the same figure as the commission tab's "released" total, which is summed
 * in the browser over the entries in that list — both are labelled for exactly
 * that reason.
 *
 * ## THE CURRENCY THIS IS STATED IN, and the gap it exposes
 *
 * `IbOverviewService` sums earnings in ONE currency (`EARNINGS_CURRENCY`, today
 * USD) and says why in its own comment: there is no FX source in this system, so
 * adding a USD commission to an LBP one would need a rate nobody here has.
 *
 * The consequence reaches this screen. A partner whose clients trade in a second
 * currency accrues commission in that currency — the accrual takes the currency
 * of the trade that produced it — and that money is REAL, sits in its own
 * commission wallet, and is absent from these totals.
 *
 * So when the partner holds commission in any currency other than the one the
 * totals are stated in, this says so, names the currencies, and points at the
 * balances panel where they are shown in full. Without that line the screen puts
 * "$0.00 lifetime" directly above a funded balance and explains neither — the
 * two-figures-disagree failure `/accounts/[id]` documents about its two
 * balances.
 *
 * The fix on the server side is a per-currency breakdown, NOT a converted total;
 * `EARNINGS_CURRENCY` says so at the point it would have to change.
 *
 * ## The `engineLive` NOTICE was removed on request, and this is what it cost
 *
 * A paragraph used to sit under these figures whenever no accrual had ever been
 * confirmed platform-wide: "no commission has been credited yet — earnings are
 * calculated when a client you introduced makes a deposit". It was removed
 * deliberately, on an explicit instruction, and the consequence is worth stating
 * once here rather than rediscovering: a structural zero and an earned-nothing
 * zero now look identical, and a partner who believes they are owed money has
 * nothing on the screen distinguishing the two.
 *
 * The flag is still READ — it is what decides whether the lifetime figure claims
 * to be credited as it is earned — so restoring the sentence is one JSX line if
 * that trade is ever revisited.
 */
export function PartnerSummary({ data }: { data: IbOverview }) {
  const { earnings, referredClients, subPartners, verifiedReferredCount, commissionWallets } = data;

  const activePartners = subPartners.filter((partner) => partner.active).length;

  /*
   * Currencies the partner holds commission in that these totals do not cover.
   *
   * Read from the WALLETS rather than from the commission list: a wallet exists
   * because a commission was confirmed into it, so this cannot fire on an
   * accrual that has not been paid — and it stays true even when the entry that
   * opened the wallet has scrolled out of the (capped) commission list.
   */
  const uncounted = [
    ...new Set(
      commissionWallets
        .map((wallet) => wallet.currency)
        .filter((currency) => currency !== earnings.currency),
    ),
  ];

  return (
    <div className="space-y-3">
      <div className={`${HAIRLINE_GRID} sm:grid-cols-2 xl:grid-cols-4`}>
        <Stat
          label={t('partner.earningsLifetime')}
          value={moneyText(earnings.lifetime, earnings.currency)}
          hint={earnings.engineLive ? t('partner.earningsLiveNote') : undefined}
          large
        />
        <Stat
          label={t('partner.earningsRecent')}
          value={moneyText(earnings.last30Days, earnings.currency)}
        />
        <Stat
          label={t('partner.clientsHeading')}
          value={String(referredClients.length)}
          hint={t('partner.clientsCount', {
            count: referredClients.length,
            verified: verifiedReferredCount,
          })}
        />
        <Stat
          label={t('partner.subPartnersHeading')}
          value={String(subPartners.length)}
          hint={
            subPartners.length > 0
              ? t('partner.networkActive', { count: activePartners })
              : undefined
          }
        />
      </div>

      {uncounted.length > 0 && (
        <Notice>
          {t('partner.earningsCurrencyScope', {
            currency: earnings.currency,
            others: uncounted.join(t('common.listSeparator')),
          })}
        </Notice>
      )}
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="status"
      className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/40 px-4 py-3 text-xs leading-relaxed text-muted-foreground"
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
