import { describe, expect, it } from 'vitest';
import { acquisitionCodeFor } from './acquisition';

describe('acquisitionCodeFor', () => {
  it('prefers the URL, then the remembered cookie, and keeps a readable word intact', () => {
    expect(acquisitionCodeFor(' Omar-Farah/ ', 'oxshare_acq=other-desk')).toBe('omar-farah');
    expect(acquisitionCodeFor(null, 'a=1; oxshare_acq=o_f')).toBe('o_f');
    expect(acquisitionCodeFor(null, 'a=1')).toBeUndefined();
    // Too short to be anybody's link.
    expect(acquisitionCodeFor('ab', undefined)).toBeUndefined();
  });
});
