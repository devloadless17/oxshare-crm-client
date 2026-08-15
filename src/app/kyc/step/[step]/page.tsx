import { redirect } from 'next/navigation';
import { canOpenKycForm, fetchKycStatus } from '@/lib/kyc-server-status';
import { KycStepForm } from '@/components/kyc/kyc-step-form';

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
 * The KYC form, behind a SERVER-SIDE gate.
 *
 * ## The page does not render for someone who may not use it
 *
 * This was a client component that fetched its own status and redirected in an
 * effect. That meant the whole form painted first, and only then bounced — so
 * an approved client saw their own onboarding form flash up before being sent
 * away, and a rejected one saw the form before the reason it came back.
 *
 * Deciding here means no client JavaScript runs at all for a status that may
 * not open the form: `redirect()` throws before `<KycStepForm>` is ever
 * rendered, and the browser is handed the destination instead.
 *
 * ## Not the middleware, which is where this belongs on paper
 *
 * `src/proxy.ts` runs at the edge with no signing key — it can see a session
 * cookie EXISTS but cannot read a claim inside it, and its header records the
 * bug that taught it. Handing it a `kyc_status` cookie to read would be worse:
 * status changes server-side while the client is signed in, so the cookie is
 * stale from the moment it is written and a client approved a minute ago would
 * still be treated as pending. See `lib/kyc-server-status.ts`.
 */
export default async function KycStepPage() {
  const status = await fetchKycStatus();

  /*
   * `submitted`, `under_review` and `approved` go to the terminal screen — the
   * API refuses their writes anyway, so the form could only waste their time.
   *
   * `rejected` renders. That is the whole point of the state: they have work to
   * do, and the form shows which fields were returned.
   */
  if (!canOpenKycForm(status)) redirect('/kyc/submitted');

  return <KycStepForm />;
}
