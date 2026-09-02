'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, KeyRound, MailCheck, MoreHorizontal, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { apiErrorMessage } from '@/lib/api/errors';
import { tradingApi, type TradingAccount } from '@/lib/api/trading';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/**
 * Everything a client can DO to one trading account, behind one menu.
 *
 * ## Why a menu rather than a row of buttons
 *
 * The three actions have nothing in common except their subject: one navigates
 * to a money flow, one edits a label, one rotates credentials. Laid out as
 * peers they compete with the figures on the page and put an irreversible
 * action one click from somebody who came to read a balance. Collapsed behind a
 * single trigger they are found when looked for and out of the way when not.
 *
 * ## Two of them write straight through to MT5
 *
 * Neither the name nor the passwords are portal-only. The rename writes the
 * local column AND the trading server, so the terminal agrees; the reset
 * rotates both MT5 passwords and cannot be undone. Both are therefore reported
 * by what the server did rather than by optimistic local state, and the reset
 * sits behind a confirmation that names its consequences instead of asking
 * "are you sure?".
 *
 * ## No password ever reaches this component
 *
 * The API does not return them. Whoever asks for a reset has by definition lost
 * control of a credential, and the browser making the request is not
 * necessarily the client's — so the registered mailbox, already proven to be
 * theirs, is the only delivery. The success dialog says WHERE it went.
 */
export function AccountActions({ account }: { account: TradingAccount }) {
  const queryClient = useQueryClient();

  const [renaming, setRenaming] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [sentTo, setSentTo] = React.useState<string | null>(null);

  const [name, setName] = React.useState(account.name ?? '');
  const [nameError, setNameError] = React.useState<string | null>(null);
  const [resetError, setResetError] = React.useState<string | null>(null);

  /*
   * Seeded when the dialog OPENS rather than once on mount, so re-opening it
   * after a rename shows the current name instead of whatever was last typed
   * into an abandoned edit.
   */
  const openRename = () => {
    setName(account.name ?? '');
    setNameError(null);
    setRenaming(true);
  };

  const rename = useMutation({
    mutationFn: () => tradingApi.renameAccount(account.id, name.trim()),
    onSuccess: () => {
      setNameError(null);
      setRenaming(false);
      /*
       * BOTH keys, because both screens render the name: this page reads
       * `trading-account`, and the list the client returns to reads
       * `trading-accounts`. Invalidating only the first leaves a stale caption
       * on the screen they navigate back to.
       */
      void queryClient.invalidateQueries({ queryKey: keys.tradingAccounts.detail(account.id) });
      void queryClient.invalidateQueries({ queryKey: keys.tradingAccounts.all() });
    },
    onError: (e: unknown) => setNameError(apiErrorMessage(e, t('accounts.nameFailed'))),
  });

  const reset = useMutation({
    mutationFn: () => tradingApi.resetAccountPassword(account.id),
    onSuccess: (result) => {
      setResetError(null);
      setConfirming(false);
      setSentTo(result.credentialsSentTo);
    },
    onError: (e: unknown) => {
      setConfirming(false);
      setResetError(apiErrorMessage(e, t('accounts.passwordFailed')));
    },
  });

  const trimmed = name.trim();

  /*
   * Funding is offered on LIVE, ACTIVE accounts only — the same pair the
   * server's `/transferable` route narrows to, and the same rule the list card
   * follows. A transfer to a demo account would be a real-money loss with no
   * counterparty.
   */
  const canFund = account.environment === 'live' && account.status === 'active';

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            {t('accounts.actionsLabel')}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {canFund && (
            <DropdownMenuItem asChild>
              {/*
                Carries the account id, so the transfer screen opens with this
                account already chosen as the destination and its matching
                wallet as the source. Arriving at a blank picker having just
                clicked "transfer funds" ON an account asks the client a
                question they have already answered.
              */}
              <Link href={`/transfer?account=${account.id}`}>
                <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
                {t('accounts.fundAccount')}
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={openRename}>
            <Pencil className="h-4 w-4" aria-hidden="true" />
            {t('accounts.renameAction')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {/*
            Last, and behind a separator: it is the only irreversible item here,
            and sitting it flush against two harmless ones invites a mis-click.
          */}
          <DropdownMenuItem onSelect={() => setConfirming(true)} disabled={reset.isPending}>
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            {reset.isPending ? t('accounts.passwordResetting') : t('accounts.passwordReset')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* ── Rename ───────────────────────────────────────────────────────── */}
      <Dialog open={renaming} onOpenChange={(next) => !next && setRenaming(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('accounts.renameTitle')}</DialogTitle>
          </DialogHeader>
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!trimmed || rename.isPending) return;
              void rename.mutateAsync().catch(() => undefined);
            }}
          >
            <Label htmlFor="account-name">{t('accounts.nameLabel')}</Label>
            <Input
              id="account-name"
              value={name}
              maxLength={128}
              autoFocus
              placeholder={t('accounts.namePlaceholder')}
              onChange={(e) => setName(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">{t('accounts.nameMt5Hint')}</p>
            {nameError && <p className="text-xs text-destructive">{nameError}</p>}
            <DialogFooter className="mt-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setRenaming(false)}>
                {t('accounts.passwordCancel')}
              </Button>
              {/*
                Disabled on an empty field rather than validated on submit: the
                server refuses a blank name, and there is nothing to learn from
                making the client discover that.
              */}
              <Button type="submit" size="sm" disabled={!trimmed || rename.isPending}>
                {rename.isPending ? t('accounts.nameSaving') : t('accounts.nameSave')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Reset both passwords ─────────────────────────────────────────── */}
      <Dialog open={confirming} onOpenChange={(next) => !next && setConfirming(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('accounts.passwordConfirmTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t('accounts.passwordConfirmBody')}
          </p>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              {t('accounts.passwordCancel')}
            </Button>
            <Button
              size="sm"
              disabled={reset.isPending}
              onClick={() => void reset.mutateAsync().catch(() => undefined)}
            >
              {reset.isPending ? t('accounts.passwordResetting') : t('accounts.passwordConfirmCta')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Where the new passwords went ─────────────────────────────────── */}
      <Dialog open={sentTo !== null} onOpenChange={(next) => !next && setSentTo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('accounts.passwordSentTitle')}</DialogTitle>
          </DialogHeader>
          <div className="flex gap-2 rounded-lg border border-success/40 bg-success/10 p-3">
            <MailCheck className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
            <p className="text-xs leading-relaxed">
              {t('accounts.passwordSent', { email: sentTo ?? '' })}
            </p>
          </div>
          <DialogFooter>
            <Button size="sm" onClick={() => setSentTo(null)}>
              {t('common.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/*
        Rendered OUTSIDE the dialogs deliberately: a failed reset CLOSES the
        confirmation, so an error shown inside it would unmount with it and the
        client would see the menu close and nothing else happen.
      */}
      {resetError && (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {resetError}
        </p>
      )}
    </>
  );
}
