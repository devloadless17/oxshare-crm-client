'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { moneyText } from '@/lib/bidi';
import { movementLabelKey } from '@/lib/movement-label';
import { intlLocale, localized, t, type MessageKey } from '@/lib/i18n';
import { assetUrl } from '@/lib/asset-url';
import type { Transaction } from '@/lib/api/payments';
import { useTransferEnds } from '@/components/transactions/transfer-ends';
import { STATE } from '@/components/transactions/transaction-filters';
import { Ltr } from '@/components/ltr';

/**
 * What happened to one movement, in the client's own words.
 *
 * ## The gap this closes
 *
 * A refused withdrawal reached the client as a red "Rejected" pill and
 * nothing else. The reason, the destination it was headed to, who reviewed it
 * and when it settled all ride on the client's OWN `GET /payments/transactions`
 * response — every one of those fields was on the wire and no portal surface
 * read them. The only place the reason ever appeared was a bell notification,
 * which is transient: miss it, and the money is back in the wallet with no
 * explanation anywhere the client can return to.
 *
 * The status COLUMN is still a badge alone, and deliberately — printing a
 * provider's sentence inside a table cell made the column the widest on the
 * screen and the state itself the hardest thing to read. A detail view is
 * where prose belongs.
 *
 * ## Only what is true
 *
 * Every row here is omitted when its field is absent rather than rendered as
 * an em dash or a zero: a pending withdrawal has no settlement date, and a
 * blank labelled "Settled" reads as a settlement that lost its date.
 */
export function TransactionDetails({
  tx,
  onClose,
}: {
  tx: Transaction | null;
  onClose: () => void;
}) {
  // Named ends of a transfer — which wallet, which account. Loaded only while a
  // transfer is open; both lists are usually already cached.
  const isTransfer = tx?.kind === 'transfer' || tx?.kind === 'commission_transfer';
  const endsOf = useTransferEnds(isTransfer);
  const ends = tx && isTransfer ? endsOf(tx) : null;
  return (
    <Dialog open={tx !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {tx && (
          <>
            <DialogHeader>
              <DialogTitle>{t(movementLabelKey(tx))}</DialogTitle>
              <DialogDescription>
                {moneyText(tx.amount, tx.currency)} ·{' '}
                {new Date(tx.createdAt).toLocaleString(intlLocale())}
              </DialogDescription>
            </DialogHeader>

            <dl className="space-y-3 text-sm">
              {/*
                The REASON, first and unmissable when there is one. This is the
                single field this dialog exists for: a client whose payout was
                refused could not find out why from any screen.
              */}
              {tx.rejectionReason && (
                <div className="rounded-lg bg-destructive/10 p-3">
                  <dt className="text-xs font-semibold text-destructive">
                    {t('transactions.detailReason')}
                  </dt>
                  <dd className="mt-1 text-xs leading-snug text-destructive">
                    {localized(tx.rejectionReason, tx.rejectionReasonAr)}
                  </dd>
                  {/*
                    DEPOSITS ONLY, and the asymmetry is the whole point.

                    This dialog serves both directions with one block of copy,
                    and a refusal means opposite things in each. A refused
                    WITHDRAWAL was debited when it was requested, so the money is
                    already back in the wallet. A refused DEPOSIT was never
                    debited — `requestDeposit` posts no ledger entry — so nothing
                    comes back, and for an offline deposit the client may be
                    holding a real transfer receipt for money they genuinely sent
                    outside this system.

                    Without this line the two read identically, and the client
                    most likely to be out of pocket is the one told the least.
                  */}
                  {tx.direction === 'deposit' && (
                    <dd className="mt-2 text-xs leading-snug text-muted-foreground">
                      {t('transactions.detailDepositRefusedNote')}
                    </dd>
                  )}
                </div>
              )}

              {/* The same words the tables' badges use — the raw enum ("failure") is
                  not something a client should read. Unknown states print as-is. */}
              <Row
                label={t('transactions.detailState')}
                value={
                  (STATE as Record<string, { key: MessageKey } | undefined>)[tx.state]
                    ? t((STATE as Record<string, { key: MessageKey }>)[tx.state]!.key)
                    : tx.state
                }
              />
              {/*
                THEIR OWN RECEIPT, back to them. A client who filed an offline
                deposit a week ago has no other way to see which image they sent
                — and when a deposit is refused for an unreadable receipt, the
                first thing they need is to look at what we looked at.
              */}
              {tx.proofFilename && (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-xs text-muted-foreground">
                    {t('transactions.detailReceipt')}
                  </dt>
                  <dd>
                    <a
                      href={assetUrl(`uploads/deposit-proofs/${tx.proofFilename}`)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-medium text-primary underline underline-offset-2"
                    >
                      {t('transactions.detailReceiptOpen')}
                    </a>
                  </dd>
                </div>
              )}
              {/*
                What they gave to identify the payment — the phone it was sent
                from, a transfer code (backend 0163) — each under the question
                they were asked, which the server kept with the answer.
              */}
              {tx.proofDetails?.map((detail) => (
                <Row
                  key={detail.fieldId}
                  label={localized(detail.label, detail.labelAr)}
                  value={detail.value}
                  mono
                />
              ))}
              {/*
                ── WHERE A TRANSFER WENT, WHICH NOTHING ELSE SAYS ────────────
                
                A transfer has no method, no provider and no destination — the
                union's own note says so — so this panel showed one with no
                route at all: an amount, a date and a state, and no answer to
                "between what and what". The list column beside it had the same
                gap and is fixed with the same field.
                
                `direction` is wallet-side for every kind, so `deposit` here
                means the money ARRIVED in the wallet (account → wallet) and
                `withdrawal` that it LEFT (wallet → account).
              */}
              {ends && (
                <>
                  <Row label={t('transfer.detailFrom')} value={ends.from} />
                  <Row label={t('transfer.detailTo')} value={ends.to} />
                </>
              )}
              {tx.destination && (
                <Row label={t('transactions.detailDestination')} value={tx.destination} />
              )}
              {tx.providerRef && (
                <Row label={t('transactions.detailReference')} value={tx.providerRef} mono />
              )}
              {tx.reviewedAt && (
                <Row
                  label={t('transactions.detailReviewed')}
                  value={new Date(tx.reviewedAt).toLocaleString(intlLocale())}
                />
              )}
              {tx.settledAt && (
                <Row
                  label={t('transactions.detailSettled')}
                  value={new Date(tx.settledAt).toLocaleString(intlLocale())}
                />
              )}
            </dl>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`text-end text-xs text-foreground ${mono ? 'font-mono break-all' : ''}`}>
        {/* An id reads left to right; isolated so the cell keeps its alignment. */}
        {mono ? <Ltr>{value}</Ltr> : value}
      </dd>
    </div>
  );
}
