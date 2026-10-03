import { direction } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';

/**
 * Left-to-right runs inside right-to-left text.
 *
 * An Arabic page lays its text out right to left, and the Unicode bidi
 * algorithm then REORDERS anything inside it that is not Arabic: `-$5.00`
 * reads `$5.00-`, `1,250.00 USDT` reads `USDT 1,250.00`, and a phone number
 * grouped `+961 70 123 456` comes out with its groups in reverse. Nothing about
 * the figure changed, which is exactly why it is dangerous on a money screen —
 * a sign moved to the other end looks like a different number.
 *
 * `ltr()` wraps the text in LEFT-TO-RIGHT ISOLATE … POP DIRECTIONAL ISOLATE
 * (U+2066 … U+2069): the run is laid out left to right as one unit, and the
 * sentence around it treats it as a single neutral character. Being characters
 * rather than markup, it works where an element cannot go — a `t()`
 * placeholder, a toast, an `aria-label`, an `<option>`, the printed statement.
 *
 * In a left-to-right page it returns the text UNCHANGED, so English output —
 * and every test asserting it — is byte-for-byte what it was.
 *
 * For an element whose whole content is such a run, `<Ltr>` (components/ltr)
 * does the same with markup.
 */
const LRI = '⁦';
const PDI = '⁩';

export function ltr(text: string): string {
  if (direction() !== 'rtl' || text === '') return text;
  return LRI + text + PDI;
}

/**
 * `formatMoney`, isolated for display. The ONE formatter is still
 * `lib/money.ts`; this only stops bidi reordering its output in Arabic. Use it
 * for anything a person reads, never for a value that is parsed or compared.
 */
export function moneyText(value: string, currency: string): string {
  return ltr(formatMoney(value, currency));
}
