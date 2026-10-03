import { describe, expect, it } from 'vitest';
import { messages, type MessageKey } from './messages';
import { arMessages } from './messages.ar';

/**
 * What `Record<MessageKey, string>` cannot see about the Arabic catalogue.
 *
 * The type already refuses a MISSING key. These catch the translation that
 * compiles and is still broken: a dropped `{amount}` renders a sentence with
 * the money missing, a renamed one renders `{montant}` on screen, and a plural
 * selector with three branches renders its whole source.
 */

const keys = Object.keys(messages) as MessageKey[];

/** `{name}` and the variable of every `{name:…}` selector. */
function placeholderNames(template: string): Set<string> {
  return new Set([...template.matchAll(/\{(\w+)(?::[^{}]*)?\}/g)].map((m) => m[1] ?? ''));
}

describe('the Arabic catalogue', () => {
  it('has exactly the English keys — none extra', () => {
    expect(Object.keys(arMessages).sort()).toEqual([...keys].sort());
  });

  it.each(keys)('%s keeps every placeholder, and adds none', (key) => {
    expect(placeholderNames(arMessages[key])).toEqual(placeholderNames(messages[key]));
  });

  it('writes every plural selector with two or six branches', () => {
    const malformed = keys.flatMap((key) =>
      [...arMessages[key].matchAll(/\{(\w+):([^{}]*)\}/g)]
        .map((m) => (m[2] ?? '').split('|').length)
        .filter((branches) => branches !== 2 && branches !== 6)
        .map((branches) => `${key}: ${branches} branches`),
    );
    expect(malformed).toEqual([]);
  });

  it('is translated — no value is left identical to a long English sentence', () => {
    // Short values (brand names, "{page} — OXShare", codes) may legitimately match.
    const untranslated = keys.filter(
      (key) => messages[key].length > 24 && arMessages[key] === messages[key],
    );
    expect(untranslated).toEqual([]);
  });

  it('every value contains Arabic script unless it is a brand or a pure template', () => {
    const latinOnly = keys.filter((key) => {
      const value = arMessages[key];
      const withoutPlaceholders = value.replace(/\{[^{}]*\}/g, '');
      return /[A-Za-z]{4,}/.test(withoutPlaceholders) && !/[؀-ۿ]/.test(value);
    });
    // Anything here must be a name that stays Latin in Arabic UIs.
    for (const key of latinOnly) {
      expect(arMessages[key]).toMatch(/OXShare|OxShare|Android|IBAN|USDT|@example.com/);
    }
  });
});
