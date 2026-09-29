'use client';

import * as React from 'react';
import { currenciesApi } from '@/lib/api/currencies';
import { DISPLAY_SCALE } from '@/lib/money';
import { keys } from '@/lib/query-keys';
import { useResource } from './use-resource';

/**
 * How many decimal places a currency may carry, as the OPERATOR declared it.
 *
 * The API refuses a deposit or withdrawal whose amount has more places than
 * this (D-77), so any screen offering the client a prefilled amount — a "use
 * max" button, a preset — needs the number to avoid offering one that will be
 * refused. The wallet payload carries the currency CODE only.
 *
 * ## It never blocks the screen
 *
 * The catalogue is fetched, but the caller is not expected to gate on it: an
 * unresolved currency falls back to `DISPLAY_SCALE`, which every currency this
 * platform holds actually declares. The failure mode of the fallback is
 * offering slightly LESS than the client could take — never more than they
 * hold, and never an amount the server refuses. Blocking a money form on a
 * lookup table would be the wrong trade.
 *
 * Uses the same query key as the wallet screen, so it is usually already cached.
 */
export function useCurrencyScale(): (currency: string) => number {
  const currencies = useResource(keys.currencies.all(), (signal) => currenciesApi.list(signal));
  const rows = currencies.status === 'ready' ? currencies.data : undefined;

  return React.useCallback(
    (code: string) => rows?.find((c) => c.code === code)?.decimals ?? DISPLAY_SCALE,
    [rows],
  );
}

/**
 * A currency's WITHDRAWAL limits, as the operator set them (backend 0162) — in
 * that currency's own units, so an LBP wallet shows millions and a USD one tens.
 *
 * Shown to the client, never enforced here: the server refuses outside them
 * with its own sentence (R-5.1). `undefined` while the catalogue loads, and the
 * screen then simply shows no range.
 */
export function useWithdrawalLimits(): (
  currency: string,
) => { min: string; max: string } | undefined {
  const currencies = useResource(keys.currencies.all(), (signal) => currenciesApi.list(signal));
  const rows = currencies.status === 'ready' ? currencies.data : undefined;

  return React.useCallback(
    (code: string) => {
      const row = rows?.find((c) => c.code === code);
      return row ? { min: row.minWithdrawal, max: row.maxWithdrawal } : undefined;
    },
    [rows],
  );
}
