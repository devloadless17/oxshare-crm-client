import { redirect } from 'next/navigation';
import { fetchKycStatus } from '@/lib/kyc-server-status';

/*
 * NEVER PRERENDERED. This route's whole job is to read one client's KYC status
 * and act on it, so a build-time snapshot would be somebody else's answer baked
 * into HTML — and `cookies()` makes it dynamic at runtime regardless. Saying so
 * explicitly also keeps the build from evaluating this module's config while
 * collecting routes, which fails when NEXT_PUBLIC_API_BASE_URL is set at deploy
 * time rather than at build time.
 */
export const dynamic = 'force-dynamic';

/**
 * `/kyc` is a signpost, not a screen — it decides where the client belongs and
 * sends them there.
 *
 * ## It caused an infinite redirect loop, and this is what fixed it
 *
 * The client-side version worked out a target step from how much data the
 * client had SAVED — first name present means step 2, document uploaded means
 * step 3, and so on — while the gate on the step route decided from their
 * STATUS. For a rejected client the two disagreed permanently: every field is
 * filled in, so this page said "step 5", and the step route said "you should be
 * reading why it came back". The browser bounced between them without end.
 *
 * Two effects with two different notions of "where does this client belong" is
 * the bug. There is one rule now and it lives in `lib/kyc-server-status.ts`:
 * anything other than an unfinished submission goes to the terminal screen, and
 * `canOpenKycForm` is the same predicate the step route uses. They cannot
 * disagree because they are the same function.
 *
 * The second cause was mechanical and worth naming: that effect listed
 * `statusQuery.data` in its dependencies. React Query hands back a fresh object
 * identity on every render, so the effect re-ran on each one and called
 * `router.replace` each time — a loop that would have fired even if the
 * destination had been right.
 *
 * ## No spinner any more
 *
 * The old page rendered "Resuming your verification…" while it fetched. On the
 * server there is nothing to wait for: the redirect is decided before any HTML
 * is sent, so the client's browser goes straight to the destination.
 */
export default async function KycPage() {
  const status = await fetchKycStatus();

  /*
   * `rejected` goes to the terminal screen deliberately, even though the form
   * is open to them. They need the reason and the returned-field list before
   * they start editing, or they resubmit the same mistake — the re-apply button
   * there is what opens the form.
   *
   * A null status (the read failed, or there is no submission yet) falls
   * through to the form, which is where a client who has never started belongs.
   */
  if (status !== null && status !== 'not_started' && status !== 'in_progress') {
    redirect('/kyc/submitted');
  }

  redirect('/kyc/step/1');
}
