import { describe, expect, it } from 'vitest';
import { firstOwed, owedMessage } from './owed-message';

/**
 * Continue shows what the SERVER says a step still owes, in the client's words.
 * The one thing decided here is what only the browser knows: a photo chosen and
 * not yet confirmed.
 */

type Kind = 'choice' | 'page' | 'upload' | 'answer' | 'invalid' | 'returned';
const owed = (kind: Kind, over: Record<string, unknown> = {}) => ({
  id: 'doc_back',
  label: 'National ID: Back Side',
  kind,
  ...over,
});

describe('firstOwed', () => {
  it('is the first thing missing, then the first BLOCKING return, else nothing', () => {
    const missing = owed('page');
    const returnedAnswer = owed('returned', { id: 'firstName', blocking: false });
    const returnedDoc = owed('returned', { id: 'doc_front', blocking: true });
    expect(firstOwed({ slug: 'x', complete: false, missing: [missing], returned: [] })).toBe(
      missing,
    );
    expect(
      firstOwed({
        slug: 'x',
        complete: false,
        missing: [],
        returned: [returnedAnswer, returnedDoc],
      }),
    ).toBe(returnedDoc);
    expect(
      firstOwed({ slug: 'x', complete: true, missing: [], returned: [returnedAnswer] }),
    ).toBeNull();
    expect(firstOwed(undefined)).toBeNull();
  });
});

describe('owedMessage', () => {
  it('names what to upload — or asks to CONFIRM the photo already chosen for that slot', () => {
    expect(owedMessage(owed('page'))).toBe('Please upload: National ID: Back Side');
    expect(owedMessage(owed('page'), { doc_back: true })).toMatch(/tap "Use this"/);
  });

  it('speaks each kind in its own words', () => {
    expect(owedMessage(owed('choice'))).toMatch(/Choose which document/);
    expect(owedMessage(owed('answer', { label: 'Landlord' }))).toBe('Please fill in: Landlord');
    expect(owedMessage(owed('invalid', { message: 'You must be at least 18.' }))).toBe(
      'You must be at least 18.',
    );
    expect(owedMessage(owed('returned', { label: 'Passport' }))).toMatch(
      /upload a new Passport — the reviewer returned/,
    );
  });
});
