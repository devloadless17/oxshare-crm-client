'use client';

import * as React from 'react';
import { Award, Building2, Check, Copy, Handshake } from 'lucide-react';
import { CommissionWallet } from '@/components/partner/commission-wallet';
import { PartnerDashboard } from '@/components/partner/partner-dashboard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useHydrated } from '@/hooks/use-hydrated';
import { useResource } from '@/hooks/use-resource';
import { partnerApi, type IbOverview, type IbStatus } from '@/lib/api/partner';
import { useUser } from '@/context/UserContext';
import { t } from '@/lib/i18n';

/**
 * A date in the reader's own locale.
 *
 * Guarded, because the value arrives as a string from the API and "Invalid Date"
 * on a partner's own approval line reads as a broken screen. Duplicated from
 * page.tsx rather than shared: it is four lines, and a `lib/` module for it
 * would be a shared dependency created to avoid repeating a guard clause.
 */
function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}

/**
 * The approved partner's screen: their commission CARD beside who they are.
 *
 * ## The two objects, and why they sit side by side
 *
 * The card is the only thing on this page a partner can ACT on. The panel beside
 * it is the identity that explains the card — the rung they stand on, the
 * programme they sell, and the referral code that produces the balance in the
 * first place. Stacked, the card pushed the referral link below the fold on a
 * laptop, and that link is what a partner comes back to copy.
 *
 * The card takes ONE column of three. It is a fixed-ratio object
 * (`aspect-[1.586]`, the real ID-1 card ratio), so a wider column makes it
 * taller rather than more useful — past about `max-w-md` it stops reading as a
 * card and starts reading as a poster. The panel takes the remaining two,
 * because its content is text that genuinely benefits from width.
 *
 * `items-start`, so the shorter column does not stretch to match the taller:
 * these are two different objects, not two halves of one row.
 *
 * ## Where `commissionWallets` and the level NAME come from
 *
 * `GET /ib/overview`, read here under the SAME `ib-overview` query key that
 * `PartnerOverview` uses inside the tabs. React Query serves both from one
 * cached response, so this is not a second request and — more importantly — the
 * balance on the card and the lifetime-earnings total in the tab below can never
 * be figures from two different instants.
 *
 * `GET /ib/status` carries the level NUMBER; only the overview carries its NAME.
 * The panel shows "Master Partner" and keeps the number as a subtitle, because
 * a bare "1" is a fact about the ladder rather than about the partner. It falls
 * back to the number alone while the overview is still loading or has failed —
 * the identity must render either way.
 */
