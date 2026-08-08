'use client';

import * as React from 'react';
import { Check, Copy, Wallet as WalletIcon } from 'lucide-react';
import type { Wallet as WalletRecord, WalletCurrency } from '@/lib/api/wallet';
import { formatMoney, isZeroMoney } from '@/lib/money';
import { t } from '@/lib/i18n';

/**
 * A wallet, presented as a payment card.
 *
 * ## It looks like a card, and carries NO chrome of its own
 *
 * No outer border, no drop shadow, no panel wrapper. A credit card is a single
 * coloured object with a fixed anatomy — mark top-left, figure in the middle,
 * identifier along the bottom — and every extra rule around it makes it read as
 * "a box that contains a card" instead. The only geometry is `aspect-[1.586]`,
 * the real ISO/IEC 7810 ID-1 ratio, and a large radius.
 *
 * The ACTIONS are not here either. They live once beneath the carousel on the
 * wallet page, because three buttons repeated per card is three buttons that
 * look like they act on that card alone — and deposit, withdraw and transfer all
 * open their own screen where the currency is chosen anyway.
 *
 * ## Where the metaphor stops
 *
 * No fake card number, no chip, no expiry, no network logo. Those imply a
 * physical instrument the client can present somewhere, and none exists. The
 * identifier is the real wallet id, labelled as one.
 *
 * ## A missing wallet is still not a zero
 *
 * The rule the whole screen turns on: a currency absent from `GET /wallet` has
 * genuinely NOT BEEN OPENED, which is a different sentence from "you have no
 * money". An unopened card renders an em dash and an explanation, never `$0.00`
 * — that is what showed a client holding $700 a zero, and a prettier card is
 * exactly the change that quietly reintroduces it.
 */
