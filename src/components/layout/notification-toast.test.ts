import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveKind } from './notification-kinds';
import { toastNotification } from './notification-toast';
import { t } from '@/lib/i18n';

/**
 * The socket-to-toast path, exercised over EVERY kind the backend can send a
 * client.
 *
 * ## Why this file exists
 *
 * A withdrawal produced a toast reading just "Notification" — the generic
 * fallback, with no body and no action. Nothing was broken enough to fail a
 * type-check or a lint: the fallback is a deliberate, correct branch for a kind
 * this build has not learned yet, so an unmapped kind degrades silently and
 * looks exactly like a bug to whoever sees it.
 *
 * The catalogue and the emitter are in different REPOSITORIES, so nothing
 * connects them at compile time. `CLIENT_KINDS` below is that connection,
 * written down: it is the list of non-`admin.` kinds the backend emits, and the
 * first test fails the day one is added without a catalogue entry.
 *
 * Keep it in step by re-running, from the backend:
 *
 *   grep -rhoE "kind: '[a-z_]+\\.[a-z_.]+'" --include=*.ts src \
 *     | sed "s/kind: '//;s/'//" | sort -u | grep -v '^admin\\.'
 */
const CLIENT_KINDS = [
  'commission.confirmed',
  'deposit.failed',
  'deposit.succeeded',
  'kyc.approved',
  'kyc.rejected',
  'partner.approved',
  'partner.rejected',
  'trading_account.opened',
  'transfer.completed',
  'wallet.credited',
  'withdrawal.paid',
  'withdrawal.rejected',
] as const;

/**
 * `withdrawal.rival_submit_failed` is emitted but is NOT here on purpose: it
 * goes to `notifyAdminsWithPermission`, so it reaches the admin console's
 * catalogue and never a client socket. Listing it would force a portal entry
 * for copy no client should read — a payout provider's internals.
 */

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

beforeEach(() => {
  vi.clearAllMocks();
});

/** What the fallback renders. Any test asserting "not the fallback" uses this. */
const FALLBACK = t('notifications.fallbackTitle');

describe('every kind the backend sends a client', () => {
  it.each(CLIENT_KINDS)('%s is in the catalogue', (kind) => {
    /*
     * The drift guard. `resolveKind` returning undefined is what produced a
     * toast reading "Notification" on a real withdrawal — a correct branch
     * reached for the wrong reason.
     */
    expect(resolveKind(kind), `${kind} has no KindConfig — the toast falls back`).toBeDefined();
  });

  it.each(CLIENT_KINDS)('%s toasts real copy, never the generic title', (kind) => {
    toastNotification({ id: 'n-1', kind, params: {} });

    expect(toast).toHaveBeenCalledTimes(1);
    const [title] = toast.mock.calls[0] as [string, unknown];
    expect(title).not.toBe(FALLBACK);
    // A missing message would render the KEY. Neither is copy a client reads.
    expect(title).not.toMatch(/^notifications\./);
    expect(title.trim().length).toBeGreaterThan(0);
  });

  it.each(CLIENT_KINDS)('%s builds a body without leaking a placeholder', (kind) => {
    const config = resolveKind(kind);
    if (!config?.vars) return;

    /*
     * The params a real event carries. `t()` leaves `{placeholder}` visible
     * when a var is absent, which is the honest behaviour for a partial row —
     * but with every field present nothing should remain unsubstituted.
     */
    toastNotification({
      id: 'n-1',
      kind,
      params: {
        amount: '250.00000000',
        currency: 'USD',
        reason: 'Something specific',
        login: '6477775',
        level: 'Master Partner',
        method: 'Bank transfer',
        // A REAL enum value. The catalogue maps this to a translated phrase
        // rather than interpolating the database slug — see its note, and the
        // unknown-value case below.
        direction: 'wallet_to_account',
        environment: 'live',
      },
    });

    const [, options] = toast.mock.calls[0] as [string, { description?: string }];
    if (options?.description) {
      expect(options.description, `${kind} left a placeholder unfilled`).not.toMatch(/\{[a-z]+\}/i);
    }
  });
});

describe('a param the catalogue cannot translate', () => {
  it('leaves the placeholder visible rather than saying nothing', () => {
    /*
     * DELIBERATE, and asserted so it stays that way. `transfer.completed` turns
     * `direction` into a translated phrase; an unrecognised value yields
     * `undefined`, and `t()` then leaves `{direction}` on screen.
     *
     * The alternative — substituting an empty string — reads as a finished
     * sentence that has quietly lost its verb ("$250.00 was ."), which nobody
     * would report. A visible placeholder is obviously broken, and obviously
     * broken gets fixed.
     */
    toastNotification({
      id: 'n-1',
      kind: 'transfer.completed',
      params: { amount: '250.00000000', currency: 'USD', direction: 'sideways' },
    });

    const [, options] = toast.mock.calls[0] as [string, { description?: string }];
    expect(options.description).toContain('{direction}');
  });

  it('renders the phrase for a direction it knows', () => {
    toastNotification({
      id: 'n-1',
      kind: 'transfer.completed',
      params: { amount: '250.00000000', currency: 'USD', direction: 'wallet_to_account' },
    });

    const [, options] = toast.mock.calls[0] as [string, { description?: string }];
    expect(options.description).not.toContain('{direction}');
    // Never the raw database slug.
    expect(options.description).not.toContain('wallet_to_account');
  });
});

