import { describe, expect, it, beforeEach } from 'vitest';
import {
  KYC_DRAFT_TTL_MS,
  clearKycDraft,
  readPersonalDraft,
  readUploadsDraft,
  writePersonalDraft,
  writeUploadsDraft,
} from './kyc-draft';

/**
 * The KYC draft holds personal data and must not outlive the session.
 *
 * The onboarding form is saved to `sessionStorage` on every keystroke so a
 * refresh or a back-button does not cost a half-typed address. The values are
 * the client's full name, date of birth, nationality and address — whatever the
 * admin step builder asks for — and nothing ever removed them.
 *
 * That mattered because `UserContext.logout()` does a full page load and its own
 * comment claims this "guarantees no wallet balance or KYC data survives the
 * logout into the next session on a shared device". `sessionStorage` survives a
 * same-tab navigation, so the guarantee held for React Query's cache and not for
 * the one store that actually contained identity data: on a shared machine the
 * next person could read the previous client's date of birth out of the console.
 *
 * These tests pin the lifecycle rather than the storage mechanism, so moving the
 * draft somewhere else later does not silently drop the clearing.
 */

const PERSONAL = { firstName: 'Ada', dateOfBirth: '1990-01-01', address: '12 Test Street' };
const UPLOADS = { doc_front: true, selfie: true };

beforeEach(() => {
  sessionStorage.clear();
});

describe('KYC draft — round trip', () => {
  it('restores what was written', () => {
    writePersonalDraft(PERSONAL);
    writeUploadsDraft(UPLOADS);

    expect(readPersonalDraft()).toEqual(PERSONAL);
    expect(readUploadsDraft()).toEqual(UPLOADS);
  });

  it('reads as empty when nothing has been written', () => {
    expect(readPersonalDraft()).toEqual({});
    expect(readUploadsDraft()).toEqual({});
  });

  it('survives corrupt storage rather than throwing into a render', () => {
    // A half-written value, a different app on the same origin, a manual edit —
    // a JSON parse failure here used to be free to reach the component.
    sessionStorage.setItem('oxshare_kyc_personal', '{not json');
    sessionStorage.setItem('oxshare_kyc_uploads', 'null');

    expect(readPersonalDraft()).toEqual({});
    expect(readUploadsDraft()).toEqual({});
  });
});

describe('KYC draft — clearing is what makes it safe', () => {
  it('removes personal data', () => {
    writePersonalDraft(PERSONAL);
    writeUploadsDraft(UPLOADS);

    clearKycDraft();

    expect(readPersonalDraft()).toEqual({});
    expect(readUploadsDraft()).toEqual({});
  });

  it('leaves no trace under the raw storage keys either', () => {
    writePersonalDraft(PERSONAL);
    writeUploadsDraft(UPLOADS);

    clearKycDraft();

    // Asserted against the keys directly, not just the readers: a reader that
    // returned `{}` for a value still present would look identical from the
    // outside and would still expose a date of birth to anyone opening devtools.
    expect(sessionStorage.getItem('oxshare_kyc_personal')).toBeNull();
    expect(sessionStorage.getItem('oxshare_kyc_uploads')).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });

  it('is safe to call when there is nothing to clear', () => {
    expect(() => clearKycDraft()).not.toThrow();
    expect(sessionStorage.length).toBe(0);
  });
});

/**
 * The draft must not outlive the SESSION, however the session ends.
 *
 * `UserContext.logout` cleared it, so a client who signs out deliberately was
 * covered. A session that DIES does not go through logout — a revoked token, a
 * 30-day refresh finally expiring, a password changed on another device all
 * take the 401 path in the axios interceptor, which called `clearSession()`.
 * That function only stopped the proactive refresh timer.
 *
 * So the previous client's full name, date of birth and address stayed readable
 * in `sessionStorage` across the hard navigation to the login screen — into the
 * next person's tab, on the shared machine that is the whole reason this data
 * is in `sessionStorage` rather than `localStorage`. Signing out was safe; being
 * signed out was not, and that is the case nobody chooses.
 */
describe('KYC draft — a dead session clears it too', () => {
  it('is cleared by clearSession, not only by an explicit logout', async () => {
    const { clearSession } = await import('./api/client');

    writePersonalDraft(PERSONAL);
    writeUploadsDraft(UPLOADS);

    clearSession();

    expect(sessionStorage.getItem('oxshare_kyc_personal')).toBeNull();
    expect(sessionStorage.getItem('oxshare_kyc_uploads')).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });
});

describe('the draft expires', () => {
  /*
   * Clearing on logout and on submission covers the two moments somebody DOES
   * something. It does not cover the commonest one: a client fills in their date
   * of birth, abandons the tab, and walks away. Nothing in the flow fires again,
   * so the personal data stayed readable for as long as the tab stayed open —
   * which on a shared machine is until the next person sits down.
   */
  it('returns nothing once the draft is older than the window', () => {
    writePersonalDraft({ dateOfBirth: '1990-01-01', address: '1 Test Street' });
    expect(readPersonalDraft()).toMatchObject({ dateOfBirth: '1990-01-01' });

    // Age the stamp rather than waiting twelve hours.
    window.sessionStorage.setItem(
      'oxshare_kyc_draft_written_at',
      String(Date.now() - KYC_DRAFT_TTL_MS - 1),
    );

    expect(readPersonalDraft()).toEqual({});
  });

  it('actually REMOVES the stale values, rather than just hiding them', () => {
    // Returning `{}` while leaving the data in sessionStorage would be theatre:
    // the leak is somebody reading the store, not the app reading it.
    writePersonalDraft({ dateOfBirth: '1990-01-01' });
    window.sessionStorage.setItem(
      'oxshare_kyc_draft_written_at',
      String(Date.now() - KYC_DRAFT_TTL_MS - 1),
    );

    readPersonalDraft();
    expect(window.sessionStorage.getItem('oxshare_kyc_personal')).toBeNull();
  });

  it('expires the uploads draft on the same read', () => {
    writeUploadsDraft({ passport: true });
    window.sessionStorage.setItem(
      'oxshare_kyc_draft_written_at',
      String(Date.now() - KYC_DRAFT_TTL_MS - 1),
    );

    expect(readUploadsDraft()).toEqual({});
  });

  it('discards a draft with no timestamp at all', () => {
    // Written before this existed: personal data of unknown age, which is the
    // case to be strictest about.
    window.sessionStorage.setItem('oxshare_kyc_personal', JSON.stringify({ name: 'Old' }));
    expect(readPersonalDraft()).toEqual({});
  });

  it('keeps the draft alive while the client is still typing', () => {
    // The window runs from the LAST edit. A form should never vanish underneath
    // somebody who is actively filling it in.
    writePersonalDraft({ name: 'Jane' });
    window.sessionStorage.setItem(
      'oxshare_kyc_draft_written_at',
      String(Date.now() - KYC_DRAFT_TTL_MS + 60_000),
    );
    writePersonalDraft({ name: 'Jane Doe' });

    expect(readPersonalDraft()).toMatchObject({ name: 'Jane Doe' });
  });
});
