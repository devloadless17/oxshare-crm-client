'use client';

import * as React from 'react';
import { Check, Copy, Wallet as WalletIcon } from 'lucide-react';
import { MoneyAction } from '@/components/kyc/money-action';
import type { Wallet as WalletRecord, WalletCurrency } from '@/lib/api/wallet';
import { formatMoney, isZeroMoney } from '@/lib/money';
import { t } from '@/lib/i18n';

/**
 * A wallet, presented as a payment card.
 *
 * ## The card metaphor earns its place, and where it stops
 *
 * A balance card is scanned, not read: a client opening this screen wants the
 * NUMBER and the two or three things they can do with it. The card shape gives
 * that a fixed anatomy — brand mark top-left, identifier along the bottom,
 * figure in the middle — so the eye lands in the same place on every card
 * regardless of which currency it is.
 *
 * Where the metaphor deliberately stops: this does NOT render a fake card
 * number, a chip, an expiry or a network logo. Those would imply a physical
 * instrument the client can present somewhere, and no such instrument exists.
 * The identifier shown is the real wallet id, labelled as one.
 *
 * ## A missing wallet is still not a zero
 *
 * The rule the wallet screen turns on, preserved through the redesign: a
 * currency absent from `GET /wallet` has genuinely NOT BEEN OPENED, which is a
 * different sentence from "you have no money". An unopened card renders an em
 * dash and an explanation. It does NOT render `$0.00` — that is what showed a
 * client holding $700 a zero, and a prettier card is exactly the sort of change
 * that quietly reintroduces it.
 */
export function WalletCard({
  label,
  note,
  currency,
  wallet,
  holder,
}: {
  label: string;
  note: string;
  currency: WalletCurrency;
  wallet: WalletRecord | undefined;
  /** The signed-in client's name, for the card foot. Absent renders nothing. */
  holder?: string;
}) {
  const opened = wallet !== undefined;

  return (
    <div className="flex flex-col gap-4">
      {/*
        The card face.

        `aspect-[1.6]` is the ISO/IEC 7810 ID-1 ratio a payment card actually
        has, so the shape reads as a card rather than as a rounded box that
        happens to be wide. It is capped by `max-w-md` so the figure does not
        stretch across an ultrawide monitor into something unscannable.

        A GRADIENT, not a flat fill, and only here: it is what separates the
        card object from the page's cards-as-panels used everywhere else in this
        app. Both stops are theme tokens, so it follows dark mode instead of
        pinning one palette.
      */}
      <div
        className={`relative flex aspect-[1.6] w-full max-w-md flex-col justify-between overflow-hidden rounded-2xl p-5 sm:p-6 ${
          opened
            ? 'bg-linear-to-br from-primary via-primary to-link text-primary-foreground shadow-lg'
            : // An unopened wallet is deliberately flat and muted: it is a
              // placeholder for something that does not exist yet, and giving it
              // the same weight as a funded card would misrepresent it at a
              // glance, which is the failure mode this screen has already had.
              'border border-dashed border-border bg-muted/40 text-muted-foreground'
        }`}
      >
        {/*
          Decorative sheen. `aria-hidden` and pointer-events-none — it carries no
          information and must never intercept a click aimed at the card.
        */}
        {opened && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -end-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl"
          />
        )}

        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p
              className={`text-[11px] font-semibold tracking-widest uppercase ${
                opened ? 'text-primary-foreground/75' : 'text-muted-foreground'
              }`}
            >
              {label}
            </p>
            {/* The currency code, large, because it is what tells two otherwise
                identical cards apart at a glance. */}
            <p className="mt-0.5 text-sm font-bold tracking-wide">{currency}</p>
          </div>
          <WalletIcon
            className={`h-6 w-6 shrink-0 ${opened ? 'text-primary-foreground/80' : ''}`}
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
                appears below, and only when it differs.

                `tabular-nums` so the digits do not reflow as the figure updates.
              */}
              <p className="text-3xl font-bold tracking-tight tabular-nums sm:text-4xl">
                {formatMoney(wallet.available, currency)}
              </p>
              {!isZeroMoney(wallet.onHold) && (
                <p className="mt-1 text-xs text-primary-foreground/80">
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
              <p className="mt-1 text-xs">{t('wallet.notOpened', { currency })}</p>
            </>
          )}
        </div>

        {/* The foot: holder and identifier, where a card carries them. */}
        <div className="relative flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p
              className={`text-[9px] font-semibold tracking-widest uppercase ${
                opened ? 'text-primary-foreground/60' : 'text-muted-foreground'
              }`}
            >
              {opened ? t('wallet.cardIdLabel') : t('wallet.cardNotOpenedTitle')}
            </p>
            {opened ? (
              <WalletIdentifier id={wallet.id} />
            ) : (
              <p className="font-mono text-xs tracking-widest">••••••••</p>
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

      {/*
        The actions, BELOW the card rather than on it.

        On the face they would compete with the balance for the same glance and
        would have to be styled against a gradient in two themes. Below, they sit
        at full contrast against the page — and they stay beside the number the
        client is deciding against, which is the placement rule that put them on
        this screen instead of in the nav rail.

        Offered on an unopened wallet too, deliberately: /withdraw and /transfer
        both read the real balance and explain themselves. Hiding them would
        leave a client with an empty card and no way to find out what it is for.
      */}
      <div className="flex max-w-md flex-wrap gap-2">
        <MoneyAction
          href="/deposit"
          icon="deposit"
          label={t('wallet.deposit')}
          size="sm"
          className="flex-1"
        />
        <MoneyAction
          href="/withdraw"
          icon="withdraw"
          label={t('wallet.withdraw')}
          variant="outline"
          size="sm"
          className="flex-1"
        />
        <MoneyAction
          href="/transfer"
          icon="transfer"
          label={t('wallet.transfer')}
          variant="outline"
          size="sm"
          className="flex-1"
        />
      </div>

      <p className="max-w-md text-xs leading-relaxed text-muted-foreground">{note}</p>
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
        className="rounded p-0.5 text-primary-foreground/70 transition-colors hover:text-primary-foreground focus-outline"
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
