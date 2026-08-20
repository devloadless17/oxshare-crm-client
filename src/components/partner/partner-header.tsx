'use client';

import { Input } from '@/components/ui/input';
import { CopyButton, Pill, Surface, formatDate } from '@/components/partner/partner-ui';
import { useHydrated } from '@/hooks/use-hydrated';
import type { IbStatus } from '@/lib/api/partner';
import { t } from '@/lib/i18n';

/**
 * Who the partner is, and the two strings that earn them money.
 *
 * ## One surface, two bands
 *
 * The identity band states the facts a partner checks — am I still active, what
 * rung am I on, what programme do I sell, since when — as a label/value row
 * rather than as chips. Chips imply things you can click; these are read.
 *
 * The referral band beneath it is separated by a hairline rather than a gap,
 * because it is the same object: your standing and the code that produces it.
 * Two floating cards said they were unrelated.
 *
 * ## The referral code and link sit side by side, above everything else
 *
 * They stacked inside a narrow column before, which pushed the LINK — the thing
 * a returning partner comes back to copy — below the fold on a laptop. Both are
 * now on one row on a wide screen and stack only when there is genuinely no
 * width for them.
 *
 * The code is monospaced and letter-spaced because it is read aloud, typed into
 * a chat, and checked against somebody's registration. The link is the same fact
 * in a form you can paste. Both are here because partners use both, and deriving
 * one from the other by hand is where a typo costs an attribution.
 *
 * ## The level NAME comes from the overview, and this renders without it
 *
 * `GET /ib/status` carries the level NUMBER; only `GET /ib/overview` carries its
 * name. So the name leads with the number as its qualifier, and while the
 * overview is still loading — or has failed — the number stands alone. "Am I
 * still a partner, and what is my link" must not wait on a second request.
 */
export function PartnerHeader({
  account,
  levelName,
}: {
  account: NonNullable<IbStatus['account']>;
  /** From `GET /ib/overview`. Absent while it loads, and if it fails. */
  levelName?: string;
}) {
  const hydrated = useHydrated();
  /*
   * Empty until hydration, because `window` does not exist on the server and a
   * link built from a guessed origin would be a WRONG referral link — the one
   * value on this screen that must never be approximately right.
   */
  const referralLink = hydrated
    ? `${window.location.origin}/auth/register?ref=${account.referralCode}`
    : '';

  return (
    <Surface>
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4 p-5 sm:p-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-lg font-semibold tracking-tight">{t('nav.partner')}</h1>
            <Pill tone={account.active ? 'success' : 'warning'}>
              {account.active ? t('partner.subPartnerActive') : t('partner.subPartnerSuspended')}
            </Pill>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('partner.approvedSince', { date: formatDate(account.approvedAt) })}
          </p>
        </div>

        {/*
          A definition list, not chips: these are attributes being read, and a
          chip is a control that has lost its handler. `dl` also gives the pairs
          a real relationship for a screen reader, which a div of two lines does
          not.
        */}
        <dl className="flex flex-wrap gap-x-10 gap-y-3">
          <Fact
            label={t('partner.levelLabel')}
            value={levelName ?? t('partner.subPartnerLevel', { level: account.level })}
            hint={levelName ? t('partner.subPartnerLevel', { level: account.level }) : undefined}
          />
          {account.agencyName && (
            <Fact label={t('partner.agencyLabel')} value={account.agencyName} />
          )}
        </dl>
      </div>

      {!account.active && (
        <p
          role="status"
          className="border-t border-warning/30 bg-warning/10 px-5 py-3 text-xs leading-relaxed text-warning sm:px-6"
        >
          {t('partner.suspendedNotice')}
        </p>
      )}

      {/*
        The hairline between the two fields is the grid's own `gap-px` showing
        through — see `HAIRLINE_GRID` in partner-ui. Written out here rather than
        reused because this grid also needs the rule along its TOP edge, which
        the shared constant deliberately leaves to its container.
      */}
      <div className="grid gap-px border-t border-border bg-border lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="bg-card p-5 sm:p-6">
          <p className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
            {t('partner.referralCodeLabel')}
          </p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="truncate font-mono text-xl font-semibold tracking-[0.18em] sm:text-2xl">
              {account.referralCode}
            </span>
            <CopyButton value={account.referralCode} label={t('partner.referralCodeLabel')} />
          </div>
        </div>

        <div className="bg-card p-5 sm:p-6">
          <label
            htmlFor="referral-link"
            className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase"
          >
            {t('partner.referralLinkLabel')}
          </label>
          <div className="mt-2 flex items-center gap-2">
            <Input id="referral-link" readOnly value={referralLink} className="font-mono text-xs" />
            <CopyButton
              value={referralLink}
              label={t('partner.referralLinkLabel')}
              variant="default"
            />
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {t('partner.referralHint')}
          </p>
        </div>
      </div>
    </Surface>
  );
}

function Fact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-1 truncate text-sm font-semibold">{value}</dd>
      {hint && <dd className="text-xs text-muted-foreground">{hint}</dd>}
    </div>
  );
}
