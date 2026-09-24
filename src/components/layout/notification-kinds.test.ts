import { describe, expect, it } from 'vitest';
import { KIND_CONFIG, queryKeysFor, resyncKeysOnReconnect } from './notification-kinds';
import { keys, REGISTERED_ROOTS } from '@/lib/query-keys';

/**
 * The test that would have caught the bug the owner reported: "when I fund a
 * wallet the result doesn't appear until I refresh."
 *
 * `wallet.credited`, `rebate.credited` and `commission.confirmed` — the three
 * kinds that ARE wallet credits — mapped to `[]`. React Query cannot report
 * that, because there is nothing to report: no invalidate was attempted. The
 * client got the chime, the toast and the bell badge, and a balance underneath
 * that had not moved.
 */

/** React Query's own matching rule: a key matches if it is a PREFIX. */
const invalidates = (invalidated: readonly unknown[], queryKey: readonly unknown[]): boolean =>
  invalidated.length <= queryKey.length &&
  invalidated.every((segment, i) => Object.is(segment, queryKey[i]));

const refreshes = (kind: string, surface: readonly unknown[]): boolean =>
  queryKeysFor(kind).some((key) => invalidates(key, surface));

describe('queryKeysFor', () => {
  it('gives every announced kind something to refresh', () => {
    for (const kind of Object.keys(KIND_CONFIG)) {
      expect(queryKeysFor(kind), `${kind} announces but refreshes nothing`).not.toHaveLength(0);
    }
  });

  it('never invalidates a key no screen reads', () => {
    for (const kind of Object.keys(KIND_CONFIG)) {
      for (const key of queryKeysFor(kind)) {
        expect(
          REGISTERED_ROOTS,
          `${kind} invalidates unregistered ${JSON.stringify(key)}`,
        ).toContain(key[0]);
      }
    }
  });

  it.each(['wallet.credited', 'rebate.credited', 'commission.confirmed'])(
    '%s refreshes the balance it just changed',
    (kind) => {
      /*
       * The reported bug, one case per kind. Each of these credits a MAIN
       * wallet — `wallet.credited` by an operator's hand, the other two by the
       * commission engine's hourly confirm — so all three change the same
       * three screens a deposit does.
       */
      expect(refreshes(kind, keys.wallets.all()), 'the wallet').toBe(true);
      expect(refreshes(kind, keys.transactions.list({})), 'the transaction list').toBe(true);
      expect(refreshes(kind, keys.dashboard.all()), 'the dashboard').toBe(true);
    },
  );

  it('sends a confirmed commission to the partner screen as well', () => {
    // `GET /ib/overview` sums confirmed ledger entries, so the lifetime figure
    // and the commission balances moved with the credit.
    expect(refreshes('commission.confirmed', keys.partner.overview())).toBe(true);
  });

  it('refreshes the wallet on every money kind, not just deposits', () => {
    for (const kind of Object.keys(KIND_CONFIG)) {
      if (!/^(deposit|withdrawal|transfer|wallet|rebate|commission)\./.test(kind)) continue;
      expect(refreshes(kind, keys.wallets.all()), `${kind} leaves the wallet stale`).toBe(true);
    }
  });

  it('puts a new trading account in the transfer picker, not only the list', () => {
    /*
     * They were separate roots — `['trading-accounts']` and
     * `['transferable-accounts']` — and nothing ever invalidated the second,
     * so a client opened an account and could not find it on /transfer.
     */
    for (const surface of [keys.tradingAccounts.all(), keys.tradingAccounts.transferable()]) {
      expect(refreshes('trading_account.opened', surface)).toBe(true);
    }
  });

  it('refreshes the KYC status the badge, the card and the outcome screen share', () => {
    expect(refreshes('kyc.approved', keys.kyc.status())).toBe(true);
    expect(refreshes('kyc.rejected', keys.kyc.status())).toBe(true);
  });

  it('leaves the live MT5 figures alone', () => {
    /*
     * Deliberately NOT live. `/accounts/:id/live` is throttled 12/min per
     * CLIENT and every call takes the single MT5 session lock, so invalidating
     * it in bulk would turn one notification into a burst of the most
     * expensive read this system makes. It sits behind a refresh button.
     */
    for (const kind of Object.keys(KIND_CONFIG)) {
      for (const key of queryKeysFor(kind)) {
        expect(
          invalidates(key, keys.mt5Live.snapshot('acc-1')),
          `${kind} would refetch live MT5 figures`,
        ).toBe(false);
      }
    }
  });

  describe('what a reconnect re-syncs', () => {
    /*
     * Reported from production: a KYC rejection that landed while the socket
     * was down reached the bell but never the outcome screen, because the
     * reconnect refreshed the bell alone. Socket.IO does not replay.
     */
    const resync = resyncKeysOnReconnect();
    const covers = (target: readonly unknown[]) => resync.some((key) => invalidates(key, target));

    it('covers the KYC status the outcome screen reads', () => {
      expect(covers(keys.kyc.status())).toBe(true);
    });

    it('covers every family a live event refreshes', () => {
      for (const kind of Object.keys(KIND_CONFIG)) {
        for (const key of queryKeysFor(kind)) {
          expect(covers(key), `${kind} is missed while the socket is down`).toBe(true);
        }
      }
    });

    it('never reaches the live MT5 figures', () => {
      expect(covers(keys.mt5Live.snapshot('acc-1'))).toBe(false);
    });
  });

  it('ignores a kind the backend invented after this build', () => {
    expect(queryKeysFor('something.nobody.shipped')).toEqual([]);
  });
});
