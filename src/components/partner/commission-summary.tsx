'use client';

import * as React from 'react';
import { CELL, SectionHeader, Surface } from '@/components/partner/partner-ui';
import type { IbCommissionRow } from '@/lib/api/partner';
import { formatMoney, isZeroMoney } from '@/lib/money';
import { summariseCommissions } from '@/lib/partner-earnings';
import { t } from '@/lib/i18n';

/**
 * What the commission entries below add up to.
 *
 * ## The figure this exists for is AWAITING RELEASE
 *
 * The totals at the top of the page read the LEDGER — money actually credited —
 * so a partner whose accruals are still maturing sees a figure that does not
 * include them, with no way to tell "nothing earned" from "earned, not yet
 * released". Those are wildly different facts to somebody waiting to be paid,
 * and the second is the one that becomes a support message.
 *
 * ## These totals are BOUNDED, and the panel says so
 *
 * They are summed in the browser from the rows in this list, and
 * `GET /ib/commissions` returns the most recent entries rather than every one —
 * the server caps the list and takes no query parameters. The scope line is what
 * makes "released" a true statement about the entries shown rather than a
 * lifetime total that quietly under-reports.
 *
 * That is also why the lifetime figure lives above and is labelled differently.
 * Two money figures that differ, with nothing saying which is which, is the
 * failure `/accounts/[id]` documents about its two balances — a reader cannot
 * tell which is theirs, and acts on the wrong one half the time.
 *
 * ## One block PER CURRENCY
 *
 * There is no FX source in this system, so a USD total and an LBP total are two
 * facts and never one. The currency is named on the block only when the partner
 * holds more than one, because "In USD" above the only figures on the screen is
 * noise.
 */
export function CommissionSummary({ rows }: { rows: IbCommissionRow[] }) {
  const summaries = React.useMemo(() => summariseCommissions(rows), [rows]);

  if (summaries.length === 0) return null;

  return (
    <Surface>
      <SectionHeader
        title={t('partner.summaryHeading')}
        description={t('partner.summaryScope', { count: rows.length })}
      />

      <div className="flex-1 divide-y divide-border">
        {summaries.map((summary) => (
          <div key={summary.currency}>
            {summaries.length > 1 && (
              <p className="bg-muted/40 px-5 py-2 text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                {t('partner.summaryCurrency', { currency: summary.currency })}
              </p>
            )}

            <div className="grid gap-px bg-border sm:grid-cols-2">
              <Figure
                label={t('partner.totalReleased')}
                value={formatMoney(summary.released, summary.currency)}
                hint={t('partner.totalReleasedHint')}
                count={summary.counts.released}
              />
              {/*
                Always rendered. This is the number a partner came to find, and a
                zero here is a real answer — "nothing is waiting" — rather than
                an absence.
              */}
              <Figure
                label={t('partner.totalAwaiting')}
                value={formatMoney(summary.awaiting, summary.currency)}
                hint={t('partner.totalAwaitingHint')}
                count={summary.counts.awaiting}
                tone="warning"
              />
              {/*
                Reversals appear ONLY when there are some. A permanent "0
                reversed" is a status light that never changes, and it puts a
                loss-shaped figure beside two the partner is owed.
              */}
              {summary.counts.reversed > 0 && (
                <Figure
                  label={t('partner.totalReversed')}
                  value={formatMoney(summary.reversed, summary.currency)}
                  hint={t('partner.totalReversedHint')}
                  count={summary.counts.reversed}
                  tone="destructive"
                />
              )}
            </div>

            {/*
              Where the released money came from. Released ONLY — a pending
              accrual is not yet a source of anything, and mixing the two would
              attribute money nobody holds.

              Hidden until something has been released, because two zeroes under
              a heading about where money came from answers a question the reader
              has not asked yet.
            */}
            {!isZeroMoney(summary.released) && (
              <dl className="grid gap-px bg-border sm:grid-cols-2">
                <Split
                  label={t('partner.sourceDirect')}
                  value={formatMoney(summary.directReleased, summary.currency)}
                />
                <Split
                  label={t('partner.sourceNetwork')}
                  value={formatMoney(summary.networkReleased, summary.currency)}
                />
              </dl>
            )}
          </div>
        ))}
      </div>
    </Surface>
  );
}

const TONES = {
  neutral: '',
  warning: 'text-warning',
  destructive: 'text-destructive',
} as const;

function Figure({
  label,
  value,
  hint,
  count,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  hint: string;
  /** How many entries produced it — the sum alone hides whether it is one row. */
  count: number;
  tone?: keyof typeof TONES;
}) {
  return (
    <div className={`${CELL} p-5`}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
          {label}
        </p>
        <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
      </div>
      <p
        className={`mt-1.5 text-xl font-semibold tracking-tight break-all tabular-nums ${TONES[tone]}`}
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function Split({ label, value }: { label: string; value: string }) {
  return (
    <div className={`${CELL} px-5 py-3`}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold break-all tabular-nums">{value}</dd>
    </div>
  );
}
