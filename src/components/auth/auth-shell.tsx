import Link from 'next/link';
import { BrandLogo } from '@/components/brand-logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { ShieldCheck, Globe2, LineChart } from 'lucide-react';
import { t } from '@/lib/i18n';

/**
 * The frame every auth screen sits in.
 *
 * Five screens — sign in, register, forgot, reset, verify — each carried their
 * own copy of the mark, the heading block, the card and a theme toggle, and
 * they had drifted: different paddings, different heading sizes, and a
 * `max-w-md` on some and not others. A client moving from register to sign-in
 * saw the page shift under them.
 *
 * ## Why a split
 *
 * The single centred card is the default because it is the easiest thing to
 * build, not because it is right for this product. This is the first screen a
 * prospective client sees, and it was a form floating in white space with no
 * statement of what OXShare is or why anyone should hand it money.
 *
 * The left panel is that statement, and it is deliberately not decoration: on a
 * financial product the things worth saying at the door are custody,
 * regulation and reach. It is `hidden lg:flex`, so on the phone — where most
 * registrations happen — the form gets the whole viewport and none of the
 * marketing.
 *
 * ## No theme toggle
 *
 * Each of these screens had one, floating in the top-right corner. It was the
 * only control on the page that was not part of signing in, and it drew the eye
 * on the one screen where the eye has exactly one job. The theme now follows
 * the operating system by default and is changed from the account menu once
 * signed in — which is where somebody looks for it, and after the moment that
 * matters.
 */
export function AuthShell({
  heading,
  subheading,
  children,
  footer,
  homeHref = '/auth/login',
}: {
  heading: string;
  subheading?: string;
  children: React.ReactNode;
  /** The "no account? register" line. Optional — reset screens have no next step. */
  footer?: React.ReactNode;
  /**
   * Where the MARK points. Defaults to sign-in, which is home for a signed-out
   * visitor.
   *
   * It is a prop rather than something this file works out because a referral
   * code must survive it. A visitor landing on `/auth/register?ref=CODE` and
   * clicking the logo used to arrive at a bare `/auth/login`, and from there
   * "Create account" led to a bare `/auth/register` — attribution silently
   * gone, which is money. The explicit "Sign in" cross-link was fixed for
   * exactly this and the MARK beside it was not: the same journey through a
   * different control, found by walking §14 journey 2 by hand.
   *
   * Passed down rather than read here with `useSearchParams()`, which would opt
   * this server component — and therefore all five auth screens — into client
   * rendering. `app/auth/login/page.tsx` documents that cost. The pages that
   * already know the code are the ones that hand it over.
   */
  homeHref?: string;
}) {
  return (
    <main className="flex h-dvh overflow-y-auto bg-background">
      <BrandPanel homeHref={homeHref} />

      {/* The form column. `min-w-0` so a long error message wraps instead of
          widening the flex child and pushing the brand panel off-screen. */}
      <div className="relative flex min-w-0 flex-1 flex-col items-center justify-center px-5 pb-10 pt-20 sm:px-8">
        {/*
          A HEADER ROW, as on the broker's own site: the logo on the left and the
          light/dark toggle on the right.

          The logo is `lg:invisible` rather than removed on wide screens, where
          the brand panel already carries it — invisible keeps its box, so
          `justify-between` still pins the toggle to the right edge. The top
          padding is `pt-20` so a form tall enough to fill a short phone never
          slides under the row.
        */}
        <div className="absolute inset-x-5 top-5 flex items-center justify-between sm:inset-x-8">
          <Link
            href={homeHref}
            aria-label={t('app.name')}
            className="inline-flex items-center rounded-md focus-outline lg:invisible"
          >
            <BrandLogo className="h-7 w-auto" />
          </Link>
          <ThemeToggle />
        </div>

        <div className="w-full max-w-[26rem]">
          <header className="mb-7 text-center">
            <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight text-foreground">
              {heading}
            </h1>
            {subheading && (
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{subheading}</p>
            )}
          </header>

          {children}

          {footer && <div className="mt-7 text-center text-sm text-muted-foreground">{footer}</div>}
        </div>
      </div>
    </main>
  );
}

/**
 * What the product is, for the person deciding whether to sign up.
 *
 * `hidden lg:flex`: below that width it would push the form below the fold, and
 * a marketing panel that delays the form is worse than no panel.
 */
function BrandPanel({ homeHref }: { homeHref: string }) {
  return (
    <div className="relative hidden w-[46%] max-w-[36rem] flex-col justify-between overflow-hidden bg-auth-panel px-12 py-14 lg:flex">
      {/*
        A single soft radial wash rather than an image.

        No network request, no layout shift, nothing to art-direct per breakpoint
        — and it cannot become the reason the sign-in screen is slow, which for
        the page every client passes through daily is the constraint that
        outranks looking impressive.
      */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-24 h-[30rem] w-[30rem] rounded-full opacity-[0.14] blur-3xl"
        style={{ background: 'radial-gradient(circle, var(--primary) 0%, transparent 70%)' }}
      />

      {/*
        NAMED ON THE LINK, like its twins in both sidebars. The image inside
        carries the brand as `alt`, which a screen reader does use — but a
        control named only by a child image loses its name the moment that image
        is swapped or marked decorative, and nothing about such a change looks
        like an accessibility one.
      */}
      <Link href={homeHref} aria-label={t('app.name')} className="relative flex items-center">
        {/*
          The DARK-GROUND wordmark, with no theme swap — unlike everywhere else.
          This panel is `--auth-panel`, which is near-black in BOTH themes
          (#16161a light, #08080a dark) with light text on it, so the white
          wordmark is correct on both and a `dark:` variant here would put the
          near-black one on a near-black panel in one of them.
        */}
        <BrandLogo tone="onDark" className="h-8 w-auto" />
      </Link>

      <div className="relative">
        <p className="text-[2rem] font-bold leading-[1.2] tracking-tight text-auth-panel-foreground">
          {t('auth.brand.headline')}
        </p>
        <p className="mt-4 max-w-sm text-sm leading-relaxed text-auth-panel-foreground/70">
          {t('auth.brand.body')}
        </p>

        <ul className="mt-10 space-y-5">
          <BrandPoint icon={ShieldCheck} label={t('auth.brand.pointCustody')} />
          <BrandPoint icon={LineChart} label={t('auth.brand.pointMarkets')} />
          <BrandPoint icon={Globe2} label={t('auth.brand.pointGlobal')} />
        </ul>
      </div>

      <p className="relative text-xs text-auth-panel-foreground/60">{t('auth.brand.footnote')}</p>
    </div>
  );
}

function BrandPoint({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-auth-panel-foreground/10">
        <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
      </span>
      <span className="text-sm leading-relaxed text-auth-panel-foreground/80">{label}</span>
    </li>
  );
}
