import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePreselectedTransfer } from './use-preselected-transfer';
import type { TradingAccount } from '@/lib/api/trading';
import type { Wallet } from '@/lib/api/wallet';

/**
 * `/transfer?account=<id>` — the link that opens the transfer screen already
 * pointed at one account.
 *
 * ## Why this hook is worth testing rather than eyeballing
 *
 * It reads an identifier out of the URL and uses it to fill in a MONEY form.
 * That makes it the one place on this screen where untrusted input reaches a
 * transfer, and every failure mode is silent:
 *
 *  - honouring an id the client does not own would name a stranger's account on
 *    their screen;
 *  - seeding a destination with no usable source produces a half-filled form
 *    that cannot be submitted, which is worse than one that opens empty;
 *  - re-applying after the client changes the picker reads as a broken control.
 *
 * None of those throws. All three render perfectly.
 */
const params = { current: new URLSearchParams() };

vi.mock('next/navigation', () => ({
  useSearchParams: () => params.current,
}));

function account(over: Partial<TradingAccount> = {}): TradingAccount {
  return {
    id: 'acct-mine',
    login: '5001234',
    name: 'My Standard',
    mt5Group: 'real\\Standard-USD',
    product: 'Standard',
    environment: 'live',
    currency: 'USD',
    balance: '1250.00000000',
    leverage: 500,
    status: 'active',
    createdAt: '2026-08-01T00:00:00.000Z',
    ...over,
  };
}

function wallet(over: Partial<Wallet> = {}): Wallet {
  return {
    id: 'w-usd',
    walletNumber: '4f7kq2nm8xcb',
    userId: 1000001,
    // Server-generated from currency and kind; the fixture mirrors that rule
    // rather than inventing a string the server would never produce.
    name: 'USD Wallet',
    currency: 'USD',
    kind: 'main',
    balance: '700.00000000',
    onHold: '0.00000000',
    available: '700.00000000',
    createdAt: '2026-08-01T00:00:00.000Z',
    ...over,
  };
}

/** Runs the hook and reports what it seeded into the form. */
function seed(accounts: TradingAccount[], wallets: Wallet[]) {
  const setSourceKey = vi.fn();
  const setAccountId = vi.fn();
  const view = renderHook(() =>
    usePreselectedTransfer(accounts, wallets, setSourceKey, setAccountId),
  );
  return { setSourceKey, setAccountId, view };
}

beforeEach(() => {
  vi.clearAllMocks();
  params.current = new URLSearchParams();
});

describe('opening the transfer screen on a chosen account', () => {
  it('seeds the account and the wallet in its currency', () => {
    params.current = new URLSearchParams('account=acct-mine');
    const { setSourceKey, setAccountId } = seed([account()], [wallet()]);

    expect(setAccountId).toHaveBeenCalledWith('acct-mine');
    expect(setSourceKey).toHaveBeenCalledWith('wallet:USD');
  });

  it('does nothing at all without the parameter', () => {
    const { setSourceKey, setAccountId } = seed([account()], [wallet()]);

    expect(setAccountId).not.toHaveBeenCalled();
    expect(setSourceKey).not.toHaveBeenCalled();
  });

  /*
   * ⚠️ THE ONE THAT MATTERS. The id is matched against the accounts the client
   * actually holds — a hand-edited link or a stale bookmark must never put
   * somebody else's account on this form.
   */
  it('ignores an account id the client does not hold', () => {
    params.current = new URLSearchParams('account=someone-elses-account');
    const { setSourceKey, setAccountId } = seed([account()], [wallet()]);

    expect(setAccountId).not.toHaveBeenCalled();
    expect(setSourceKey).not.toHaveBeenCalled();
  });

  /*
   * A destination with no usable source is a form that opens half-filled and
   * cannot be completed. Opening empty is the better failure.
   */
  it('seeds nothing when no wallet matches the account currency', () => {
    params.current = new URLSearchParams('account=acct-mine');
    const { setSourceKey, setAccountId } = seed(
      [account({ currency: 'USDT' })],
      [wallet({ currency: 'USD' })],
    );

    expect(setAccountId).not.toHaveBeenCalled();
    expect(setSourceKey).not.toHaveBeenCalled();
  });

  it('picks the wallet matching THIS account among several', () => {
    params.current = new URLSearchParams('account=acct-usdt');
    const { setSourceKey } = seed(
      [account(), account({ id: 'acct-usdt', currency: 'USDT' })],
      [wallet(), wallet({ id: 'w-usdt', currency: 'USDT' })],
    );

    expect(setSourceKey).toHaveBeenCalledWith('wallet:USDT');
  });

  /*
   * An opening position, not a constraint. Without the latch a client who moved
   * the source away from the suggestion would have it put straight back on the
   * next render — which reads as a picker that fights them.
   */
  it('applies once and does not re-apply on a re-render', () => {
    params.current = new URLSearchParams('account=acct-mine');
    const { setAccountId, view } = seed([account()], [wallet()]);

    expect(setAccountId).toHaveBeenCalledTimes(1);
    view.rerender();
    view.rerender();
    expect(setAccountId).toHaveBeenCalledTimes(1);
  });

  /*
   * The accounts request and the wallets request settle independently, and the
   * screen can render before the wallets arrive. A `useState` initialiser would
   * run only on that first render and silently seed nothing whenever wallets
   * were the slower of the two — the kind of bug that looks like the link works
   * for some clients and not others.
   */
  it('still seeds when the wallets arrive after the first render', () => {
    params.current = new URLSearchParams('account=acct-mine');
    const setSourceKey = vi.fn();
    const setAccountId = vi.fn();
    const accounts = [account()];

    const view = renderHook(
      ({ wallets }: { wallets: Wallet[] }) =>
        usePreselectedTransfer(accounts, wallets, setSourceKey, setAccountId),
      { initialProps: { wallets: [] as Wallet[] } },
    );

    expect(setAccountId).not.toHaveBeenCalled();

    view.rerender({ wallets: [wallet()] });

    expect(setAccountId).toHaveBeenCalledWith('acct-mine');
    expect(setSourceKey).toHaveBeenCalledWith('wallet:USD');
  });
});
