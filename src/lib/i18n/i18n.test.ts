import { describe, expect, it } from 'vitest';
import { currentLocale, direction, messages, t } from './index';
import type { MessageKey } from './messages';

/**
 * The translation seam — `docs/CLAUDE.md` "Designed for change", seam 4.
 *
 * What is worth pinning here is not "does a lookup work" but the properties that
 * make the seam survive contact with a second locale:
 *
 *  - a mistyped key must not compile (checked by the type-level assertion below,
 *    not at runtime — a runtime test cannot observe a compile error),
 *  - a missing interpolation must be visible rather than render "undefined",
 *  - no message may be empty, because an empty string renders as nothing and
 *    looks like a layout bug rather than a missing translation,
 *  - `dir` must flip for Arabic, since FSD §10 names RTL specifically and the
 *    layout sweep is verified by setting the locale and looking.
 */

describe('t() — lookup and interpolation', () => {
  it('returns the message for a key', () => {
    expect(t('auth.login.submit')).toBe('Sign in');
  });

  it('fills named placeholders', () => {
    expect(t('wallet.onHold', { amount: '$10.00', total: '$250.00' })).toBe(
      '$10.00 on hold · $250.00 total',
    );
  });

  it('accepts numbers as well as strings', () => {
    expect(t('kyc.uploadTooLarge', { size: '12.4', limit: 10 })).toContain('12.4 MB');
    expect(t('kyc.uploadTooLarge', { size: '12.4', limit: 10 })).toContain('10 MB');
  });

  it('leaves an unsupplied placeholder visible instead of rendering undefined', () => {
    // "on hold: undefined" is a bug someone screenshots and asks about;
    // "{total}" is a bug the developer fixes before it ships.
    expect(t('wallet.onHold', { amount: '$10.00' })).toBe('$10.00 on hold · {total} total');
  });

  it('ignores extra variables rather than throwing', () => {
    expect(t('auth.login.submit', { unused: 'x' })).toBe('Sign in');
  });
});

describe('the catalogue itself', () => {
  const entries = Object.entries(messages) as [MessageKey, string][];

  it('has no empty message', () => {
    const empty = entries.filter(([, value]) => value.trim() === '').map(([key]) => key);
    // An empty string renders as nothing, which reads as a broken layout rather
    // than a missing translation — the hardest kind of i18n bug to spot.
    expect(empty).toEqual([]);
  });

  it('uses dotted lower-case keys throughout', () => {
    const malformed = entries.map(([key]) => key).filter((key) => !/^[a-z][\w.]*$/.test(key));
    expect(malformed).toEqual([]);
  });

  it('declares every placeholder with a name', () => {
    // `{0}` style positional placeholders are what break when word order changes
    // between languages — the exact failure this module exists to avoid.
    const positional = entries.filter(([, value]) => /\{\d+\}/.test(value)).map(([key]) => key);
    expect(positional).toEqual([]);
  });
});

describe('direction — RTL is a layout problem, and this is where it starts', () => {
  it('is ltr for English', () => {
    expect(direction('en')).toBe('ltr');
  });

  it('is rtl for Arabic, which FSD §10 names explicitly', () => {
    expect(direction('ar')).toBe('rtl');
  });

  it('defaults to the current locale', () => {
    expect(direction()).toBe(direction(currentLocale()));
  });
});

/**
 * Type-level guard, not a runtime one.
 *
 * The value of typed keys is that `t('auth.lgoin.title')` fails to COMPILE. This
 * line documents that contract where a reader will see it; the actual
 * enforcement is `npm run type-check`, and uncommenting the second line below
 * must break the build.
 */
const _validKey: MessageKey = 'auth.login.submit';
void _validKey;
// @ts-expect-error — a key that is not in the catalogue must not type-check.
const _invalidKey: MessageKey = 'auth.lgoin.title';
void _invalidKey;
