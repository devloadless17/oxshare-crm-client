import { describe, expect, it } from 'vitest';
import { normaliseReferralCode } from './referral-code';

/**
 * The code shown to the client and the code sent to the API are the same
 * value, so this rule has to match `common/referral-code.ts` in the backend.
 * Where they disagree, the client is shown a code that looks accepted and is
 * not — which is the defect this exists for.
 */
describe('normaliseReferralCode', () => {
  it('survives the debris a referral link collects', () => {
    // The reported case first: a backslash typed at the end of the address.
    expect(normaliseReferralCode('ABCD2345\\')).toBe('ABCD2345');
    expect(normaliseReferralCode('ABCD2345/')).toBe('ABCD2345');
    expect(normaliseReferralCode('"ABCD2345"')).toBe('ABCD2345');
    expect(normaliseReferralCode('  abcd2345 ')).toBe('ABCD2345');
    expect(normaliseReferralCode('ABCD-2345')).toBe('ABCD2345');
    expect(normaliseReferralCode('ABCD2345​')).toBe('ABCD2345');
  });

  it('keeps letters the MINT alphabet excludes, because stored codes contain them', () => {
    /*
     * Codes are minted from an alphabet with no O/0/I/1/L, but that governs
     * generation, not storage: seeded partner rows hold `E2EPARTL1`. Stripping
     * by the mint alphabet would break those links — a fix for lost
     * attribution that loses attribution.
     */
    expect(normaliseReferralCode('E2EPARTL1')).toBe('E2EPARTL1');
    expect(normaliseReferralCode('protol01/')).toBe('PROTOL01');
  });

  it('never invents a character', () => {
    // `0`→`O` and `1`→`I` look helpful and are guesses about which partner to
    // pay. Both characters can appear in different partners' stored codes.
    expect(normaliseReferralCode('PR0T0L01')).toBe('PR0T0L01');
  });

  it('answers undefined when nothing usable is left', () => {
    expect(normaliseReferralCode('///')).toBeUndefined();
    expect(normaliseReferralCode('   ')).toBeUndefined();
    expect(normaliseReferralCode('')).toBeUndefined();
    expect(normaliseReferralCode(null)).toBeUndefined();
    expect(normaliseReferralCode(undefined)).toBeUndefined();
  });
});
