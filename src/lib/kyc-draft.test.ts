import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  KYC_DRAFT_TTL_MS,
  clearKycDraft,
  forgetEdits,
  forgetSaved,
  readPersonalDraft,
  readUploadsDraft,
  rememberEdit,
  writePersonalDraft,
  writeUploadsDraft,
} from './kyc-draft';

/**
 * THE HALF-FILLED KYC FORM IS PERSONAL DATA WITH A LIFETIME, and nothing checked it.
 *
 * `kyc-draft.ts` keeps a client's date of birth, nationality and address in
 * `sessionStorage` while they work through the wizard, and its own docblock is
 * unusually clear about why that needs a lifecycle: on a shared or public
 * machine the next person could otherwise read the previous client's details out
 * of the console. It ends with
 *
 *     /** Exported for the spec — the window is a decision, not a magic number. *​/
 *     export const KYC_DRAFT_TTL_MS = DRAFT_TTL_MS;
 *
 * There was no spec. The export was written for a file that did not exist, and
 * the module's three guarantees — expire on read, expire on BOTH readers, clear
 * everything — were carried entirely by the comment describing them.
 *
 * That is the shape this codebase has been bitten by twice today already: §6.4's
 * append-only ledger outlived its triggers by a month, and `kyc-config.store.ts`
 * promised an enforcement retired in August. A guarantee stated in a comment is a
 * claim to check.
 *
 * ## The distinction every case here turns on
 *
 * "The reader returns nothing" and "the data is gone" are NOT the same, and only
 * the second is the property that matters. A reader that filtered an expired
 * draft while leaving it in `sessionStorage` would pass any test asserting the
 * return value and would leak exactly the way the module exists to prevent —
 * the console still shows it. So every expiry case asserts the STORAGE, not just
 * the return.
 */

const PERSONAL_KEY = 'oxshare_kyc_personal';
const UPLOADS_KEY = 'oxshare_kyc_uploads';
const WRITTEN_AT_KEY = 'oxshare_kyc_draft_written_at';

/** What a person could read out of the console, whatever the readers return. */
const rawStorage = () => ({
  personal: window.sessionStorage.getItem(PERSONAL_KEY),
  uploads: window.sessionStorage.getItem(UPLOADS_KEY),
  writtenAt: window.sessionStorage.getItem(WRITTEN_AT_KEY),
});

