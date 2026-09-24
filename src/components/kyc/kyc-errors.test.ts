import { describe, expect, it } from 'vitest';
import { isNetworkError, kycErrorMessage } from './kyc-errors';

/**
 * Reported from production: a submission failing with the browser's bare
 * "Network Error", saying nothing about whether it had been sent.
 */
describe('a request that got no answer', () => {
  it('is recognised, and explained in words a client can act on', () => {
    const lost = { code: 'ERR_NETWORK', message: 'Network Error' };
    expect(isNetworkError(lost)).toBe(true);
    expect(kycErrorMessage(lost)).toMatch(/could not reach our servers/i);
    expect(kycErrorMessage(lost)).toMatch(/answers are saved/i);
  });

  it('is not a server refusal, which keeps the server’s own words', () => {
    const refused = {
      code: 'ERR_BAD_REQUEST',
      response: {
        data: { message: 'Please replace the documents the reviewer returned: Passport.' },
      },
    };
    expect(isNetworkError(refused)).toBe(false);
    expect(kycErrorMessage(refused)).toBe(
      'Please replace the documents the reviewer returned: Passport.',
    );
  });

  it('is not a cancelled request, which is the page moving on', () => {
    expect(isNetworkError({ code: 'ERR_CANCELED', name: 'CanceledError' })).toBe(false);
  });
});
