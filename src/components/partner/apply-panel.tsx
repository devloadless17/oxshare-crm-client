'use client';

import * as React from 'react';
import { Handshake } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { KycGateDialog } from '@/components/kyc/kyc-gate-dialog';
import { useKycAccess } from '@/hooks/use-kyc-access';
import { useResource } from '@/hooks/use-resource';
import { useUser } from '@/context/UserContext';
import { apiErrorMessage } from '@/lib/api/errors';
import { partnerApi } from '@/lib/api/partner';
import { t } from '@/lib/i18n';

/**
 * One card, one choice, one button.
 *
 * There was a FORM here — motivation, expected volume, website — and it was
 * three questions standing between a client and a request the reviewer decides
 * from their ACCOUNT anyway. Verified identity and real activity are what an
 * approval turns on; a paragraph typed to get past a form adds nothing a
 * reviewer would weigh, and every field is one more reason to abandon. Those
 * fields are still optional in the DTO and this screen still does not ask.
 *
 * ## The agency is the exception, and it is a different KIND of question
 *
 * Which programme (وكالة) somebody wants to be appointed under is not
 * something a reviewer can read off the account — it decides what the partner
 * may sell, and getting it wrong means approving somebody onto terms they did
 * not ask for. So it is asked, and it is REQUIRED.
 *
 * Not "required when there is a choice", which is what this said and did. A
 * deployment with no agencies configured used to submit without one, and the
 * API appointed the partner under none — whose clients are then offered the
 * entire catalogue, the broadest grant in the system, reached by leaving a
 * field blank. The API refuses that now, so an empty list means there is
 * nothing to apply for and the panel says so.
 */
