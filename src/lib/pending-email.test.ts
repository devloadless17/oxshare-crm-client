import { afterEach, describe, expect, it, vi } from 'vitest';
import { forgetPendingEmail, recallPendingEmail, rememberPendingEmail } from './pending-email';

/**
 * The hand-off between sign-up and the code screen. Each case is a way the
 * stored value can be wrong and the screen must still ask for the address
 * rather than show a bad one back.
 */

const NOW = Date.UTC(2026, 8, 25, 12, 0, 0);
const KEY = 'oxshare.pending-email';

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('remember → recall', () => {
  it('returns what was remembered, trimmed, with its send time', () => {
    rememberPendingEmail('  ada@example.test ', NOW - 5_000);
    expect(recallPendingEmail(NOW)).toEqual({ email: 'ada@example.test', sentAt: NOW - 5_000 });
  });

  it('stores nothing for an empty address', () => {
    rememberPendingEmail('   ', NOW);
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('is gone once forgotten', () => {
    rememberPendingEmail('ada@example.test', NOW);
    forgetPendingEmail();
    expect(recallPendingEmail(NOW)).toBeNull();
  });
});

describe('a stored value that must not be shown back', () => {
  it.each([
    ['not JSON', 'ada@example.test'],
    ['JSON null', 'null'],
    ['no address', JSON.stringify({ sentAt: NOW })],
    ['not an address', JSON.stringify({ email: 'ada', sentAt: NOW })],
    [
      'an address longer than any real one',
      JSON.stringify({ email: `${'a'.repeat(250)}@x.io`, sentAt: NOW }),
    ],
    ['no send time', JSON.stringify({ email: 'ada@example.test' })],
    [
      'a send time that is not a number',
      JSON.stringify({ email: 'ada@example.test', sentAt: 'now' }),
    ],
    [
      'a send time in the future',
      JSON.stringify({ email: 'ada@example.test', sentAt: NOW + 3_600_000 }),
    ],
    [
      'a day-old hand-off',
      JSON.stringify({ email: 'ada@example.test', sentAt: NOW - 25 * 3_600_000 }),
    ],
  ])('reads %s as nothing remembered', (_label, raw) => {
    sessionStorage.setItem(KEY, raw);
    expect(recallPendingEmail(NOW)).toBeNull();
  });
});

describe('storage that refuses', () => {
  it('neither throws on write nor on read — the screen just asks for the address', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('SecurityError');
    });
    expect(() => rememberPendingEmail('ada@example.test', NOW)).not.toThrow();
    expect(recallPendingEmail(NOW)).toBeNull();
    expect(() => forgetPendingEmail()).not.toThrow();
  });
});
