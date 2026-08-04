import { parseBooleanRecord, parseStringRecord } from './json';

/**
 * The half-filled KYC form, kept in `sessionStorage` between steps.
 *
 * WHY IT EXISTS: the onboarding flow is several pages, the fields are
 * admin-configurable, and losing a half-typed address to a refresh or a
 * back-button is the kind of friction that stops people finishing verification.
 * Restoring from `sessionStorage` in an effect (rather than a lazy `useState`
 * initialiser) is also what keeps the server render and the client render
 * agreeing — the server cannot read it.
 *
 * WHY IT NEEDS A LIFECYCLE, which is what this module adds:
 *
 * The values are personal data — the seeded step config asks for full name,
 * date of birth, nationality and address, and the admin builder can add more.
 * They were written on every keystroke and then never removed by anything.
 * `clearSession()` drops the session cookies; `logout()` clears the React Query
 * cache and does a full page load, and its comment claims that "guarantees no
 * wallet balance or KYC data survives the logout into the next session on a
 * shared device". `sessionStorage` survives a same-tab navigation, so for this
 * data the guarantee did not hold: on a shared or public machine the next person
 * could read the previous client's date of birth and address out of the console.
 *
 * Scoping the keys and the clearing into one module means there is exactly one
 * place that knows this data exists — so "who else has to remember to wipe it"
 * has a single answer rather than being spread across three screens.
 *
 * Deliberately NOT `localStorage`: `sessionStorage` is already per-tab and dies
 * with it, which is the shorter of the two lifetimes. This module makes the
 * clearing explicit rather than relying on the user closing the tab.
 */

const PERSONAL_KEY = 'oxshare_kyc_personal';
const UPLOADS_KEY = 'oxshare_kyc_uploads';

/** SSR-safe: every helper below is a no-op on the server. */
function storage(): Storage | null {
  return typeof window === 'undefined' ? null : window.sessionStorage;
}

export function readPersonalDraft(): Record<string, string> {
  return parseStringRecord(storage()?.getItem(PERSONAL_KEY) ?? null);
}

export function writePersonalDraft(values: Record<string, string>): void {
  storage()?.setItem(PERSONAL_KEY, JSON.stringify(values));
}

export function readUploadsDraft(): Record<string, boolean> {
  return parseBooleanRecord(storage()?.getItem(UPLOADS_KEY) ?? null);
}

export function writeUploadsDraft(values: Record<string, boolean>): void {
  storage()?.setItem(UPLOADS_KEY, JSON.stringify(values));
}

/**
 * Remove the draft. Called on logout and once a submission has been accepted.
 *
 * Both moments matter for different reasons: logout is the shared-device case,
 * and submission is the point at which the copy in the browser is redundant —
 * the server has the data, and keeping a second copy in the client's tab is
 * retaining personal data for no purpose.
 */
export function clearKycDraft(): void {
  const store = storage();
  store?.removeItem(PERSONAL_KEY);
  store?.removeItem(UPLOADS_KEY);
}