describe('what the socket can actually deliver', () => {
  /*
   * A network boundary: Socket.IO hands over whatever arrived on the wire, so
   * each of these is a shape a handler indexing straight into the payload would
   * have thrown on — inside a listener, where nothing on screen reports it.
   */
  it('says nothing when there is no payload', () => {
    toastNotification(undefined);
    expect(toast).not.toHaveBeenCalled();
  });

  it('says nothing when the kind is missing', () => {
    toastNotification({ id: 'n-1' });
    expect(toast).not.toHaveBeenCalled();
  });

  it('says nothing when the kind is not a string', () => {
    toastNotification({ id: 'n-1', kind: 42 });
    expect(toast).not.toHaveBeenCalled();
  });

  it('does not toast a kind this build has not learned', () => {
    // The forward-compatible branch, asserted so it stays deliberate: the
    // backend may ship an event before the portal redeploys. A bare
    // "Notification" says nothing; the badge and the row still update.
    toastNotification({ id: 'n-1', kind: 'something.new' });

    expect(toast).not.toHaveBeenCalled();
  });

  it('never renders an ADMIN kind as real copy', () => {
    /*
     * A client socket joins `client:<id>` and an admin's joins `admin:<id>`, so
     * this should be unreachable. Asserted anyway: if room targeting ever
     * regressed, the failure must be NO toast rather than the portal
     * rendering "A withdrawal of $500 needs review" — copy that names another
     * client's money to whoever is holding the socket.
     */
    toastNotification({ id: 'n-1', kind: 'admin.withdrawal.requested' });

    expect(toast).not.toHaveBeenCalled();
  });

  it('omits the body when params are absent rather than rendering an empty line', () => {
    toastNotification({ id: 'n-1', kind: 'withdrawal.paid' });

    const [, options] = toast.mock.calls[0] as [string, { description?: string } | undefined];
    expect(options?.description).toBeUndefined();
  });

  it('ignores params that are not an object', () => {
    // An array or a string here would reach `vars()`, which reads named fields.
    toastNotification({ id: 'n-1', kind: 'withdrawal.paid', params: ['not', 'an', 'object'] });

    const [, options] = toast.mock.calls[0] as [string, { description?: string } | undefined];
    expect(options?.description).toBeUndefined();
  });

  it('offers a View action only when the caller can navigate', () => {
    toastNotification({ id: 'n-1', kind: 'withdrawal.paid', params: {} });
    const [, withoutRouter] = toast.mock.calls[0] as [string, { action?: unknown }];
    expect(withoutRouter?.action).toBeUndefined();

    vi.clearAllMocks();
    const onView = vi.fn();
    toastNotification({ id: 'n-1', kind: 'withdrawal.paid', params: {} }, onView);
    const [, withRouter] = toast.mock.calls[0] as [
      string,
      { action?: { onClick: () => void } } | undefined,
    ];

    expect(withRouter?.action).toBeDefined();
    withRouter?.action?.onClick();
    expect(onView).toHaveBeenCalledTimes(1);
    // `?.[0]` rather than `[0][0]`: `noUncheckedIndexedAccess` types an array
    // index as possibly-undefined, and the assertion below is what proves the
    // call happened — so reaching through it unguarded is a compile error.
    expect(onView.mock.calls[0]?.[0]).toMatch(/^\//);
  });
});

describe('money in a toast', () => {
  it('formats the amount rather than printing the raw decimal string', () => {
    /*
     * §6.1 — amounts cross the wire as strings at NUMERIC(28,8) scale. A body
     * reading "Withdrawal of 250.00000000 paid" is the raw column, and the
     * eight zeros are how a client learns the product does not format money.
     */
    toastNotification({
      id: 'n-1',
      kind: 'withdrawal.paid',
      params: { amount: '250.00000000', currency: 'USD' },
    });

    const [, options] = toast.mock.calls[0] as [string, { description?: string }];
    expect(options.description).toBeDefined();
    expect(options.description).not.toContain('250.00000000');
    expect(options.description).toContain('250');
  });

  it('survives an amount too large for a double', () => {
    // 12345678901.23456789 through a float is already wrong before formatting.
    toastNotification({
      id: 'n-1',
      kind: 'withdrawal.paid',
      params: { amount: '12345678901.23456789', currency: 'USD' },
    });

    const [, options] = toast.mock.calls[0] as [string, { description?: string }];
    expect(options.description).toContain('12,345,678,901');
  });
});
