'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronsUpDown, LogOut, User } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage, initialsOf } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useUser } from '@/context/UserContext';
import { API_BASE_URL } from '@/lib/env';
import { t } from '@/lib/i18n';
import { toast } from 'sonner';

/**
 * The account menu, top-right in the header.
 *
 * It began at the foot of the sidebar; the product owner moved it to the
 * header's right edge — the placement every mature dashboard trains people to
 * reach for. The `sidebar` variant below is kept working because the admin app
 * still mounts it there until its own header move is approved.
 *
 * Replaces a block that showed the client's name, e-mail, a green "online" dot
 * and a bare log-out icon, all at once and all always visible. Three problems
 * with that, in rising order:
 *
 *  1. The dot claimed a fact nothing measured. There is no presence system in
 *     this product — it was `bg-success` whenever `verificationLevel === 1`,
 *     so it was really a second, unlabelled KYC indicator wearing the visual
 *     language of "online".
 *  2. Log-out sat one mis-click away from the navigation, permanently, with no
 *     confirmation. On a portal holding a wallet, that is the wrong thing to
 *     make effortless.
 *  3. There was nowhere to put anything else. Theme lived in a separate
 *     two-button toggle in the header, which had no room for a third option.
 *
 * Now the whole block is one trigger, and the menu is where account-level
 * actions accumulate.
 */
