'use client';

import Link from 'next/link';
import { Clock, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { t } from '@/lib/i18n';

/**
 * "Verify your identity first" — shown when a client reaches for a money action
 * they are not cleared for yet.
 *
 * ## Why a dialog rather than a disabled button
 *
 * A greyed-out Deposit answers "can I?" and nothing else. The client is left to
 * guess whether the product is broken, whether their account is frozen, or
 * whether they missed a step — and the one thing they need, the way out, is not
 * on screen. This says what is blocking them and puts the fix one click away.
 *
 * ## It is not the enforcement
 *
 * `RequireAuth` bounces the same client off /deposit and /withdraw on arrival,
 * and the payments API refuses them regardless of what any browser thinks. This
 * exists to explain the refusal BEFORE effort is invested in it. Read the two
 * together: the gate is the control, the dialog is the courtesy.
 *
 * ## Three states, not one
 *
 * "Under review" gets different words and a different button. Someone who has
 * already sent their documents has done their part, and offering them "Verify my
 * account" sends them into a wizard that `saveStep` refuses — which reads as the
 * product having lost their submission. Rejected gets its own copy for the same
 * reason in the opposite direction: there is something specific to fix, and
 * "takes a few minutes" is the wrong thing to tell someone whose passport scan
 * was unreadable.
 */
export function KycGateDialog({
  open,
  onOpenChange,
  pending = false,
  rejected = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending?: boolean;
  rejected?: boolean;
}) {
  const state = pending ? 'pending' : rejected ? 'rejected' : 'todo';

  const { Icon, tone, title, body, cta } = {
    pending: {
      Icon: Clock,
      tone: 'bg-info/10 text-info',
      title: t('kycGate.reviewTitle'),
      body: t('kycGate.reviewBody'),
      cta: t('kycGate.statusCta'),
    },
    rejected: {
      Icon: ShieldAlert,
      tone: 'bg-destructive/10 text-destructive',
      title: t('kycGate.rejectedTitle'),
      body: t('kycGate.rejectedBody'),
      cta: t('kycGate.statusCta'),
    },
    todo: {
      Icon: ShieldCheck,
      tone: 'bg-warning/10 text-warning',
      title: t('kycGate.title'),
      body: t('kycGate.body'),
      cta: t('kycGate.verifyCta'),
    },
  }[state];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <span
            className={`mb-2 flex h-11 w-11 items-center justify-center rounded-xl ${tone}`}
            aria-hidden="true"
          >
            <Icon className="h-5 w-5" />
          </span>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>

        <DialogFooter className="mt-6">
          <DialogClose asChild>
            <Button variant="outline">{t('kycGate.dismiss')}</Button>
          </DialogClose>
          {/*
            A real link, so it is middle-clickable and openable in a new tab like
            any other navigation — `asChild` is what keeps the anchor while
            taking the button's appearance. `/kyc` is a redirect stub that
            forwards to whichever step is next, so this one href is correct for
            a client who has done nothing and for one who stopped at step four.
          */}
          <Button asChild>
            <Link href="/kyc">{cta}</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
