'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, MailCheck, Plus, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import {
  tradingApi,
  type OpenedAccount,
  type SelfServiceAvailability,
  type TradingEnvironment,
} from '@/lib/api/trading';
import { t } from '@/lib/i18n';

/**
 * Open a trading account, from the portal.
 *
 * ## Why this is one component used twice
 *
 * The accounts page needs it in the header AND in the empty state, and the
 * empty state is the case that matters: a client with no accounts had no way to
 * get one, which made the screen a dead end telling them to contact support for
 * something the system can do in a second.
 *
 * ## Availability is asked, not assumed
 *
 * `GET /trading/accounts/self-service` says which environments this broker has
 * switched on. Drawing both buttons and letting the API refuse would teach a
 * client that a feature is not for them by making them press it. When neither
 * is enabled this renders nothing at all — an explanation of an absent feature
 * is worse than its absence.
 *
 * ## KYC is handled as a state, not an error
 *
 * A live account needs a verified identity. The API refuses with the same code
 * the money endpoints use, and rather than showing that as a red failure this
 * turns it into the one thing the client can act on: a link to verification,
 * next to a demo account they can open right now without it.
 */
export function OpenAccountButton({ variant = 'default' }: { variant?: 'default' | 'outline' }) {
  const [open, setOpen] = React.useState(false);

  const availability = useResource<SelfServiceAvailability>(
    ['trading-accounts', 'self-service'],
    (signal) => tradingApi.getSelfServiceAvailability(signal),
  );

  // Nothing at all when neither door is open, and nothing while we do not yet
  // know — a button that appears a second late is better than one that appears
  // and then vanishes.
  const enabled = availability.data;
  if (!enabled || (!enabled.live && !enabled.demo)) return null;

  return (
    <>
      <Button variant={variant} size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        {t('accounts.open')}
      </Button>
      {open && <OpenAccountModal availability={enabled} onClose={() => setOpen(false)} />}
    </>
  );
}

function OpenAccountModal({
  availability,
  onClose,
}: {
  availability: SelfServiceAvailability;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [opened, setOpened] = React.useState<OpenedAccount | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [needsKyc, setNeedsKyc] = React.useState(false);

  const create = useMutation({
    mutationFn: (environment: TradingEnvironment) => tradingApi.openAccount(environment),
    onSuccess: (account) => {
      setError(null);
      setNeedsKyc(false);
      setOpened(account);
      void queryClient.invalidateQueries({ queryKey: ['trading-accounts'] });
    },
    onError: (e: unknown) => {
      /*
       * KYC is a STATE with an action attached, not a failure to report.
       *
       * The API answers with the same code the money endpoints use, so this
       * branches on it and offers verification plus the demo account the client
       * can have immediately — rather than a red message telling them what they
       * are not allowed to do.
       */
      const code = (e as { response?: { data?: { code?: string } } })?.response?.data?.code;
      if (code === 'KYC_NOT_VERIFIED') {
        setNeedsKyc(true);
        setError(null);
        return;
      }
      setError(apiErrorMessage(e, t('accounts.openFailed')));
    },
  });

  if (opened) {
    return (
      <Dialog open onOpenChange={(next) => !next && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('accounts.openedTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2 rounded-lg border border-success/40 bg-success/10 p-3">
              <MailCheck className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
              <p className="text-xs leading-relaxed">
                {t('accounts.credentialsEmailed', { email: opened.credentialsSentTo })}
              </p>
            </div>

            <dl className="grid gap-3 text-xs sm:grid-cols-2">
              <Fact label={t('accounts.colLogin')} value={opened.login} mono />
              <Fact label={t('accounts.colCurrency')} value={opened.currency} />
              <Fact label={t('accounts.colLeverage')} value={`1:${opened.leverage}`} />
              <Fact
                label={t('accounts.colEnvironment')}
                value={opened.environment === 'live' ? t('accounts.live') : t('accounts.demo')}
              />
            </dl>

            {/*
            Said plainly, because it changes what the client does if the mail
            does not arrive: ask for a reset, not for someone to look it up.
          */}
            <p className="border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground">
              {t('accounts.credentialsNoCopy')}
            </p>

            <div className="flex justify-end pt-1">
              <Button size="sm" onClick={onClose}>
                {t('accounts.openedDone')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('accounts.openTitle')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">{t('accounts.openBody')}</p>

          {needsKyc && (
            <div className="flex gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3">
              <ShieldAlert className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
              <div className="space-y-2">
                <p className="text-xs leading-relaxed">{t('accounts.liveNeedsKyc')}</p>
                <Button asChild size="sm" variant="outline">
                  <Link href="/kyc">{t('accounts.verifyNow')}</Link>
                </Button>
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {availability.live && (
              <Choice
                title={t('accounts.live')}
                body={t('accounts.liveBody')}
                cta={t('accounts.openLive')}
                busy={create.isPending && create.variables === 'live'}
                disabled={create.isPending}
                onSelect={() => create.mutate('live')}
              />
            )}
            {availability.demo && (
              <Choice
                title={t('accounts.demo')}
                body={t('accounts.demoBody')}
                cta={t('accounts.openDemo')}
                variant="outline"
                busy={create.isPending && create.variables === 'demo'}
                disabled={create.isPending}
                onSelect={() => create.mutate('demo')}
              />
            )}
          </div>

          {error && (
            <p role="alert" className="text-xs font-medium text-destructive">
              {error}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * One environment, with what it MEANS rather than what it is called.
 *
 * "Live" and "Demo" are jargon to somebody opening their first account. The
 * body says which one holds real money, because that is the only distinction
 * that matters and getting it wrong is expensive in one direction.
 */
function Choice({
  title,
  body,
  cta,
  busy,
  disabled,
  onSelect,
  variant = 'default',
}: {
  title: string;
  body: string;
  cta: string;
  busy: boolean;
  disabled: boolean;
  onSelect: () => void;
  variant?: 'default' | 'outline';
}) {
  return (
    <div className="flex flex-col justify-between gap-3 rounded-xl border border-border bg-card p-4">
      <div className="space-y-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">{body}</p>
      </div>
      <Button size="sm" variant={variant} disabled={disabled} onClick={onSelect}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {cta}
      </Button>
    </div>
  );
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className={`truncate font-medium ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}
