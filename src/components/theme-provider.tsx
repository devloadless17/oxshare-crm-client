'use client';

// TWIN FILE — an identical copy lives at the same path in oxshare-crm-admin.
// Behaviour changes belong in BOTH. Anything app-specific (cookie names,
// token lifetimes, redirect paths, endpoint patterns) goes in the config block
// at the top of the file, never inline — that is what keeps a diff between the
// two copies a signal rather than noise.
import { ThemeProvider as NextThemesProvider, type ThemeProviderProps } from 'next-themes';

/**
 * `system` by default, and `enableSystem` — both of which were off.
 *
 * The old defaults were `defaultTheme="light"` with `enableSystem={false}`,
 * which meant a client whose device is in dark mode got a bright page on first
 * load of every device they own, and could only opt out by finding a toggle
 * that offered exactly two states and no way to say "follow my OS".
 *
 * `enableSystem` is what makes `system` more than a third label: it attaches
 * the `prefers-color-scheme` listener, so a client whose phone flips to dark at
 * sunset gets a portal that flips with it rather than one that decided in
 * January.
 *
 * The nonce prop matters here and is set by the root layout — next-themes
 * injects an inline script to set the class before first paint, and with
 * `unsafe-inline` removed from `script-src` an unstamped script is blocked.
 * That failure is silent and looks like "dark mode does not work".
 */
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange={false}
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
