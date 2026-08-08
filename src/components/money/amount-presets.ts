import Decimal from 'decimal.js';

/**
 * The quick-pick amounts, and the rule for which of them to offer.
 *
 * Round numbers, because most deposits and transfers are round numbers and
 * typing on a phone is the slowest part of these flows.
 */
export const AMOUNT_PRESETS = ['50', '100', '250', '500', '1000'];

/**
 * The presets that fall inside a range.
 *
 * A preset the client cannot use is worse than no preset: it fills the field
 * with a value the form then refuses, so the one-tap control produces an error
 * message. Anything outside the bounds is dropped rather than clamped — a button
 * labelled `$500` that enters `$412.30` is a lie about what it does.
 *
 * decimal.js, never `Number()`: these compare against NUMERIC(28,8) strings.
 * `null` for either bound means "no limit on that side".
 */
export function presetsWithin(min?: string | null, max?: string | null): string[] {
  const floor = min ? new Decimal(min) : null;
  const ceiling = max ? new Decimal(max) : null;

  return AMOUNT_PRESETS.filter((preset) => {
    const value = new Decimal(preset);
    if (floor && value.lessThan(floor)) return false;
    if (ceiling && value.greaterThan(ceiling)) return false;
    return true;
  });
}
