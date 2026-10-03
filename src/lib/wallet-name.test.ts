import { afterEach, describe, expect, it } from 'vitest';
import { setActiveLocale } from '@/lib/i18n';
import { walletName } from './wallet-name';

/**
 * A wallet's name is composed from its kind and currency rather than read from
 * `WalletDto.name`, which the database generates in English.
 */
describe('walletName', () => {
  afterEach(() => setActiveLocale('en'));

  it("repeats the database's English wording exactly", () => {
    expect(walletName({ kind: 'main', currency: 'USD' })).toBe('USD Wallet');
    expect(walletName({ kind: 'commission', currency: 'USD' })).toBe('Commission Wallet');
    // A wallet read without its kind is a main wallet.
    expect(walletName({ currency: 'USDT' })).toBe('USDT Wallet');
  });

  it('reads in Arabic', () => {
    setActiveLocale('ar');
    expect(walletName({ kind: 'main', currency: 'USD' })).toBe('محفظة USD');
    expect(walletName({ kind: 'commission', currency: 'USD' })).toBe('محفظة العمولات');
  });
});