export function WalletCard({
  label,
  currency,
  wallet,
  holder,
}: {
  label: string;
  currency: WalletCurrency;
  wallet: WalletRecord | undefined;
  /** The signed-in client's name, for the card foot. Absent renders nothing. */
  holder?: string;
}) {
  const opened = wallet !== undefined;

  return (
    /*
     * The card face.
     *
     * A GRADIENT rather than a flat fill — this is the one place in the app
     * where the surface is an object rather than a panel, and a deep two-stop
     * wash is what makes it read as a card at a glance. Both stops are theme
     * tokens, so it follows dark mode rather than pinning one palette.
     *
     * `overflow-hidden` because the decorative arcs below are positioned past
     * the edges; without it they would paint over the page.
     */
    <div
      className={`relative flex aspect-[1.586] w-full flex-col justify-between overflow-hidden rounded-2xl p-5 sm:p-6 ${
        opened
          ? 'bg-linear-to-br from-primary via-primary to-link text-primary-foreground'
          : // An unopened wallet is flat and muted: it is a placeholder for
            // something that does not exist yet, and giving it the same weight
            // as a funded card would misrepresent it at a glance — the failure
            // mode this screen has already had once.
            'border border-dashed border-border bg-muted/40 text-muted-foreground'
      }`}
    >
      {/*
        Two soft arcs, the way a real card carries an embossed curve. Purely
        decorative, so `aria-hidden` and `pointer-events-none` — they must never
        intercept a click aimed at the copy button below.
      */}
      {opened && (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -end-20 -top-24 h-56 w-56 rounded-full bg-white/10"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-28 -start-16 h-56 w-56 rounded-full bg-black/5"
          />
        </>
      )}

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className={`text-[10px] font-semibold tracking-widest uppercase ${
              opened ? 'text-primary-foreground/70' : 'text-muted-foreground'
            }`}
          >
            {label}
          </p>
          {/* The currency code, prominent, because it is what tells two
              otherwise identical cards apart in a carousel. */}
          <p className="mt-0.5 text-sm font-bold tracking-wide">{currency}</p>
        </div>
        <WalletIcon
          className={`h-6 w-6 shrink-0 ${opened ? 'text-primary-foreground/70' : ''}`}
          aria-hidden="true"
        />
      </div>

      <div className="relative">
        {opened ? (
          <>
            {/*
              `available`, not `balance`. The two differ by whatever is held
              against a pending withdrawal, and the number a client reads as
              "what I have" is the one they can actually act on. The total
              appears below it, and only when the two differ.

              `tabular-nums` so the digits do not reflow as the figure updates.
            */}
            <p className="text-3xl font-bold tracking-tight tabular-nums sm:text-4xl">
              {formatMoney(wallet.available, currency)}
            </p>
            {!isZeroMoney(wallet.onHold) && (
              <p className="mt-1 text-[11px] text-primary-foreground/80">
                {t('wallet.onHold', {
                  amount: formatMoney(wallet.onHold, currency),
                  total: formatMoney(wallet.balance, currency),
                })}
              </p>
            )}
          </>
        ) : (
          <>
            {/* An em dash and a sentence saying why — never a fabricated
                number. See the component note. */}
            <p className="text-3xl font-bold sm:text-4xl">—</p>
            <p className="mt-1 text-[11px]">{t('wallet.notOpened', { currency })}</p>
          </>
        )}
      </div>

      {/*
        The foot: identifier and holder, where a card carries them.

        The unopened card used to print `••••••••` here — a masked value implying
        a hidden real one. There is no wallet and so no id to mask, so the dots
        were decoration pretending to be data. The row is simply absent instead,
        which is what "not opened" actually looks like.
      */}
      <div className="relative flex items-end justify-between gap-3">
        <div className="min-w-0">
          {opened && (
            <>
              <p className="text-[9px] font-semibold tracking-widest text-primary-foreground/60 uppercase">
                {t('wallet.cardIdLabel')}
              </p>
              <WalletIdentifier id={wallet.id} />
            </>
          )}
        </div>

        {holder && (
          <p
            className={`max-w-[45%] truncate text-end text-[11px] font-semibold tracking-wide uppercase ${
              opened ? 'text-primary-foreground/80' : 'text-muted-foreground'
            }`}
          >
            {holder}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * The wallet id, shortened for the card and copyable in full.
 *
 * ## Why it is truncated on screen but copied whole
 *
 * A uuid is 36 characters and does not fit the card foot at a legible size. It
 * is also not something anyone reads — it is something they PASTE, into a
 * support ticket. So the display is the first and last block (enough to tell two
 * wallets apart and to confirm a match by eye) and the clipboard gets the whole
 * value, because a truncated id in a support ticket is worse than none.
 *
 * The full id stays in `title` and in a visually-hidden span so it is reachable
 * by a screen reader and by text selection, rather than being locked behind a
 * button that may not work — `navigator.clipboard` is unavailable over plain
 * HTTP and can be denied by permission.
 */
function WalletIdentifier({ id }: { id: string }) {
  const [copied, setCopied] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(id);
      setFailed(false);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Said out loud rather than swallowed: a button that appears to do nothing
      // is the one control a client is certain they used correctly.
      setFailed(true);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <span className="font-mono text-xs tracking-wider" title={id}>
        {shortenId(id)}
      </span>
      <span className="sr-only">{id}</span>
      <button
        type="button"
        onClick={() => void copy()}
        // Icon-only, so it needs a name — without one a screen reader announces
        // "button" and the only way to obtain the full id is unreachable.
        aria-label={t('wallet.copyId')}
        className="focus-outline rounded p-0.5 text-primary-foreground/70 transition-colors hover:text-primary-foreground"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </button>
      {/* `role="status"` so the outcome is announced rather than only shown. */}
      <span role="status" className="sr-only">
        {copied ? t('wallet.copiedId') : ''}
        {failed ? t('partner.copyFailed') : ''}
      </span>
    </div>
  );
}

/**
 * `a1b2c3d4…9f8e` — the leading and trailing blocks of a uuid.
 *
 * Guarded on length rather than assuming 36 characters: the id arrives from the
 * API, and a shortener that slices blindly would render nonsense for anything
 * unexpected instead of simply showing it.
 */
function shortenId(id: string): string {
  if (id.length <= 13) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}
