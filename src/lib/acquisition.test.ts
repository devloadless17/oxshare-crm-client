import { describe, expect, it } from 'vitest';
import { acquisitionCodeFor } from './acquisition';

describe('acquisitionCodeFor', () => {
  it('prefers the URL, then the remembered cookie, and cleans both', () => {
    expect(acquisitionCodeFor(' k7m2q9xa/ ', 'oxshare_acq=OTHER123')).toBe('K7M2Q9XA');
    expect(acquisitionCodeFor(null, 'a=1; oxshare_acq=k7m2q9xa')).toBe('K7M2Q9XA');
    expect(acquisitionCodeFor(null, 'a=1')).toBeUndefined();
  });
});
