import { describe, expect, it } from 'vitest';
import { withdrawalAmountProblem } from './withdraw-amount-hint';

/**
 * The withdrawal amount, checked under the field before submitting (owner,
 * 29 Sep 2026): the currency's minimum and maximum — the only withdrawal limits
 * there are — and the balance. The server refuses the same; this tells first.
 */
const USD = { min: '10.00000000', max: '50000.00000000' };

describe('withdrawalAmountProblem', () => {
  it('says nothing for an empty box or an amount in range', () => {
    expect(withdrawalAmountProblem('', 'USD', '1000', USD)).toBeNull();
    expect(withdrawalAmountProblem('250', 'USD', '1000', USD)).toBeNull();
  });

  it('names the minimum and the maximum', () => {
    expect(withdrawalAmountProblem('5', 'USD', '1000', USD)).toMatch(/minimum withdrawal is \$10/);
    expect(withdrawalAmountProblem('60000', 'USD', '100000', USD)).toMatch(
      /maximum withdrawal is \$50,000/,
    );
  });

  it('says what is available when the amount is more than the balance', () => {
    expect(withdrawalAmountProblem('1500', 'USD', '1000', USD)).toMatch(/\$1,000.00 available/);
  });

  it('still checks the balance before the catalogue has loaded', () => {
    expect(withdrawalAmountProblem('1500', 'USD', '1000', undefined)).toMatch(/available/);
    expect(withdrawalAmountProblem('5', 'USD', '1000', undefined)).toBeNull();
  });
});