beforeEach(() => {
  window.sessionStorage.clear();
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('a draft within its window', () => {
  it('comes back, which is the feature the rest of this file constrains', () => {
    writePersonalDraft({ dateOfBirth: '1990-06-15', nationality: 'Lebanon' });
    writeUploadsDraft({ passport: true });

    // Non-vacuous: without this, every expiry assertion below could pass against
    // a module that simply never stores anything.
    expect(readPersonalDraft()).toEqual({ dateOfBirth: '1990-06-15', nationality: 'Lebanon' });
    expect(readUploadsDraft()).toEqual({ passport: true });
  });

  it('runs its window from the LAST edit, so an active typist never loses work', () => {
    vi.useFakeTimers();
    writePersonalDraft({ dateOfBirth: '1990-06-15' });

    // Nearly expired, then touched again — the clock must restart.
    vi.advanceTimersByTime(KYC_DRAFT_TTL_MS - 1_000);
    writePersonalDraft({ dateOfBirth: '1990-06-15', address: 'MatrixStreet 12' });
    vi.advanceTimersByTime(KYC_DRAFT_TTL_MS - 1_000);

    expect(
      readPersonalDraft(),
      'the window ran from the FIRST write, so a form being actively filled in vanished',
    ).toEqual({ dateOfBirth: '1990-06-15', address: 'MatrixStreet 12' });
  });
});

describe('an expired draft', () => {
  it('is REMOVED from storage, not merely hidden from the reader', () => {
    vi.useFakeTimers();
    writePersonalDraft({ dateOfBirth: '1990-06-15', address: 'MatrixStreet 12' });
    vi.advanceTimersByTime(KYC_DRAFT_TTL_MS + 1);

    expect(readPersonalDraft()).toEqual({});

    /*
     * THE ASSERTION THAT MATTERS. A reader that filtered by age and left the row
     * in place would satisfy the line above and still show the previous client's
     * address to whoever opens the console next — which is the entire reason
     * this module exists.
     */
    expect(rawStorage(), 'the expired draft is still readable from the console').toEqual({
      personal: null,
      uploads: null,
      writtenAt: null,
    });
  });

  it('expires through the UPLOADS reader too, not only the personal one', () => {
    /*
     * The module says an expiry "checked on write, or only on the first of two
     * keys, would leave the data readable by whichever path forgot". So the
     * uploads reader is driven on its own, against a tab that never called the
     * personal one — which is the arrangement that would hide a one-sided check.
     */
    vi.useFakeTimers();
    writePersonalDraft({ dateOfBirth: '1990-06-15' });
    writeUploadsDraft({ passport: true });
    vi.advanceTimersByTime(KYC_DRAFT_TTL_MS + 1);

    expect(readUploadsDraft()).toEqual({});
    expect(
      rawStorage().personal,
      'reading UPLOADS expired the uploads key and left the personal data behind',
    ).toBeNull();
  });
});

describe('a draft with no timestamp', () => {
  it('is discarded — unknown age is the case to be strictest about', () => {
    /*
     * Data written before this module gained a lifecycle. Its age cannot be
     * known, so it cannot be shown to be inside any window, and the module
     * chooses to drop it rather than grandfather it in.
     */
    window.sessionStorage.setItem(PERSONAL_KEY, JSON.stringify({ dateOfBirth: '1990-06-15' }));

    expect(readPersonalDraft()).toEqual({});
    expect(rawStorage().personal, 'an undateable draft was kept').toBeNull();
  });
});

describe('clearing', () => {
  it('removes every key, including the timestamp', () => {
    writePersonalDraft({ dateOfBirth: '1990-06-15' });
    writeUploadsDraft({ passport: true });
    expect(rawStorage().personal, 'nothing was stored — the clear proves nothing').not.toBeNull();

    clearKycDraft();

    expect(rawStorage()).toEqual({ personal: null, uploads: null, writtenAt: null });
  });

  it('leaves other keys in sessionStorage alone', () => {
    /*
     * It shares a namespace with whatever else the tab holds. Clearing the whole
     * store would work for this module and take the session-hint and any other
     * tab state with it.
     */
    window.sessionStorage.setItem('something_else', 'keep me');
    writePersonalDraft({ dateOfBirth: '1990-06-15' });

    clearKycDraft();

    expect(window.sessionStorage.getItem('something_else')).toBe('keep me');
  });
});

describe('the window itself', () => {
  it('is twelve hours — a decision, restated here so a silent change fails', () => {
    /*
     * Pinned deliberately. The module's comment argues the length: long enough
     * that someone starting on their commute and finishing that evening keeps
     * their work, short enough that it does not survive to the next day on a
     * machine somebody else uses. Shortening it costs people their work;
     * lengthening it retains personal data past the reasoning above. Either may
     * be right, and either should be a decision somebody makes rather than a
     * constant somebody edits.
     */
    expect(KYC_DRAFT_TTL_MS).toBe(12 * 60 * 60 * 1000);
  });
});

describe('the draft holds UNSAVED EDITS, never a copy of the form', () => {
  /*
   * Found by kyc-builtin-extras.spec.ts: the whole form was written here, server
   * values included, so an answer saved elsewhere was beaten on the next visit
   * by the stale copy — and autosave then wrote the stale one back.
   */
  it('remembers one edit without touching the others', () => {
    rememberEdit('phone', '+961 70 1');
    rememberEdit('city', 'Beirut');
    expect(readPersonalDraft()).toEqual({ phone: '+961 70 1', city: 'Beirut' });
  });

  it('forgets an edit once the server holds it as typed — and keeps one typed since', () => {
    rememberEdit('phone', '+961 70 123 456');
    rememberEdit('city', 'Tyre');
    forgetSaved({ phone: '+961 70 123 456', city: 'Beirut' });
    expect(readPersonalDraft()).toEqual({ city: 'Tyre' });
  });

  it('forgets named edits whatever they hold — a card the document on file overrides', () => {
    rememberEdit('__docChoice__document', 'passport');
    rememberEdit('city', 'Tyre');
    forgetEdits(['__docChoice__document']);
    expect(readPersonalDraft()).toEqual({ city: 'Tyre' });
  });
});