export function ApprovedPanel({ account }: { account: NonNullable<IbStatus['account']> }) {
  const hydrated = useHydrated();
  const referralLink = hydrated
    ? `${window.location.origin}/auth/register?ref=${account.referralCode}`
    : '';

  const overview = useResource<IbOverview>(['ib-overview'], (signal) =>
    partnerApi.overview(signal),
  );
  const { user } = useUser();

  /*
   * The name embossed on the card foot.
   *
   * Undefined rather than a placeholder when the profile has no name: this app
   * once rendered the literal "Client User" for a null user on the
   * customer-facing portal, which is fabricated identity in the same family as a
   * fabricated balance. The card omits the line instead.
   */
  const holder = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() || undefined;
  const levelName = overview.data?.level?.name;

  return (
    <div className="space-y-6">
      <div className="grid items-start gap-5 lg:grid-cols-3">
        {/*
          The card, top left. It renders from whatever the overview read
          produced: an empty array is the "never credited" placeholder, and a
          FAILED read renders nothing at all rather than an empty card — an error
          is not the same as having no commission, and the tabs below surface the
          failure with a retry through their own boundary.
        */}
        <CommissionWallet wallets={overview.data?.commissionWallets ?? []} holder={holder} />

        {/*
          The identity panel.

          `relative` + `overflow-hidden` for the glow below it, which is
          positioned past the panel's own edge — without the clip it would paint
          over the page.
        */}
        <section className="relative overflow-hidden rounded-2xl border border-border bg-card lg:col-span-2">
          {/*
            One soft amber glow, top-end corner. Decorative, so `aria-hidden` and
            `pointer-events-none` — it must never intercept a click aimed at the
            copy button beneath it.

            A single light source rather than a gradient across the whole panel:
            a full wash competes with the wallet card beside it, and two
            gradient-filled objects side by side read as two unrelated brands.
          */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 -end-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl"
          />

          <div className="relative p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                  <Handshake className="h-6 w-6" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-xl font-bold tracking-tight">
                    {t('partner.approvedHeading')}
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t('partner.approvedSince', { date: formatDate(account.approvedAt) })}
                  </p>
                </div>
              </div>

              {/*
                The status is a PILL rather than a sentence, and it is always
                rendered — including when everything is fine. A badge that only
                appears when something is wrong is one a reader cannot trust the
                absence of.
              */}
              <span
                className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                  account.active
                    ? 'border-success/25 bg-success/10 text-success'
                    : 'border-warning/25 bg-warning/10 text-warning'
                }`}
              >
                {account.active ? t('partner.subPartnerActive') : t('partner.subPartnerSuspended')}
              </span>
            </div>

            {!account.active && (
              <p
                role="status"
                className="mt-4 rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs leading-relaxed text-warning-foreground"
              >
                {t('partner.suspendedNotice')}
              </p>
            )}

            {/*
              Level and programme as CHIPS on one row.

              They were a `<dl>` of large figures and a bordered box, which gave
              a rung number the same visual weight as the referral code — and the
              code is the thing a partner actually uses. These are attributes of
              the partner; the code is a tool. Chips say "attribute" and cost a
              third of the height the previous treatment did.
            */}
            <div className="mt-5 flex flex-wrap gap-2">
              <Attribute
                icon={Award}
                label={t('partner.levelLabel')}
                value={levelName ?? String(account.level)}
                meta={
                  levelName ? t('partner.subPartnerLevel', { level: account.level }) : undefined
                }
                accent
              />
              {account.agencyName && (
                <Attribute
                  icon={Building2}
                  label={t('partner.agencyLabel')}
                  value={account.agencyName}
                  meta={
                    account.products.length > 0
                      ? t('partner.agencyProducts', { products: account.products.join(', ') })
                      : undefined
                  }
                />
              )}
            </div>

            {/*
              The referral CODE, given the weight the level used to take.

              It is the one string a partner reads aloud, types into a chat, or
              checks against somebody's registration — so it is monospaced,
              letter-spaced, and copyable in one press. The link below it is the
              same thing in a form you can paste; both are here because partners
              use both, and deriving one from the other by hand is where a typo
              costs an attribution.
            */}
            <div className="mt-5 rounded-xl border border-border bg-muted/30 p-4">
              <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                {t('partner.referralCodeLabel')}
              </p>
              <div className="mt-1.5 flex items-center justify-between gap-3">
                <span className="truncate font-mono text-2xl font-bold tracking-[0.2em]">
                  {account.referralCode}
                </span>
                <CopyButton value={account.referralCode} label={t('partner.referralCodeLabel')} />
              </div>
            </div>

            <div className="mt-4 space-y-1.5">
              <Label htmlFor="referral-link">{t('partner.referralLinkLabel')}</Label>
              <CopyableLink id="referral-link" value={referralLink} />
            </div>
          </div>
        </section>
      </div>
      <PartnerDashboard />
    </div>
  );
}

/**
 * One fact about the partner — a rung, a programme — as a chip.
 *
 * The LABEL is small and muted, the VALUE carries the weight, and `meta` is the
 * detail that only matters once you have read the value. Three sizes in one
 * object is what lets a row of these be scanned rather than read.
 *
 * `accent` marks the one that ranks: a partner's level decides what they are
 * paid, and everything else on the row is context for it.
 */
function Attribute({
  icon: Icon,
  label,
  value,
  meta,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  meta?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 items-center gap-3 rounded-xl border px-3.5 py-2.5 ${
        accent ? 'border-primary/25 bg-primary/[0.06]' : 'border-border bg-muted/30'
      }`}
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
          accent ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
        }`}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
        <p className="truncate text-sm font-bold">{value}</p>
        {meta && <p className="truncate text-[11px] text-muted-foreground">{meta}</p>}
      </div>
    </div>
  );
}

/**
 * Copy one short value, with the outcome ANNOUNCED rather than only shown.
 *
 * Extracted from `CopyableLink` because the referral code needs the same
 * behaviour without the input beside it, and because the failure path is the
 * part worth having once: `navigator.clipboard` is unavailable over plain HTTP
 * and can be denied by permission, and a button that appears to do nothing is
 * the one control a user is certain they pressed correctly.
 */
function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setFailed(false);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setFailed(true);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void copy()}
        // Icon-plus-text, but the accessible name still states WHAT is being
        // copied — "Copy" alone is ambiguous on a panel with two copyable values.
        aria-label={`${t('partner.copy')} ${label}`}
      >
        {copied ? (
          <Check className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Copy className="h-4 w-4" aria-hidden="true" />
        )}
        <span className="sr-only sm:not-sr-only">
          {copied ? t('partner.copied') : t('partner.copy')}
        </span>
      </Button>
      <span role="status" className="sr-only">
        {copied ? t('partner.copied') : ''}
        {failed ? t('partner.copyFailed') : ''}
      </span>
    </>
  );
}

function CopyableLink({ id, value }: { id: string; value: string }) {
  const [copied, setCopied] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setFailed(false);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setFailed(true);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <Input id={id} readOnly value={value} className="font-mono text-xs" />
        <Button type="button" variant="outline" onClick={() => void copy()} disabled={!value}>
          {copied ? (
            <>
              <Check className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('partner.copied')}
            </>
          ) : (
            <>
              <Copy className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('partner.copy')}
            </>
          )}
        </Button>
      </div>
      {failed && (
        <p role="alert" className="text-xs text-destructive">
          {t('partner.copyFailed')}
        </p>
      )}
    </div>
  );
}