export function ApplyPanel({ onApplied }: { onApplied: () => void }) {
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [agencyId, setAgencyId] = React.useState('');

  const agencies = useResource(['partner', 'agencies'], (signal) => partnerApi.agencies(signal));

  /*
   * A programme is now REQUIRED, not required-when-there-happens-to-be-one.
   *
   * `mustChoose` was `options.length > 0`, so a deployment with no agencies
   * configured submitted without one and the API appointed the partner under
   * none — which grants their clients the entire product catalogue. The API
   * refuses that outright now, so the old branch would send a request that can
   * only 400.
   *
   * With the list empty there is nothing to apply FOR, and the panel says so
   * rather than offering a button whose only outcome is a refusal. That is an
   * operator's missing configuration, and naming it is more useful to the
   * client than a validation error about a field they were never shown.
   */
  const options = agencies.data ?? [];
  const noneOffered = agencies.status === 'ready' && options.length === 0;

  /*
   * ── The gate in front of the button ────────────────────────────────────────
   *
   * A partner is PAID and the referral code is the instrument, so both steps
   * have to be done before an application is worth taking: a confirmed address
   * and an approved identity.
   *
   * This is NOT the enforcement, and it is important that it reads that way.
   * `IbController` carries `EmailVerifiedGuard`, `apply()` refuses an
   * unverified address and an unverified identity in the service itself, and
   * `RequireAuth` bounces an unverified client off /partner on arrival. This is
   * the half that EXPLAINS the refusal before the click, the same relationship
   * `MoneyAction` has with the money routes — and it reuses that dialog rather
   * than growing a second one that would drift from it.
   *
   * Blocked until proven cleared, INCLUDING while the profile is still loading:
   * prompting somebody who turns out to be verified costs one extra click,
   * while letting an unverified client through means a refusal after the effort.
   */
  const { user } = useUser();
  const kyc = useKycAccess();
  const [gateOpen, setGateOpen] = React.useState(false);

  const emailUnverified = user?.emailVerified !== true;
  const blocked = emailUnverified || !kyc.approved;

  const submit = async () => {
    if (blocked) {
      setGateOpen(true);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      // Never the empty shape: the API refuses an application with no agency,
      // and the button below cannot be reached without one selected.
      await partnerApi.apply({ agencyId });
      /*
       * Refetch rather than assume the shape of success. The next render is
       * driven by what the server says — which is the difference between this
       * and the optimistic version `kyc/submitted` records, where a failed
       * request told the client they had submitted when they had not.
       */
      onApplied();
    } catch (err) {
      setError(apiErrorMessage(err, t('partner.submitFailed')));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border bg-muted/30 p-8 text-center">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Handshake className="h-8 w-8" aria-hidden="true" />
        </span>
        <h2 className="mt-5 text-xl font-bold tracking-tight">{t('partner.applyHeading')}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          {t('partner.applyIntro')}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-8">
        <h3 className="text-sm font-semibold">{t('partner.pitchHeading')}</h3>
        <ol className="mt-4 space-y-3">
          {[t('partner.pitchOne'), t('partner.pitchTwo'), t('partner.pitchThree')].map(
            (line, index) => (
              <li key={line} className="flex gap-3 text-sm">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                  {index + 1}
                </span>
                <span className="leading-relaxed text-muted-foreground">{line}</span>
              </li>
            ),
          )}
        </ol>

        {options.length > 0 && (
          <div className="mt-8 space-y-3">
            <h3 className="text-sm font-semibold">{t('partner.chooseAgency')}</h3>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t('partner.chooseAgencyHint')}
            </p>

            {/*
              RADIOS, not a dropdown. Each option carries a description and the
              products it lets the partner sell, which is the whole basis for
              choosing — a select collapses that to a name and makes the client
              pick between two words.
            */}
            <fieldset className="space-y-2">
              <legend className="sr-only">{t('partner.chooseAgency')}</legend>
              {options.map((agency) => (
                <label
                  key={agency.id}
                  className={`flex cursor-pointer gap-3 rounded-xl border p-4 transition-colors ${
                    agencyId === agency.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-muted/40'
                  }`}
                >
                  <input
                    type="radio"
                    name="agency"
                    value={agency.id}
                    checked={agencyId === agency.id}
                    onChange={() => {
                      setAgencyId(agency.id);
                      setError(null);
                    }}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                  />
                  <span className="min-w-0 space-y-1">
                    <span className="block text-sm font-semibold">{agency.name}</span>
                    {agency.description && (
                      <span className="block text-xs leading-relaxed text-muted-foreground">
                        {agency.description}
                      </span>
                    )}
                    {agency.products.length > 0 && (
                      <span className="block text-[11px] text-muted-foreground">
                        {t('partner.agencySells', { products: agency.products.join(', ') })}
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </fieldset>
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="mt-6 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
          >
            {error}
          </p>
        )}

        {noneOffered && (
          /*
             An operator has configured no agencies, so there is nothing to
             apply for. Named as what it is — the alternative is a live button
             whose only outcome is a validation error about a field the client
             was never shown.
          */
          <p
            role="note"
            className="mt-8 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs leading-relaxed text-foreground"
          >
            {t('partner.noAgenciesOffered')}
          </p>
        )}

        <div className="mt-8 space-y-3">
          <Button
            type="button"
            size="lg"
            className="w-full"
            loading={submitting}
            /*
             * Disabled until a programme is picked, and while the list is still
             * in flight — submitting in that window would send no agency, which
             * the API refuses. `!agencyId` is now unconditional rather than
             * gated on the list being non-empty: there is no valid application
             * without one.
             */
            disabled={agencies.status === 'loading' || !agencyId}
            onClick={() => void submit()}
          >
            {submitting ? t('partner.submitting') : t('partner.submit')}
          </Button>
          <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
            {t('partner.applyFootnote')}
          </p>
        </div>
      </div>

      {/*
        `emailUnverified` wins inside the dialog, because it is the earlier step
        and the only one whose way out is not /kyc — see the dialog's own note.
      */}
      <KycGateDialog
        open={gateOpen}
        onOpenChange={setGateOpen}
        emailUnverified={emailUnverified}
        pending={kyc.pending}
        rejected={kyc.rejected}
      />
    </div>
  );
}
