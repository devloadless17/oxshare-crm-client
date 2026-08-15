import { redirect } from 'next/navigation';
import { fetchKycStatus } from '@/lib/kyc-server-status';
import { KycOutcome } from '@/components/kyc/kyc-outcome';

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
 * Where a finished submission lands: pending, approved, or returned with the
 * reason and a way back in.
 *
 * The gate is the mirror of the step route's. A client who has NOT submitted
 * anything has no outcome to read, so they are sent to the form — otherwise
 * this page tells someone who never started that their documents are under
 * review.
 *
 * `rejected` stays here. The form is open to them, but the reason and the
 * returned-field list are on this screen and the re-apply button is what moves
 * them — sending them straight to the form would mean editing before reading
 * why it came back.
 */
export default async function KycSubmittedPage() {
  const status = await fetchKycStatus();

  // A null status is an unreadable one, and this page has nothing useful to say
  // without it — the form is the safe destination, since it is resumable and
  // reloads whatever was already saved.
  if (status === null || status === 'not_started' || status === 'in_progress') {
    redirect('/kyc/step/1');
  }

  return <KycOutcome />;
}
