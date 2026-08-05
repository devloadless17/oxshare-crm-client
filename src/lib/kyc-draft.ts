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
 *
 * AND IT EXPIRES. Clearing on logout and on submission covers the two moments
 * somebody DOES something. It does not cover the commonest one: a client starts
 * onboarding, gets as far as their date of birth, and abandons the tab. Nothing
 * in the flow ever fires again, so the personal data sat in that tab for as long
 * as it stayed open — which on a shared machine is however long until the next
 * person sits down.
 *
 * A stored timestamp fixes that with no cost to the feature it exists for: a
 * refresh, a back-button and a step-to-step navigation all happen in minutes, so
 * a draft older than the window below is one nobody is coming back to. Enforced
 * on READ rather than by a timer, because a timer does not run in a backgrounded
 * tab and the read is the only moment the value can actually leak.
 */

const PERSONAL_KEY = 'oxshare_kyc_personal';
const UPLOADS_KEY = 'oxshare_kyc_uploads';
const WRITTEN_AT_KEY = 'oxshare_kyc_draft_written_at';

/**
 * How long a half-filled form is worth keeping.
 *
 * Twelve hours rather than minutes: someone who starts onboarding on their
 * commute and finishes it that evening should not lose their work, and the
 * per-tab lifetime already bounds the common case. Short enough that data does
 * not survive to the next day on a machine somebody else uses.
 */
const DRAFT_TTL_MS = 12 * 60 * 60 * 1000;

/** SSR-safe: every helper below is a no-op on the server. */
function storage(): Storage | null {
  return typeof window === 'undefined' ? null : window.sessionStorage;
}

/**
 * Discards the draft if it has gone stale, and reports whether anything is left.
 *
 * Called from both readers, so an expired draft cannot be read even once — an
 * expiry checked on write, or only on the first of two keys, would leave the
 * data readable by whichever path forgot.
 */
function dropIfExpired(): boolean {
  const store = storage();
  if (!store) return false;

  const writtenAt = Number(store.getItem(WRITTEN_AT_KEY) ?? '0');
  // A draft with no timestamp predates this and is discarded rather than kept:
  // it is personal data whose age is unknown, which is the case to be strictest
  // about.
  if (!writtenAt || Date.now() - writtenAt > DRAFT_TTL_MS) {
    clearKycDraft();
    return false;
  }
  return true;
}

function stamp(): void {
  storage()?.setItem(WRITTEN_AT_KEY, String(Date.now()));
}

export function readPersonalDraft(): Record<string, string> {
  if (!dropIfExpired()) return {};
  return parseStringRecord(storage()?.getItem(PERSONAL_KEY) ?? null);
}

export function writePersonalDraft(values: Record<string, string>): void {
  storage()?.setItem(PERSONAL_KEY, JSON.stringify(values));
  // The window runs from the LAST edit, not the first: someone actively filling
  // the form in should never have it vanish underneath them.
  stamp();
}

export function readUploadsDraft(): Record<string, boolean> {
  if (!dropIfExpired()) return {};
  return parseBooleanRecord(storage()?.getItem(UPLOADS_KEY) ?? null);
}

export function writeUploadsDraft(values: Record<string, boolean>): void {
  storage()?.setItem(UPLOADS_KEY, JSON.stringify(values));
  stamp();
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
  store?.removeItem(WRITTEN_AT_KEY);
}

/** Exported for the spec — the window is a decision, not a magic number. */
export const KYC_DRAFT_TTL_MS = DRAFT_TTL_MS;