export function UserMenu({
  collapsed,
  variant = 'sidebar',
}: {
  collapsed: boolean;
  /**
   * `header` is the top-right placement, at every breakpoint: the AVATAR ALONE
   * as the trigger, at every width. It was a pill — avatar, name, chevron —
   * from `md` up; the name and chevron are gone, so the 56px mobile header
   * holding a hamburger, a KYC alert and the bell now sizes the same at every
   * breakpoint rather than growing one at `md`.
   *
   * The MENU repeats the identity inside, which is what makes an avatar-only
   * trigger safe on a shared phone — and what the `aria-label` stands in for,
   * now that no visible text supplies the accessible name.
   *
   * `sidebar` is the legacy foot-of-the-rail block the admin app still uses.
   */
  variant?: 'sidebar' | 'header';
}) {
  const { user, logout } = useUser();
  const [logoutError, setLogoutError] = React.useState<string | null>(null);
  /*
   * Controlled, because a FAILED sign-out must keep the menu open: the error
   * line renders inside it, and Radix's default is to close on item select —
   * which would flash the message for one frame and leave a signed-in page
   * that looks like nothing happened.
   */
  const [open, setOpen] = React.useState(false);

  const name = user ? `${user.firstName} ${user.lastName}`.trim() : '';
  const initials = initialsOf(user?.firstName, user?.lastName);
  /*
   * `avatarUrl` is a path on the API (`/uploads/avatars/<uuid>.png`), not on
   * this app, so it needs the base in front of it or Next answers 404. Going
   * through the rewrite also keeps the session cookie attached, which the route
   * serving the bytes requires.
   */
  const photo = user?.avatarUrl ? `${API_BASE_URL}${user.avatarUrl}` : undefined;

  /**
   * Log out, with the failure made visible instead of swallowed.
   *
   * `authApi.logout` retries once and then throws, and it throws for a reason
   * worth showing: only the server can end this session — it revokes the
   * refresh-token family and clears the httpOnly cookies — so a failed call
   * leaves the client fully signed in. Navigating to the sign-in screen anyway
   * would show a logged-out page over a live session, on a device that is very
   * often shared.
   */
  const handleLogout = async () => {
    setLogoutError(null);
    try {
      await logout();
      setOpen(false);
    } catch {
      /*
       * Surfaced TWICE on purpose: as a line INSIDE the still-open menu (the
       * reader's eyes are already there — the item they just pressed did not
       * work) and as a toast, which survives even if they click away and
       * close the menu before reading. Never navigate here: only the server
       * can end this session, so a failed call leaves the client fully
       * signed in, and a sign-in screen over a live session is the one
       * outcome this whole path exists to prevent (see api/auth.ts).
       */
      toast.error(t('session.logoutFailed'));
      setLogoutError(t('session.logoutFailed'));
    }
  };

  const compact = variant === 'header' || collapsed;

  return (
    <div className={variant === 'header' ? '' : 'border-t border-border p-3'}>
      <DropdownMenu
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          // A failure message from a PREVIOUS attempt must not greet the next
          // open as if it just happened — it describes a moment, not a state.
          if (!next) setLogoutError(null);
        }}
      >
        <DropdownMenuTrigger
          className={`flex items-center text-start transition-colors focus-outline cursor-pointer ${
            variant === 'header'
              ? 'h-9 w-9 shrink-0 items-center justify-center rounded-full p-1 hover:bg-muted data-[state=open]:bg-muted'
              : `w-full gap-3 rounded-lg bg-muted p-2.5 hover:bg-accent ${collapsed ? 'justify-center p-2' : ''}`
          }`}
          aria-label={t('nav.accountMenu')}
        >
          <Avatar className={variant === 'header' ? 'h-7 w-7' : undefined}>
            <AvatarImage src={photo} alt="" />
            <AvatarFallback className={variant === 'header' ? 'text-[11px]' : undefined}>
              {initials}
            </AvatarFallback>
          </Avatar>

          {/*
            THE AVATAR ALONE, at every width.

            The header trigger was a pill — avatar, name, chevron — from `md`
            up, collapsing to the avatar below it. It is now the avatar
            everywhere, on the owner's call, matching the admin console.

            Nothing is lost by it: the name sits at the top of the menu itself,
            so the identity this was asserting is one click away rather than
            permanently occupying header width. `aria-label` on the trigger
            carries the accessible name the visible text used to provide.

            It also settles the mobile header for free — the 56px row that held
            hamburger + KYC alert + bell + avatar now holds the same avatar at
            every breakpoint rather than growing one at `md`.
          */}
          {!compact && (
            <>
              <span className="flex-1 overflow-hidden">
                <span className="block truncate text-xs font-semibold text-foreground">
                  {name || t('nav.accountMenu')}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {user?.email ?? ''}
                </span>
              </span>
              <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </>
          )}
        </DropdownMenuTrigger>

        {/* In the header the menu drops DOWN from the top-right, anchored to the
            trigger's end edge (`align="end"` is logical, so Arabic RTL flips it
            for free). The sidebar variant still opens upwards — its trigger sat
            at the very bottom of a full-height rail, and the admin app still
            mounts it there. */}
        <DropdownMenuContent
          side={variant === 'header' ? 'bottom' : 'top'}
          align={variant === 'header' ? 'end' : 'start'}
          className="w-60"
          sideOffset={8}
        >
          {/* The identity repeats inside the menu deliberately. On a collapsed
              sidebar the trigger is an avatar and nothing else, so this is the
              only place the client can confirm WHICH account they are about to
              sign out of — which matters on the shared devices this portal is
              used from. */}
          <div className="flex items-center gap-2.5 px-2 py-2">
            <Avatar className="h-8 w-8">
              <AvatarImage src={photo} alt="" />
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <div className="overflow-hidden">
              <p className="truncate text-xs font-semibold text-foreground">{name}</p>
              <p className="truncate text-[11px] text-muted-foreground">{user?.email ?? ''}</p>
            </div>
          </div>

          <DropdownMenuSeparator />

          <DropdownMenuItem asChild>
            <Link href="/profile">
              <User />
              <span>{t('nav.profile')}</span>
            </Link>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onSelect={(event) => {
              // Keep the menu mounted while the request runs: on success the
              // navigation unmounts everything anyway, and on failure the
              // error line below needs somewhere to appear.
              event.preventDefault();
              void handleLogout();
            }}
            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
          >
            <LogOut className="rtl:-scale-x-100" />
            <span>{t('nav.logout')}</span>
          </DropdownMenuItem>

          {logoutError && (
            <p
              role="alert"
              className="mx-1 mb-1 mt-1.5 rounded-md bg-destructive/10 px-2.5 py-2 text-[11px] leading-snug text-destructive"
            >
              {logoutError}
            </p>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
