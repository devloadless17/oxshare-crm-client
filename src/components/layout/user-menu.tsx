'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { ChevronsUpDown, LogOut, Monitor, Moon, Sun, User } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage, initialsOf } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useUser } from '@/context/UserContext';
import { API_BASE_URL } from '@/lib/env';
import { useHydrated } from '@/hooks/use-hydrated';
import { t } from '@/lib/i18n';

/**
 * The account menu at the foot of the sidebar.
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
   * `header` is the mobile placement: the trigger is the avatar alone, with no
   * surrounding panel, because the header is 56px tall and a name plus e-mail
   * does not fit beside a hamburger and a KYC alert. The MENU is identical —
   * it already repeats the identity inside, which is what makes an
   * avatar-only trigger safe to use on a shared phone.
   */
  variant?: 'sidebar' | 'header';
}) {
  const { user, logout } = useUser();
  const [logoutError, setLogoutError] = React.useState<string | null>(null);

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
    } catch {
      setLogoutError(t('session.logoutFailed'));
    }
  };

  const compact = variant === 'header' || collapsed;

  return (
    <div className={variant === 'header' ? '' : 'border-t border-border p-3'}>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={`flex items-center gap-3 rounded-lg text-left transition-transform duration-100 active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:transform-none focus-outline cursor-pointer ${
            variant === 'header'
              ? 'shrink-0 rounded-full'
              : `w-full bg-muted p-2.5 hover:bg-accent ${collapsed ? 'justify-center p-2' : ''}`
          }`}
          aria-label={t('nav.accountMenu')}
        >
          <Avatar>
            <AvatarImage src={photo} alt="" />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>

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

        {/* `side="top"` because the trigger is at the very bottom of a
            full-height sidebar; a menu opening downwards would be off-screen. */}
        <DropdownMenuContent side="top" align="start" className="w-60" sideOffset={8}>
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

          <ThemeSubmenu />

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onSelect={() => void handleLogout()}
            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
          >
            <LogOut />
            <span>{t('nav.logout')}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {logoutError && !compact && (
        <p role="alert" className="mt-2 text-[11px] text-destructive">
          {logoutError}
        </p>
      )}
    </div>
  );
}

const THEMES = [
  { value: 'light', label: 'theme.light', icon: Sun },
  { value: 'dark', label: 'theme.dark', icon: Moon },
  { value: 'system', label: 'theme.system', icon: Monitor },
] as const;

/**
 * Light / Dark / System, as a submenu.
 *
 * `system` is new and is the default. The portal previously offered two states
 * with light hardcoded as the default, which meant a client whose device is in
 * dark mode got a bright page on every first load and had to opt out by hand,
 * on every device.
 *
 * `useHydrated` gates the ACTIVE MARK, not the menu. The server cannot know
 * what is in localStorage, so rendering the selected radio during SSR would
 * either mismatch on hydration or show the wrong option as chosen. Rendering
 * the items with nothing selected for one frame is the honest version — and
 * it is invisible, because a closed menu is not on screen anyway.
 */
function ThemeSubmenu() {
  const { theme, setTheme } = useTheme();
  const hydrated = useHydrated();

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="gap-2 px-2.5 py-2 [&_svg]:size-4">
        <Sun className="h-4 w-4" />
        <span>{t('theme.label')}</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="p-1.5">
        <DropdownMenuRadioGroup
          value={hydrated ? (theme ?? 'system') : undefined}
          onValueChange={setTheme}
        >
          {THEMES.map(({ value, label, icon: Icon }) => (
            <DropdownMenuRadioItem key={value} value={value} className="gap-2 py-2 pl-8 pr-3">
              <Icon className="h-4 w-4" />
              <span>{t(label)}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
