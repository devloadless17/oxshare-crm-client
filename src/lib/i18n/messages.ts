/**
 * Every user-visible string in the portal, in one place.
 *
 * TWIN-ADJACENT: `oxshare-crm-admin` has the same module at the same path with
 * its own catalogue. The MECHANISM is identical and belongs in both; the strings
 * are per-app and deliberately are not shared.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * `docs/CLAUDE.md`, "Designed for change", seam 4:
 *
 *   "Strings externalised from day one. Wrap UI text in a translation function
 *    as you write it. Costs nothing now; retrofitting across forty screens is
 *    weeks. Do not build the language switcher yet."
 *
 * FSD §10 lists multi-language including RTL Arabic as a non-functional
 * requirement, and DECISIONS D-16 tracks it. None of it was done — every string
 * was a literal in JSX — so this is the retrofit that instruction was written to
 * avoid. It is being done now rather than later for the same reason it was cheap
 * then and expensive now: the cost is linear in screens, and the screen count
 * only grows.
 *
 * ── Why not an i18n library ────────────────────────────────────────────────
 *
 * The working agreement requires asking before adding a dependency, and the same
 * instruction says not to build the switcher yet. What is needed today is the
 * SEAM — a function every string passes through — so that adding `ar.ts` later
 * is a data change rather than a sweep of every component. `next-intl` or
 * `react-i18next` become worth their weight when there is a second locale, a
 * switcher, and per-route message splitting. Swapping this module for one of
 * them later touches this file and `index.ts`, not the call sites, which is the
 * whole point of routing everything through `t()`.
 *
 * ── Why the keys are typed ─────────────────────────────────────────────────
 *
 * `MessageKey` is derived from this object, so `t('auth.lgoin.title')` is a
 * compile error rather than a string that renders as itself in production. That
 * is the failure mode most i18n retrofits ship with, and it costs nothing to
 * exclude here.
 *
 * ── Conventions ────────────────────────────────────────────────────────────
 *
 *  - Keys are `area.screen.element`, lower-case, dot-separated.
 *  - Interpolation is `{name}`; see `t()` in ./index.ts.
 *  - Never build a sentence by concatenating two keys — word order differs
 *    between languages, and in Arabic so does direction. One key per sentence.
 */
