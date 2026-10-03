'use client';

import * as React from 'react';
import { Network, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  CELL,
  EmptyPanel,
  Pill,
  SectionHeader,
  Surface,
  formatDate,
} from '@/components/partner/partner-ui';
import type { IbOverview, IbStatus } from '@/lib/api/partner';
import { localized, t } from '@/lib/i18n';

/**
 * The summary tab: the terms a partner sells on, the shape of their book, and
 * how the money reaches them.
 *
 * ## What moved OUT, and why
 *
 * The figure row went up above the tabs — it is read while reading everything
 * else. Both lists became tabs of their own — a capped scroll box is a worse
 * view of two hundred clients than of two, and it was the successful partners
 * who got the worst one.
 *
 * What is left is genuinely a summary: nothing here grows with the size of the
 * business.
 *
 * ## Nothing here is derived
 *
 * Every figure is a count or a string the API sent. Deliberately NOT rendered: a
 * projected-earnings figure, a conversion rate, a "this month vs last month"
 * delta, or a commission chart. The first three would have to be invented; the
 * fourth would be drawn over `GET /ib/commissions`, which returns the most
 * recent entries rather than all of them — so it would under-draw exactly the
 * partners with the most history, and silently.
 */
export function PartnerOverview({
  data,
  account,
  onNavigate,
}: {
  data: IbOverview;
  /** From `GET /ib/status` — the overview response carries no agency. */
  account: NonNullable<IbStatus['account']>;
  /** Switches tab, because these panels hand the reader on to the full list. */
  onNavigate: (tab: string) => void;
}) {
  const { referredClients, subPartners, verifiedReferredCount } = data;
  const activePartners = subPartners.filter((partner) => partner.active).length;
  const unverified = referredClients.length - verifiedReferredCount;

  return (
    <div className="space-y-5">
      {/*
        ── THE RATE CARD IS NOT ON THIS SCREEN (0112) ────────────────────────

        Two cells stood here: the partner's own rates — a named programme with
        its per-depth ladder — and the REACH those rates travelled. A rung with
        its own `rateValue` had stood there before them (0102), deciding nothing
        while reading exactly like what a partner earns.

        Both are gone, and not because they were wrong. A partner's rate card is
        a commercial arrangement between them and the broker, and the broker
        publishes it; a portal screen restating it is a second copy that
        disagrees the day the desk renegotiates — with the partner reading the
        stale one and no way to tell.

        What a partner cannot look up elsewhere is what they have EARNED, who
        they introduced, and who sits beneath them. That is what this page is
        now, plus the one thing the broker does decide per agency: what their
        clients may TRADE.
      */}
      <Surface>
        <SectionHeader title={t('partner.termsHeading')} />
        <div className="bg-border">
          <div className={`${CELL} p-5`}>
            <p className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
              {t('partner.agencyLabel')}
            </p>
            <p className="mt-2 text-xl font-semibold tracking-tight">
              {account.agencyName
                ? localized(account.agencyName, account.agencyNameAr)
                : t('partner.programmeNone')}
            </p>
            {account.agencyName ? (
              <>
                <p className="mt-4 text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                  {t('partner.programmeProductsLabel')}
                </p>
                {/*
                  An EMPTY product list means UNRESTRICTED, not "no products" —
                  `IbAccountDto` says so. Rendering it as an empty row would tell
                  a partner their clients can open nothing, which is the opposite
                  of what it means.
                */}
                {account.products.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {account.products.map((product, i) => (
                      <Pill key={product} tone="neutral">
                        {localized(product, account.productsAr?.[i])}
                      </Pill>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {t('partner.programmeUnrestricted')}
                  </p>
                )}
              </>
            ) : (
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {t('partner.programmeNoneBody')}
              </p>
            )}
          </div>
        </div>
      </Surface>

      <div className="grid gap-5 xl:grid-cols-2">
        <Surface className="min-h-0">
          <SectionHeader
            title={t('partner.clientsHeading')}
            meta={String(referredClients.length)}
            action={
              referredClients.length > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onNavigate('clients')}
                >
                  {t('partner.viewAll')}
                </Button>
              ) : undefined
            }
          />
          {referredClients.length === 0 ? (
            <EmptyPanel
              icon={Users}
              title={t('partner.clientsEmpty')}
              body={t('partner.clientsEmptyBody')}
            />
          ) : (
            <>
              {/*
                Verified against not, as two counts on one rule.

                An unverified registration cannot fund an account, so it cannot
                generate anything to be paid on — the split IS the health of the
                book, and it is the one thing a partner can act on by chasing the
                people in it.
              */}
              <div className="grid gap-px bg-border sm:grid-cols-2">
                <Count label={t('partner.clientVerified')} value={verifiedReferredCount} />
                <Count label={t('partner.clientUnverified')} value={unverified} />
              </div>
              <p className="border-b border-border px-5 py-3 text-xs leading-relaxed text-muted-foreground">
                {t('partner.clientsVerifiedNote')}
              </p>
              <RecentList
                rows={referredClients.slice(0, PREVIEW).map((client) => ({
                  key: String(client.userId),
                  name: client.name,
                  meta: formatDate(client.since),
                  pill: (
                    <Pill tone={client.verified ? 'success' : 'neutral'}>
                      {client.verified
                        ? t('partner.clientVerified')
                        : t('partner.clientUnverified')}
                    </Pill>
                  ),
                }))}
              />
            </>
          )}
        </Surface>

        {/*
          Sub-partners. DIRECT only — one hop, matching how the payout ladder
          resolves (it stops at a single parent; there is no closure table).
          Drawing a deeper tree would show a structure the money does not follow.
        */}
        <Surface className="min-h-0">
          <SectionHeader
            title={t('partner.subPartnersHeading')}
            meta={String(subPartners.length)}
            action={
              subPartners.length > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onNavigate('network')}
                >
                  {t('partner.viewAll')}
                </Button>
              ) : undefined
            }
          />
          {subPartners.length === 0 ? (
            <EmptyPanel
              icon={Network}
              title={t('partner.subPartnersEmpty')}
              body={t('partner.subPartnersEmptyBody')}
            />
          ) : (
            <>
              <div className="grid gap-px bg-border sm:grid-cols-2">
                <Count label={t('partner.subPartnerActive')} value={activePartners} />
                <Count
                  label={t('partner.subPartnerSuspended')}
                  value={subPartners.length - activePartners}
                />
              </div>
              <p className="border-b border-border px-5 py-3 text-xs leading-relaxed text-muted-foreground">
                {t('partner.subPartnersNote')}
              </p>
              <RecentList
                rows={subPartners.slice(0, PREVIEW).map((partner) => ({
                  key: String(partner.userId),
                  name: partner.name,
                  meta: formatDate(partner.since),
                  pill: (
                    <Pill tone={partner.active ? 'success' : 'warning'}>
                      {partner.active
                        ? t('partner.subPartnerActive')
                        : t('partner.subPartnerSuspended')}
                    </Pill>
                  ),
                }))}
              />
            </>
          )}
        </Surface>
      </div>

      {/*
        The four steps, because the gap between "earned" and "spendable" is what
        most partner support messages are about: an accrual is PENDING until the
        confirm job credits it, and it then sits in the commission wallet until
        the partner moves it across. Both waits are invisible unless something
        says they exist.
      */}
      <Surface>
        <SectionHeader title={t('partner.howHeading')} />
        <ol className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
          <Step index={1} title={t('partner.howStepOne')} body={t('partner.howStepOneBody')} />
          <Step index={2} title={t('partner.howStepTwo')} body={t('partner.howStepTwoBody')} />
          <Step index={3} title={t('partner.howStepThree')} body={t('partner.howStepThreeBody')} />
          <Step index={4} title={t('partner.howStepFour')} body={t('partner.howStepFourBody')} />
        </ol>
      </Surface>
    </div>
  );
}

