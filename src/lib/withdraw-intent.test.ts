import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import {
  clearWithdrawIntent,
  readWithdrawIntent,
  saveWithdrawIntent,
  type WithdrawIntent,
} from './withdraw-intent';

/**
 * A withdrawal survives a refresh, and survives it SAFELY.
 *
 * The screen held the step, amount, destination and idempotency key in
 * component state alone, so reloading the confirm step cleared everything. That
 * is worse than losing typing: the code already in the client's inbox is bound
 * by HMAC to the intent it was issued for, so re-entering the same amount mints
 * a new intent and the emailed code can never be accepted. The client is told
 * their code is wrong, with nothing to explain why.
 *
 * These pin the three properties that make restoring it safe rather than merely
 * convenient — every one of them is on a money path.
 */

const INTENT: WithdrawIntent = {
  amount: '100.50000000',
  currency: 'USD',
  destination: '+96170123456',
  idempotencyKey: 'idem-abc-123',
  otpRequired: true,
};

beforeEach(() => {
  window.sessionStorage.clear();
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('a part-finished withdrawal', () => {
  it('comes back exactly as it went in', () => {
    saveWithdrawIntent(INTENT);
    expect(readWithdrawIntent()).toEqual(INTENT);
  });

  it('keeps the idempotency key, which is what stops a double withdrawal', () => {
    /*
     * The load-bearing assertion in this file.
     *
     * The key names the client's INTENT (R-5.2), and it used to be a `useRef` —
     * so it died with the refresh. A client who submitted, lost the response to
     * a dropped connection, and reloaded would submit again under a NEW key,
     * and the server would correctly read that as a second, different
     * withdrawal. The constraint that collapses duplicates is keyed on this
     * value; losing it removes the protection entirely.
     */
    saveWithdrawIntent(INTENT);
    expect(readWithdrawIntent()?.idempotencyKey).toBe('idem-abc-123');
  });

  it('never stores the code itself', () => {
    saveWithdrawIntent(INTENT);
    // The intent is not a credential; the OTP is. Leaving a live withdrawal code
    // in sessionStorage on a shared device hands the next person the one factor
    // the amount and destination cannot give them.
    const stored = JSON.parse(
      window.sessionStorage.getItem('oxshare_withdraw_intent') ?? '{}',
    ) as Record<string, unknown>;

    // By KEY, not by substring — `otpRequired` is stored and legitimately
    // contains the letters "otp". What must never be here is the code.
    expect(Object.keys(stored)).not.toContain('otp');
    expect(Object.keys(stored).sort()).toEqual([
      'amount',
      'currency',
      'destination',
      'idempotencyKey',
      'otpRequired',
    ]);
  });

  it('expires, so an abandoned withdrawal is not resumed later', () => {
    saveWithdrawIntent(INTENT);
    // Sixteen minutes: past the fifteen-minute window. The emailed code expires
    // server-side on roughly this scale, so restoring an older intent would
    // reproduce the very "this code is wrong" confusion this module removes.
    vi.setSystemTime(Date.now() + 16 * 60 * 1000);
    expect(readWithdrawIntent()).toBeNull();
  });

  it('is dropped entirely rather than restored in part', () => {
    // A partial restore would put a money form into a state the client never
    // chose — an amount with no destination, say, on a step where the fields
    // are locked and cannot be corrected.
    window.sessionStorage.setItem(
      'oxshare_withdraw_intent',
      JSON.stringify({ amount: '100', currency: 'USD' }),
    );
    window.sessionStorage.setItem('oxshare_withdraw_intent_written_at', String(Date.now()));
    expect(readWithdrawIntent()).toBeNull();
  });

  it('survives a malformed entry without throwing', () => {
    // Anyone can hand-edit sessionStorage. A throw here is a blank withdrawal
    // screen.
    window.sessionStorage.setItem('oxshare_withdraw_intent', '{not json');
    window.sessionStorage.setItem('oxshare_withdraw_intent_written_at', String(Date.now()));
    expect(() => readWithdrawIntent()).not.toThrow();
    expect(readWithdrawIntent()).toBeNull();
  });

  it('is gone once cleared', () => {
    saveWithdrawIntent(INTENT);
    clearWithdrawIntent();
    expect(readWithdrawIntent()).toBeNull();
    // Both keys, not just the payload — a stray timestamp is how a "cleared"
    // store comes back to life after the next write.
    expect(window.sessionStorage.getItem('oxshare_withdraw_intent_written_at')).toBeNull();
  });
});
