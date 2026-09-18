'use client';

import * as React from 'react';
import Link from 'next/link';
import { Check, Copy, ExternalLink, Landmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SummaryRow } from '@/components/money/money-shell';
import type { DepositRequest, PaymentMethod } from '@/lib/api/deposits';
import { formatMoney } from '@/lib/money';
import { t } from '@/lib/i18n';

/**
 * What a client sees once a deposit is filed.
 *
 * TWO different screens, because at this point the two flows genuinely diverge:
 * a gateway client has a link to pay RIGHT NOW, and a manual client has a
 * reference to quote on a transfer they will make from their own bank later.
 * One screen serving both would have to hedge every sentence.
 *
 * Split out of `app/deposit/page.tsx` because that file crossed the 340-line
 * lint ceiling. The seam is the natural one: everything here is post-submission
 * and read-only, while what stays behind is the form and its state.
 *
 * ## NO `MoneySheet` of its own — the page already renders one
 *
 * Both branches used to open with their own sheet, and the page wraps this
 * component in one too, so the outcome rendered a bordered card inside a
 * bordered card: two radii, two shadows, and the inner one sitting inset from
 * the width the outer had already claimed. That inset is what made the request
 * details look narrower than the card holding them.
 *
 * The sheet belongs to the PAGE, which is what owns the viewport-bounded flex
 * chain (`flex min-h-0 flex-1`) that lets the body scroll. Returning a fragment
 * here keeps this content a section of that one card, full width, and leaves
 * exactly one component deciding what a money card looks like.
 */
export function DepositCreated({
  deposit,
  method,
  onReset,
}: {
  deposit: DepositRequest;
  method: PaymentMethod;
  onReset: () => void;
}) {
  if (deposit.paymentUrl) {
    return (
      <>
        <div className="space-y-4 p-5 text-center sm:p-6">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ExternalLink className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-lg font-bold">{t('deposit.paymentLinkReady')}</h2>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
              {t('deposit.paymentLinkBody')}
            </p>
          </div>

          <dl className="mx-auto max-w-xs divide-y divide-border text-start">
            <SummaryRow
              label={t('deposit.amountLabel')}
              value={formatMoney(deposit.amount, deposit.currency)}
              strong
            />
            <SummaryRow label={t('deposit.methodTitle')} value={method.name} />
            <SummaryRow label={t('deposit.referenceLabel')} value={deposit.reference} />
          </dl>

          {/*
              A real anchor, not a button calling `location.assign`. The client
              may be here BECAUSE their browser refused the automatic redirect —
              an anchor gives them middle-click, open-in-new-tab and copy-link,
              none of which a scripted navigation does.
            */}
          <Button asChild size="lg" className="w-full">
            <a href={deposit.paymentUrl} rel="noopener noreferrer">
              {t('deposit.openPaymentPage')}
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
          </Button>
          <p className="text-[11px] text-muted-foreground">{t('deposit.gatewayReturnNote')}</p>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="space-y-5 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warning/10 text-warning">
            <Landmark className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            {/*
              TWO different sentences, because the client is in two different
              places.

              An OFFLINE deposit has already been paid — the receipt is attached —
              so telling them to "send your transfer now" would ask for the money
              twice. What they need is what happens next: somebody checks the
              receipt.

              The other manual case has NOT paid yet, and "send your transfer now"
              is exactly right: nothing has moved, and a client who reads it as
              done waits for a balance that is never coming.
            */}
            <h2 className="text-lg font-bold">
              {method.requiresProof ? t('deposit.offlinePendingTitle') : t('deposit.pendingTitle')}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {method.requiresProof ? t('deposit.offlinePendingBody') : t('deposit.pendingBody')}
            </p>
          </div>
        </div>

        <ReferenceBlock reference={deposit.reference} />

        {/*
            The pay-to row and the instructions block were here, and went with
            their columns in migration 0042.

            WHAT THAT COSTS, stated rather than quietly dropped: a manual deposit
            now gives the client a reference and no destination. That is fine
            while the platform runs the GATEWAY flow — where the client is
            redirected and never needs an account number — and is not fine the
            day a bank transfer is offered again. Restoring the columns restores
            this block.
          */}
        <dl className="divide-y divide-border">
          <SummaryRow
            label={t('deposit.amountLabel')}
            value={formatMoney(deposit.amount, deposit.currency)}
            strong
          />
        </dl>

        {/* Only where a transfer is still to be made. An offline client has
            already sent theirs, so asking them to quote a reference on it is an
            instruction they can no longer follow. */}
        {/* `text-warning`, not `text-warning-foreground`: the latter is the ink
            for text on the SOLID warning fill (white in light, near-black in
            dark), and on this 10% tint it inverted into white-on-white and then
            black-on-black. Same fix as the admin reject dialog. */}
        {!method.requiresProof && (
          <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-[11px] leading-relaxed text-warning">
            {t('deposit.referenceWarning')}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onReset} className="flex-1 basis-0">
            {t('deposit.newRequest')}
          </Button>
          <Button asChild variant="outline" size="sm" className="flex-1 basis-0">
            <Link href="/transactions">{t('deposit.trackIt')}</Link>
          </Button>
        </div>
      </div>
    </>
  );
}

/**
 * The reference, big and copyable.
 *
 * It is the only thing tying the client's bank transfer to this declaration, so
 * it is the most important string on the screen — hence the size and the
 * monospace. A failed copy says so rather than appearing to work:
 * `navigator.clipboard` is unavailable over plain HTTP and can be denied by
 * permission, and a button that silently does nothing is the one control a
 * client is certain they used correctly.
 */
function ReferenceBlock({ reference }: { reference: string }) {
  const [copied, setCopied] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(reference);
      setFailed(false);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setFailed(true);
    }
  };

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold text-muted-foreground">
        {t('deposit.referenceLabel')}
      </p>
      <div className="flex items-center gap-2 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 p-4">
        <code className="flex-1 font-mono text-xl font-bold tracking-widest">{reference}</code>
        <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
          {copied ? (
            <Check className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Copy className="h-4 w-4" aria-hidden="true" />
          )}
          {copied ? t('deposit.referenceCopied') : t('deposit.copyReference')}
        </Button>
      </div>
      {failed && (
        <p role="alert" className="text-[11px] text-destructive">
          {t('partner.copyFailed')}
        </p>
      )}
    </div>
  );
}