/**
 * One rate on the terms panel.
 *
 * `lead` marks the one that ranks — what this partner earns on their own
 * business, or the rebate on a rebate-only programme. It is a size difference
 * rather than a colour one: a coloured number on a money screen should mean a
 * state, and this one does not.
 */
/** How many rows a preview shows before handing off to its own tab. */
const PREVIEW = 5;

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className={`${CELL} px-5 py-4`}>
      <p className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
    </div>
  );
}

function RecentList({
  rows,
}: {
  rows: { key: string; name: string; meta: string; pill: React.ReactNode }[];
}) {
  return (
    <ul className="divide-y divide-border">
      {rows.map((row) => (
        <li key={row.key} className="flex items-center justify-between gap-3 px-5 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{row.name}</p>
            <p className="text-xs text-muted-foreground">{row.meta}</p>
          </div>
          {row.pill}
        </li>
      ))}
    </ul>
  );
}

function Step({ index, title, body }: { index: number; title: string; body: string }) {
  return (
    <li className={`${CELL} p-5`}>
      {/* The number is the reading ORDER, which four cells side by side do not
          otherwise carry — on a wide screen they are a row, not a sequence. */}
      <span className="text-[11px] font-medium text-muted-foreground tabular-nums">{index}</span>
      <p className="mt-1 text-sm font-semibold">{title}</p>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{body}</p>
    </li>
  );
}
