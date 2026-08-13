/**
 * Scrubs any part-finished withdrawal left in `sessionStorage`.
 *
 * ## What this used to be, and why only the clear survives
 *
 * `/withdraw` was a two-step form: state the withdrawal, then confirm it with a
 * six-digit code emailed to the account address. A refresh on the confirm step
 * dropped every field, and that was worse than losing typing — the code already
 * in the client's inbox was bound by HMAC to the intent it was issued for, so
 * re-entering the same amount minted a NEW intent and the emailed code could
 * never be accepted. The client typed the six digits they were sent, was told
 * they were wrong, and nothing on screen explained it.
 *
 * So the intent was persisted and restored. The confirmation code is gone now —
 * from the form, the API and the database — and the form is one step, so there
 * is no confirm step to refresh onto and nothing writes an intent any more.
 * `saveWithdrawIntent` and `readWithdrawIntent` went with it.
 *
 * ## Why the CLEAR is kept
 *
 * It is called from the two places a session ends (`UserContext`'s logout and
 * the `signed-out` handler) and from `clearSession` in the API client, on the
 * reasoning recorded there: the stored value held an amount and a payout
 * destination, and `sessionStorage` on a shared device would otherwise carry one
 * person's financial detail into the next person's session.
 *
 * That is still worth doing for one release. A browser that had the old build
 * open can still be holding the key, and `sessionStorage` only dies with the
 * tab — not with the deploy. Once nobody can be carrying a stale key, this
 * module and its three call sites can go entirely.
 */

const INTENT_KEY = 'oxshare_withdraw_intent';
const WRITTEN_AT_KEY = 'oxshare_withdraw_intent_written_at';

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    // Safari in private mode, and any browser with storage disabled. A portal
    // that throws here would be a portal that cannot render, so a client who
    // simply loses the scrub is the right failure.
    return null;
  }
}

export function clearWithdrawIntent(): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(INTENT_KEY);
    store.removeItem(WRITTEN_AT_KEY);
  } catch {
    /* nothing to release */
  }
}