export const messages = {
  // ── Brand and chrome ──────────────────────────────────────────────────────
  'app.name': 'OXShare',
  'app.portalName': 'Client Portal',

  // ── Navigation ────────────────────────────────────────────────────────────
  'nav.dashboard': 'Dashboard',
  'nav.accounts': 'Trading Accounts',
  'nav.wallet': 'Wallet',
  'nav.deposit': 'Deposit',
  'nav.withdraw': 'Withdraw',
  'nav.transactions': 'Transactions',
  'nav.kyc': 'KYC Verification',
  'nav.profile': 'Profile',
  'nav.comingSoon': 'Soon',
  'nav.comingSoonTitle': '{label} — coming soon',
  'nav.logout': 'Logout',
  'nav.openMenu': 'Open menu',
  'nav.closeMenu': 'Close menu',
  'nav.collapse': 'Collapse sidebar',
  'nav.expand': 'Expand sidebar',

  // ── Auth: sign in ─────────────────────────────────────────────────────────
  'auth.login.title': 'Welcome back',
  'auth.login.subtitle': 'Sign in to your OXShare account',
  'auth.login.email': 'Email address',
  'auth.login.password': 'Password',
  'auth.login.submit': 'Sign in',
  'auth.login.submitting': 'Signing in…',
  'auth.login.forgot': 'Forgot your password?',
  'auth.login.noAccount': "Don't have an account?",
  'auth.login.register': 'Create one',
  'auth.login.failed': 'Sign in failed. Please check your details and try again.',
  'auth.login.unverified': 'Please verify your email address before signing in.',

  // ── Auth: register ────────────────────────────────────────────────────────
  'auth.register.title': 'Create your account',
  'auth.register.subtitle': 'Start trading with OXShare',
  'auth.register.firstName': 'First name',
  'auth.register.lastName': 'Last name',
  'auth.register.email': 'Email address',
  'auth.register.password': 'Password',
  'auth.register.country': 'Country',
  'auth.register.phone': 'Phone number',
  'auth.register.submit': 'Create account',
  'auth.register.submitting': 'Creating your account…',
  'auth.register.hasAccount': 'Already have an account?',
  'auth.register.signIn': 'Sign in',
  'auth.register.failed': 'Registration failed. Please try again.',
  'auth.register.passwordHint': 'At least 8 characters',

  // ── Auth: email verification ──────────────────────────────────────────────
  'auth.verify.pendingTitle': 'Verify your email',
  'auth.verify.pendingBody':
    'We sent a verification link to your inbox. Follow it to activate your account.',
  'auth.verify.resend': 'Resend the link',
  'auth.verify.resending': 'Sending…',
  'auth.verify.resent': 'If that email exists and is unverified, a new link has been sent.',
  'auth.verify.successTitle': 'Email verified',
  'auth.verify.successBody': 'Your email is confirmed. You can sign in now.',
  'auth.verify.failedTitle': 'This link is no longer valid',
  'auth.verify.failedBody': 'Verification links expire after 24 hours. Request a new one.',

  // ── Auth: password reset ──────────────────────────────────────────────────
  'auth.forgot.title': 'Reset your password',
  'auth.forgot.subtitle': "Enter your email and we'll send you a reset link.",
  'auth.forgot.submit': 'Send reset link',
  'auth.reset.title': 'Choose a new password',
  'auth.reset.password': 'New password',
  'auth.reset.confirm': 'Confirm new password',
  'auth.reset.submit': 'Update password',
  'auth.reset.mismatch': 'The two passwords do not match.',

  // ── Wallet ────────────────────────────────────────────────────────────────
  'wallet.title': 'Wallet',
  'wallet.subtitle': 'View your central wallet balances and manage fund allocation',
  'wallet.available': 'Available',
  'wallet.onHold': '{amount} on hold · {total} total',
  'wallet.empty': 'You have no wallets yet.',
  'wallet.loading': 'Loading your wallet balances',
  'wallet.loadFailed': 'Could not load your wallet balances.',

  // ── Dashboard ─────────────────────────────────────────────────────────────
  'dashboard.title': 'Trading Overview',
  'dashboard.liveBadge': 'Live MT5 Sync',
  'dashboard.welcome':
    'Welcome back! Monitor your live balances, trading accounts, and recent transactions.',
  'dashboard.recentTitle': 'Recent Activity',
  'dashboard.recentSubtitle': 'Latest deposits, withdrawals, and MT5 transfers',
  'dashboard.viewAllSoon': 'View All — soon',
  'dashboard.noActivityTitle': 'No activity yet',
  'dashboard.firstDepositSoon': 'Make Your First Deposit — soon',

  // ── KYC ───────────────────────────────────────────────────────────────────
  'kyc.required': 'Required',
  'kyc.submittedTitle': 'Verification Submitted',
  'kyc.approvedTitle': 'KYC Approved!',
  'kyc.rejectedTitle': 'KYC Verification Rejected',
  'kyc.backToDashboard': 'Back to Dashboard',
  'kyc.loadFailed': 'Could not load your verification details.',
  'kyc.statusLoadFailed': 'Could not load your verification status.',
  'kyc.uploadTooLarge':
    'That file is {size} MB. The limit is {limit} MB — please upload a smaller scan or photo.',
  'kyc.uploadFailed': 'Upload failed. Please try again.',
  'kyc.selfieFailed': 'Could not upload your selfie. Please retake it.',
  'kyc.selfieRetake': 'Retake',
  'kyc.selfieCapture': 'Capture',

  // ── Shared / generic ──────────────────────────────────────────────────────
  'common.retry': 'Try again',
  'common.loading': 'Loading',
  'common.cancel': 'Cancel',
  'common.continue': 'Continue',
  'common.back': 'Back',
  'common.next': 'Next',
  'common.submit': 'Submit',
  'common.genericError': 'Something went wrong. Please try again.',
  'common.requestId': 'Reference: {id}',
} as const;

/** Every valid key. A typo is a compile error, never a string rendered as itself. */
export type MessageKey = keyof typeof messages;
