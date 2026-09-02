import { describe, expect, it } from 'vitest';
import { buildTransferSources } from './transfer-sources';
import type { Wallet } from '@/lib/api/wallet';
import type { TradingAccount } from '@/lib/api/trading';

/**
 * Extracted from the three-step transfer sheet so its ordering rules are
 * assertions rather than something you find by clicking. Both rules below have
 * a wrong version that renders perfectly.
 */

const wallet = (currency: string, available: string): Wallet =>
  ({ currency, available, balance: available }) as Wallet;

const account = (id: string, balance: string): TradingAccount =>
  ({ id, login: id, balance, currency: 'USD' }) as unknown as TradingAccount;

describe('buildTransferSources', () => {
  it('sorts by amount through decimal.js, so 9 does not outrank 100', () => {
    /*
     * The failure this pins: `a.localeCompare(b)` on decimal STRINGS puts
     * '9.00' above '100.00', so the richest-first list leads with the smallest
     * balance — on the screen whose whole job is offering the wallet most
     * likely to cover the transfer. Any list with mixed magnitudes hits it on
     * its first render.
     */
    const { walletSources } = buildTransferSources(
      [wallet('USD', '9.00000000'), wallet('EUR', '100.00000000')],
      [],
    );
    expect(walletSources.map((s) => s.key)).toEqual(['wallet:EUR', 'wallet:USD']);
  });

  it('keeps eight-decimal precision a float would collapse', () => {
    const { walletSources } = buildTransferSources(
      [wallet('USD', '12345678901234567.89'), wallet('EUR', '12345678901234567.88')],
      [],
    );
    expect(walletSources[0]?.key).toBe('wallet:USD');
  });

  it('puts every wallet ahead of every account', () => {
    // Funding an account is the common direction, so the wallet a client came
    // to spend from leads even when an account holds more.
    const { sources } = buildTransferSources(
      [wallet('USD', '1.00000000')],
      [account('acc-1', '999.00000000')],
    );
    expect(sources.map((s) => s.key)).toEqual(['wallet:USD', 'account:acc-1']);
  });

  it('lists a wallet holding nothing rather than hiding it', () => {
    /*
     * "You have no money here" differs from "this does not exist". Hiding an
     * empty wallet leaves somebody hunting for a currency they hold — the same
     * rule the wallet card's em-dash-not-zero follows.
     */
    const { walletSources } = buildTransferSources([wallet('USD', '0.00000000')], []);
    expect(walletSources).toHaveLength(1);
  });

  it("does not sort React Query's cached array in place", () => {
    // The arrays are the cache's own objects; sorting in place would reorder
    // what every other reader of that key sees.
    const wallets = [wallet('USD', '1.00000000'), wallet('EUR', '2.00000000')];
    buildTransferSources(wallets, []);
    expect(wallets.map((w) => w.currency)).toEqual(['USD', 'EUR']);
  });
});
