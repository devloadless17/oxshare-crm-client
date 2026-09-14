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
  'nav.logout': 'Log out',
  'nav.accountMenu': 'Account menu',

  /*
   * The broker's own links, at the foot of the sidebar.
   *
   * A HEADING rather than the links simply following the app's own pages,
   * because these leave the portal. Without something saying so, "Economic
   * calendar" sits in the same list as "Wallet" and reads as another screen
   * here — and the client finds out it is not by landing on somebody else's
   * site. The arrow on each entry says the same thing a second time.
   */
  'nav.section.resources': 'Resources',
  'nav.opensInNewTab': '{title} — opens in a new tab',

  // ── Theme ─────────────────────────────────────────────────────────────────
  // `system` is the default and is named rather than implied: a client whose OS
  // is in dark mode should be told that is WHY the portal is dark, otherwise the
  // only way to find out is to toggle the other two and guess.
  'theme.label': 'Theme',
  'theme.light': 'Light',
  'theme.dark': 'Dark',
  'theme.system': 'System',

  // ── Platforms ─────────────────────────────────────────────────────────────
  'nav.platforms': 'Platforms',
  'nav.partner': 'Partner Programme',
  'platforms.title': 'Trading platforms',
  'platforms.subtitle': 'Download the OXShare terminal for the device you trade on.',
  'platforms.desktop': 'Desktop terminal',
  'platforms.desktopHint': 'Full charting, depth of market and expert advisors. Windows and macOS.',
  'platforms.ios': 'iPhone and iPad',
  'platforms.iosHint': 'Manage positions, fund your account and follow the market on iOS.',
  'platforms.android': 'Android',
  'platforms.androidHint': 'The same account and the same positions, on Android.',
  'platforms.download': 'Download',
  // An unconfigured platform says so. The alternative — hiding the row, or
  // showing a dead button — is either a platform the client cannot discover or
  // one that appears broken. See the page for why the link is never invented.
  'platforms.unavailable': 'Not available yet',
  'platforms.unavailableHint':
    'This download is not published yet. Your account manager can send it to you.',
  'platforms.loading': 'Loading the download links',
  'platforms.loadFailed': 'Could not load the download links.',
  'platforms.opensExternally': 'Opens the download in a new tab',

  // ── Profile ───────────────────────────────────────────────────────────────
  'profile.title': 'Profile',
  'profile.subtitle': 'Your account details, security and active sessions.',
  'profile.photoChange': 'Change photo',
  'profile.photoUpload': 'Upload a photo',
  'profile.photoRemove': 'Remove',
  'profile.photoUploading': 'Uploading...',
  'profile.photoHint': 'JPEG, PNG or WebP. Up to 2MB.',
  'profile.photoFailed': 'Could not update your photo. Please try again.',
  'profile.photoTooLarge': 'That image is larger than 2MB. Please choose a smaller one.',
  'profile.detailsTitle': 'Account details',
  'profile.firstName': 'First name',
  'profile.lastName': 'Last name',
  'profile.email': 'Email address',
  'profile.country': 'Country',
  'profile.phone': 'Phone',
  'profile.accountType': 'Account type',
  'profile.memberSince': 'Member since',
  'profile.notProvided': 'Not provided',
  'profile.emailVerified': 'Verified',
  'profile.emailUnverified': 'Not verified',
  'profile.typeIndividual': 'Individual',
  'profile.typePartner': 'Partner',
  'profile.typeReferral': 'Referred client',
  'profile.verificationTitle': 'Verification',
  'profile.verificationApproved': 'Your identity is verified.',
  'profile.verificationPending': 'Identity verification is not complete yet.',
  'profile.verificationCta': 'Continue verification',
  'profile.securityTitle': 'Password',
  'profile.securitySubtitle':
    'Changing your password signs out every other device. This one stays signed in.',
  'profile.currentPassword': 'Current password',
  'profile.newPassword': 'New password',
  'profile.confirmPassword': 'Confirm new password',
  'profile.changePasswordCta': 'Update password',
  'profile.changingPassword': 'Updating...',
  // Checked in the browser purely so the client is told before they submit. The
  // API enforces the length itself, and its answer is the one that counts.
  'profile.passwordTooShort': 'Your new password must be at least 8 characters.',
  'profile.passwordMismatch': 'Those two passwords do not match.',
  'profile.passwordChangeFailed': 'Could not update your password. Please try again.',

  'profile.sessionsTitle': 'Active sessions',
  'profile.sessionsSubtitle':
    'Everywhere your account is signed in. If you do not recognise one, sign it out and change your password.',
  'profile.sessionsLoading': 'Loading your sessions',
  'profile.sessionsLoadFailed': 'Could not load your sessions.',
  'profile.sessionCurrent': 'This device',
  'profile.sessionSignedIn': 'Signed in {when}',
  'profile.sessionLastActive': 'Last active {when}',
  'profile.sessionUnknownDevice': 'Unknown device',
  'profile.sessionRevoke': 'Sign out',
  'profile.sessionRevoking': 'Signing out...',
  'profile.sessionRevokeFailed': 'Could not sign that session out. Please try again.',
  /*
   * A DIFFERENT sentence, because it is a different world. The sign-out
   * SUCCEEDED and only the list failed to refresh; saying "could not sign that
   * session out" would report the opposite of what happened and invite the
   * client to do it again.
   */
  'profile.sessionRevokedListStale':
    'Signed out — but this list could not be refreshed. Reload the page to see it.',
  // Every session predating the metadata columns has no user agent. Saying so
  // beats an empty cell, which reads as a failed load.
  'profile.sessionNoDetails': 'No device details recorded',
  'nav.openMenu': 'Open menu',
  'nav.collapseSidebar': 'Collapse the sidebar',
  'nav.expandSidebar': 'Expand the sidebar',
  'nav.closeMenu': 'Close menu',
  'nav.collapse': 'Collapse sidebar',
  'nav.expand': 'Expand sidebar',

  // Labels for the eye toggle beside a password field. The icon alone tells a
  // screen-reader user nothing, and this control decides whether a password is
  // legible on a shared screen.
  'auth.showPassword': 'Show password',
  'auth.hidePassword': 'Hide password',

  // ── Auth: the brand panel beside every auth form ──────────────────────────
  // Shown to somebody deciding whether to hand this platform money, so it says
  // what the product is rather than welcoming them. Hidden below `lg`, where the
  // form needs the whole viewport.
  'auth.brand.headline': 'Trade global markets with a broker built for scale.',
  'auth.brand.body':
    'Segregated client funds, institutional execution and a platform your account manager can actually see. One login for your wallet, your accounts and your verification.',
  'auth.brand.pointCustody': 'Client funds held separately from company funds',
  'auth.brand.pointMarkets': 'Forex, metals, indices and crypto CFDs from one account',
  'auth.brand.pointGlobal': 'Deposits and withdrawals in USD and USDT',
  'auth.brand.footnote': 'Trading involves risk. You can lose more than your initial deposit.',

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
  'auth.login.heading': 'Welcome to OXShare',
  'auth.login.tagline': 'Sign in to your client trading portal',
  'auth.login.emailLabel': 'Email Address',
  'auth.login.emailPlaceholder': 'you@example.com',
  'auth.login.passwordPlaceholder': '••••••••',
  'auth.login.missingFields': 'Please fill in both email and password.',
  'auth.login.resendSending': 'Sending Link…',
  'auth.login.resendCooldown': 'Resend in {seconds}s',
  'auth.login.resendCta': 'Resend Verification Email',
  'auth.login.resendSuccess': 'Verification link resent! Check your inbox.',
  'auth.login.resendFailed': 'Failed to resend verification link.',

  // ── Auth: register ────────────────────────────────────────────────────────
  'auth.register.fillRequired': 'Please fill in all required fields.',
  'auth.register.success':
    'Registration successful! Please check your email to verify your account.',
  'auth.register.title': 'Create your account',
  'auth.register.subtitle': 'Start trading with OXShare',
  'auth.register.firstName': 'First Name',
  'auth.register.lastName': 'Last Name',
  'auth.register.email': 'Email Address',
  'auth.register.password': 'Password',
  'auth.register.country': 'Country',
  'auth.register.phone': 'Phone number',
  'auth.register.submit': 'Create account',
  'auth.register.submitting': 'Creating your account…',
  'auth.register.referredBy': 'Referred by partner',
  'auth.register.hasAccount': 'Already have an account?',
  'auth.register.signIn': 'Sign in',
  'auth.register.failed': 'Registration failed. Please try again.',
  'auth.register.passwordHint': 'At least 8 characters',
  'auth.register.heading': 'Create OXShare Account',
  'auth.register.tagline': 'Start trading with zero commission & deep liquidity',
  'auth.register.firstNamePlaceholder': 'John',
  'auth.register.lastNamePlaceholder': 'Doe',
  'auth.register.submitCta': 'Complete Registration',

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

  'auth.forgot.heading': 'Forgot Password',
  'auth.forgot.tagline': 'Enter your email to receive a password reset link',
  'auth.forgot.sentTitle': 'Reset Email Sent!',
  'auth.forgot.sentBody':
    'If an account exists with {email}, you will receive a reset link shortly.',
  'auth.forgot.returnToSignIn': 'Return to Sign In',
  'auth.forgot.backToSignIn': 'Back to Sign In',
  'auth.forgot.sending': 'Sending Link…',
  'auth.forgot.submitCta': 'Send Password Reset Link',
  'auth.forgot.failed': 'Failed to request password reset.',

  'auth.reset.heading': 'Set New Password',
  'auth.reset.tagline': 'Enter a new secure password for your account',
  'auth.reset.successTitle': 'Password Reset Successful!',
  'auth.reset.successBody': 'Your password has been updated. You can now log in.',
  'auth.reset.signInCta': 'Sign In to Portal',
  'auth.reset.newPassword': 'New Password',
  'auth.reset.confirmPassword': 'Confirm Password',
  'auth.reset.submitting': 'Resetting Password…',
  'auth.reset.submitCta': 'Update Password',
  'auth.reset.missingToken': 'Password reset token is missing.',
  'auth.reset.failed': 'Password reset failed.',

  'auth.verify.heading': 'Email Verification',
  'auth.verify.tagline': 'OXShare Secure Account Verification',
  'auth.verify.verifying': 'Verifying Token…',
  'auth.verify.verifyingBody': 'Please wait while we confirm your security credentials.',
  'auth.verify.verifiedTitle': 'Email Verified Successfully!',
  'auth.verify.verifiedBody':
    'Your email address has been confirmed. You now have full access to your OXShare trading account.',
  'auth.verify.redirecting': 'Redirecting to sign-in page in {seconds}s…',
  'auth.verify.pendingBodyLong':
    'We sent a verification link to your email address. Click the link to verify your account and get started.',
  'auth.verify.resendConfirmed': 'Sent! Check your inbox again.',
  'auth.verify.signInNow': 'Sign In Now',
  'auth.verify.failedHeading': 'Verification Failed',
  /*
   * UX-BACKLOG UX-01 — the three outcomes below used to be one red box.
   *
   * `failedHeading` + `invalidToken` covered "already used", "expired" and
   * "never valid" alike, so the most common of the three — a refresh, the Back
   * button, or a mail scanner that opened the link first — told a client whose
   * account WAS verified that verification had failed. In a money product that
   * is expensive: it trains people to re-request links they do not need, and it
   * is what a buyer sees if they press Back during a walkthrough.
   *
   * "Already used" is deliberately NOT phrased as an error. Nothing went wrong;
   * the address is confirmed and the only thing left to do is sign in.
   */
  'auth.verify.alreadyTitle': 'This link has already been used',
  'auth.verify.alreadyBody': 'Your email is already verified. You can sign in now.',
  'auth.verify.throttledHeading': 'Too many attempts',
  'auth.verify.throttledBody':
    'We have paused verification for a moment to keep your account safe. Wait a minute, then open the link again — nothing has gone wrong with it.',
  'auth.verify.expiredHeading': 'This link has expired',
  'auth.verify.expiredBody':
    'Verification links are valid for 24 hours. Request a new one and we will email it straight away.',
  'auth.verify.backToSignIn': 'Back to Sign In',
  'auth.verify.missingToken': 'Verification token is missing in URL parameters.',
  'auth.verify.invalidToken': 'The verification link is invalid or has expired.',
  'auth.verify.resendCta': 'Resend Verification Email',

  /*
   * The nine withdrawal-confirmation strings that lived here are GONE with the
   * emailed code and the two-step form it belonged to (FR-CORE-08 /
   * FR-IND-05): `continue`, `sendingCode`, `otpLabel`, `otpHint`, `needOtp`,
   * `restoredNotice`, `otpSendFailed` and `editDetails`. The API no longer
   * issues or verifies a code, so nothing can put them on screen.
   */
  'common.notPermittedTitle': 'Not available on your account',
  'common.notPermittedBody':
    'Your account does not have access to this. If you think that is wrong, contact support.',
  // Deliberately says the session is STILL OPEN. Only the server can end it —
  // the cookies are httpOnly — so a failed sign-out leaves the client signed in,
  // and on a shared device that is the thing they need to know.
  'session.logoutFailed': 'Sign-out failed — you are still signed in. Please try again.',
  // Screen-reader-only, behind the spinner `RequireAuth` paints while /auth/me
  // is in flight. Says what is happening rather than a bare "Loading", because
  // the outcome for some of the people who hear it is a redirect to sign in.
  'session.checking': 'Checking your session…',
  // The state that used to render as a silent redirect to the sign-in screen.
  // Saying "your session is fine" is the load-bearing half: a client who thinks
  // the portal logged them out will try to sign in again, which on the same bad
  // connection fails too and then meets the login rate limit.
  'session.unreachableTitle': 'Cannot reach OxShare',
  'session.unreachableBody':
    'Your session is still active — we could not contact the server. Check your connection and try again.',
  'session.retry': 'Try again',
  // A 401 that reached a screen without the session being ended — the refresh
  // could not be asked (offline, API down). Says so rather than "went wrong".
  'session.unconfirmed': 'We could not confirm your session. Check your connection and try again.',
  // ── The framework's error surfaces (app/error.tsx, app/not-found.tsx) ──────
  // This portal had none, so any render throw or mistyped URL landed on Next's
  // unbranded default — no chrome, no navigation, no way back — at exactly the
  // moment somebody is moving money or verifying their identity.
  'error.title': 'Something went wrong',
  'error.body':
    'This screen failed to load. Trying again often clears it; if it does not, quote the reference below to support.',
  // Says the money is fine, because that is the first thing a client wonders
  // when a broker's portal shows them an error.
  'error.backToDashboard': 'Back to dashboard',
  'notFound.title': 'Page not found',
  'notFound.body': 'That address does not match anything in the portal.',
  // Generic on purpose, mirroring what the API answers: it must not confirm
  // whether an account exists for the address the caller typed.
  'auth.verify.resendSent':
    'If that address has an unverified account, a new link is on its way. Check your inbox and spam folder.',
  'auth.verify.resendFailed': 'We could not send that email. Please try again in a moment.',
  'auth.verify.checkInbox': 'Check your inbox',
  'auth.verify.spamHint': "Didn't receive it? Check your spam folder, or resend below.",
  'auth.verify.emailPlaceholder': 'Your email address',
  'auth.verify.sending': 'Sending…',
  'auth.verify.resendLink': 'Resend link',
  'auth.verify.alreadyVerified': 'Already verified? Sign in',
  'auth.verify.signedInAs': 'Waiting on {email}',
  'auth.verify.wrongAddress': 'Wrong address? Sign out and start again.',

  'common.loadingEllipsis': 'Loading…',

  // ── Wallet ────────────────────────────────────────────────────────────────
  'wallet.title': 'Wallet',
  'wallet.subtitle': 'View your central wallet balances and manage fund allocation',
  'wallet.available': 'Available',
  'wallet.onHold': '{amount} on hold · {total} total',
  'wallet.empty': 'You have no wallets yet.',
  'wallet.loading': 'Loading your wallet balances',
  'wallet.loadFailed': 'Could not load your wallet balances.',
  'wallet.heading': 'My Wallet',
  'wallet.notOpened': 'Not opened yet. This wallet appears after your first {currency} deposit.',
  'wallet.deposit': 'Deposit',
  'wallet.depositUsdt': 'Deposit USDT',
  'wallet.withdraw': 'Withdraw',
  'wallet.transfer': 'Transfer',
  // What each wallet is FOR, under the figure. Says the role rather than
  // repeating the currency code already printed beside the number.
  'wallet.usdNote': 'Your primary fiat balance for funding trading accounts.',
  'wallet.usdtNote': 'Tether on the TRC20 network.',

  // ── Transactions (CORE-13) ────────────────────────────────────────────────
  'transactions.title': 'Transactions',
  'transactions.subtitle': 'Every deposit, withdrawal and transfer on your account',
  'transactions.loading': 'Loading your transactions',
  'transactions.loadFailed': 'Could not load your transactions.',
  'transactions.empty': 'No transactions yet',

  'transactions.emptyBody': 'Deposits and withdrawals will appear here as they happen.',
  'transactions.colDate': 'Date',
  'transactions.colType': 'Type',
  'transactions.colAmount': 'Amount',
  'transactions.colStatus': 'Status',
  /*
   * The detail view a refused withdrawal had nowhere to put.
   *
   * `rejectionReason`, `destination`, `providerRef`, `reviewedAt` and
   * `settledAt` all ride on the client's own transactions response and no
   * screen read them — so a client whose payout was refused saw a red pill and
   * could not find out why from anywhere they could return to.
   */
  'transactions.detailReason': 'Why this was refused',
  'transactions.detailState': 'Status',
  'transactions.detailDestination': 'Sent to',
  'transactions.detailReference': 'Reference',
  'transactions.detailReviewed': 'Reviewed',
  'transactions.detailSettled': 'Completed',
  'transactions.detailOpen': 'View details',
  // `colReference` is gone with its column: a 20-character opaque provider id
  // that a client has no use for in a list, taking the width that made every
  // other column readable. It is still on the deposit confirmation, which is
  // where somebody actually needs to quote it.
  'transactions.deposit': 'Deposit',
  'transactions.withdrawal': 'Withdrawal',
  // Wallet ⇄ trading account, named from the WALLET's side so the words match
  // the sign on the amount beside them. Never "Deposit": a client reading that
  // for a transfer goes looking for a payment they never made.
  'transactions.transferIn': 'Transfer in',
  'transactions.transferOut': 'Transfer out',
  // A partner moving earnings into their spending wallet. NOT "Transfer in":
  // that names a wallet ⇄ trading-account move, and one label for both would
  // tell a partner their commission went to a trading account. Never has an
  // "out" twin — the commission wallet's matching debit is not a row here.
  'transactions.commissionTransfer': 'Commission transfer',
  // What a transfer moved through, where a deposit would name its payment
  // method. More useful than an em dash — it names the other end of the
  // movement, which is the question the column asks.
  'transactions.tradingAccountMethod': 'Trading account',
  'transactions.commissionMethod': 'Commission wallet',
  'transactions.statePending': 'Pending review',
  // A TRANSFER's pending state. "Pending review" is accurate for a withdrawal —
  // an operator really does review it — and wrong for a wallet ⇄ account
  // transfer, which nobody reviews: it is waiting on the trading server. A
  // client told their own transfer is under review goes looking for the desk
  // that is holding it up, and there isn't one.
  'transactions.stateProcessing': 'Processing',
  'transactions.stateApproved': 'Approved',
  'transactions.stateSuccess': 'Completed',
  'transactions.stateRejected': 'Rejected',
  'transactions.stateFailure': 'Failed',

  // ── Withdraw (CORE-07 / CORE-08) ──────────────────────────────────────────
  'withdraw.title': 'Withdraw',
  'withdraw.subtitle': 'Request a withdrawal from your available balance',
  'withdraw.loading': 'Loading your balances',
  'withdraw.loadFailed': 'Could not load your balances.',
  'withdraw.amount': 'Amount',
  'withdraw.amountPlaceholder': '0.00',
  'withdraw.available': 'Available: {amount}',
  /*
   * ── The payout-target field, per rail ────────────────────────────────────
   *
   * `withdraw.destination*` is GONE. It labelled the field "Destination" — a
   * database column, not a question — and its placeholder listed "IBAN, or your
   * USDT TRC20 address", so a client paying out over Whish was asked for a
   * destination and shown an IBAN hint for a rail they had not chosen.
   *
   * Each rail names its own field now, through
   * `components/money/withdrawal-fields.tsx`. Adding a rail means a row in
   * `withdrawal_payment_methods` and a pair of keys here.
   */
  // The SECTION heading above the per-rail field. "Recipient" rather than
  // "Destination": it names who is being paid, which is the question, where
  // the old word named a database column.
  'withdraw.recipient': 'Recipient',
  'withdraw.whishPhoneLabel': 'Whish phone number',
  // Names the consequence rather than saying "double-check", and says WHOSE
  // number it has to be — a client who has just typed their own needs to know.
  'withdraw.whishPhoneHint':
    'The Whish account that will receive the money. A payout sent to the wrong number cannot be recalled.',
  // The fallback for a rail this build does not know yet — `{method}` is the
  // operator's own name for it, so the field is still specific.
  'withdraw.genericAccountLabel': '{method} account',
  'withdraw.genericAccountHint':
    'The {method} account that will receive the money. A payout sent to the wrong account cannot be recalled.',
  'withdraw.submit': 'Request withdrawal',
  'withdraw.submitting': 'Submitting…',
  'withdraw.needMethod': 'Choose how you want to be paid.',
  'withdraw.needAmount': 'Enter an amount to withdraw.',
  'withdraw.needDestination': 'Enter where the funds should be sent.',
  'withdraw.failed': 'Could not submit your withdrawal request.',
  'withdraw.method': 'Withdraw with',
  /*
   * Two steps: the RAIL, then the amount and whatever that rail needs.
   *
   * The method is asked first because it decides what the second step asks for
   * — a phone number on Whish, something else on the next rail. The single page
   * this replaced asked for a payout target before the client had said where it
   * was going.
   */
  'withdraw.stepDetails': 'Details',
  // Step one: WHICH BALANCE is being spent. It was a currency dropdown buried
  // in the amount section that only appeared when more than one wallet was
  // funded — so a client with one wallet never saw which balance they were
  // spending from at all.
  'withdraw.stepMethod': 'Method',
  'withdraw.stepWallet': 'Which wallet?',
  'withdraw.needWallet': 'Choose the wallet you want to withdraw from.',
  'withdraw.fromWallet': '{currency} wallet · {amount}',
  'withdraw.continue': 'Continue',
  'withdraw.noMethods':
    'Withdrawals are unavailable at the moment. Please check back shortly or contact support.',
  'withdraw.submittedTitle': 'Withdrawal requested',
  'withdraw.submittedBody':
    'Your request is with our team for review. The amount is held against your balance until it is approved or declined, and you will be emailed either way.',
  'withdraw.viewTransactions': 'View your transactions',
  'withdraw.noWallets': 'You have no funded wallet to withdraw from yet.',
  /*
   * `withdraw.reviewNote` is GONE — "every withdrawal is reviewed by our team
   * before any funds move" no longer sits beside the payout field. The
   * confirmation screen (`submittedBody` above) already says the request is with
   * the team and that the amount is held, which is the moment that is worth
   * telling a client; on the form it was a paragraph to read about something
   * they had not done yet.
   */

  // ── Deposit (CORE-06) ─────────────────────────────────────────────────────
  'deposit.methodTitle': 'How are you sending it?',
  // Step three's own heading, in the same voice as step one's. `money.stepAmount`
  // is the STEP RAIL's word — one syllable, because a rail has room for a label
  // and not a question.
  'deposit.amountTitle': 'How much are you sending?',
  // The STEP BAR's label for the same question. Short where the section title
  // is a sentence: a bar has room for a word, and the section below it is
  // already asking properly.
  'deposit.stepMethod': 'Method',
  // The step-bar label for 'where does this money land' — wallet, or straight
  // on to a trading account.
  'deposit.stepDestination': 'Destination',
  // The RAIL's word for step three. One noun, where the section heading below it
  // asks the question in full — a rail has room for a label, not a sentence.
  'deposit.stepAmountShort': 'Amount',
  // The per-method labels and hints that used to sit here are GONE, not
  // orphaned: the methods come from `GET /payments/methods` now, and their
  // names and instructions are the operator's own words rendered verbatim.
  // Keeping translated copy for "Bank transfer" would mean two names for one
  // method, and the one on screen would be whichever the code happened to
  // reach for.
  'deposit.loadingMethods': 'Loading the ways you can pay',
  'deposit.methodsFailed': 'Could not load the payment methods.',
  'deposit.noMethods': 'No deposit methods are available yet',
  'deposit.noMethodsBody':
    'Your account manager has not set up a way to receive deposits on your account. Contact them and they will enable one.',
  'deposit.amountLabel': 'Amount',
  'deposit.submit': 'Get my deposit reference',
  'deposit.submitting': 'Creating...',
  'deposit.failed': 'Could not create your deposit request. Please try again.',
  // Says plainly that nothing has moved. A client who reads "deposit created"
  // and stops there will wait for a balance that is never coming.
  'deposit.pendingTitle': 'Send your transfer now',
  'deposit.pendingBody':
    'Nothing has been credited yet. Send {amount} and quote the reference below, and we will credit your wallet once it arrives.',
  'deposit.referenceLabel': 'Your reference',
  'deposit.copyReference': 'Copy reference',
  'deposit.referenceCopied': 'Copied',
  'deposit.referenceWarning':
    'Transfers without this reference take longer to match and may be returned.',
  'deposit.instructionsTitle': 'Where to send it',
  'deposit.newRequest': 'Start another deposit',
  'deposit.trackIt': 'Track it on your transactions',
  // The account details are operator data, served by `GET /payments/methods`
  // and rendered verbatim — `deposit.instructionsPending` said the portal did
  // not publish them and is gone with the endpoint that replaced it.
  'deposit.viaMethod': 'By {method}',
  'deposit.payToLabel': 'Send to',
  'deposit.instructionsLabel': 'Instructions',
  // Only rendered where the operator actually set a limit. Three keys rather
  // than one with an optional half, because "Between $10 and —" is the kind of
  // sentence a template with a missing value produces.
  'deposit.minMax': 'Between {min} and {max} per transfer.',
  'deposit.minOnly': 'Minimum {min} per transfer.',
  'deposit.maxOnly': 'Maximum {max} per transfer.',

  // ── Transfer (wallet ⇄ trading account) ───────────────────────────────────
  // The screen behind these is LIVE. It was a placeholder when these strings
  // were written — `POST /payments/transfers` worked and nothing listed the
  // client's trading accounts — and `GET /trading/accounts/transferable` has
  // since filled that gap: app/transfer/page.tsx has a full picker with
  // `?account=` preselection.
  'transfer.title': 'Transfer',
  'transfer.subtitle': 'Move funds between your wallet and a trading account',
  'transfer.loading': 'Loading your trading accounts',
  'transfer.loadFailed': 'Could not load your trading accounts.',
  'transfer.directionTitle': 'Which way?',
  'transfer.toAccount': 'Wallet → Trading account',
  'transfer.toAccountHint': 'Fund an account so you can trade with it.',
  'transfer.toWallet': 'Trading account → Wallet',
  'transfer.toWalletHint': 'Bring funds back so you can withdraw them.',
  'transfer.accountTitle': 'Which account?',
  'transfer.noAccounts': 'No live trading accounts yet',
  /*
   * Says LIVE specifically. A client holding only a demo account has accounts —
   * telling them they have none would be the same false statement the accounts
   * page once made — but none that money can move to.
   */
  'transfer.noAccountsBody':
    'Transfers move real money, so they need a live account. Demo accounts trade practice funds ' +
    'and are not linked to your wallet.',
  'transfer.submit': 'Transfer funds',
  'transfer.submitting': 'Transferring…',
  'transfer.failed': 'Could not complete the transfer. Please try again.',
  'transfer.confirmTitle': 'Confirm the transfer',
  'transfer.from': 'From',
  'transfer.to': 'To',
  'transfer.walletLabel': '{currency} wallet',
  'transfer.accountLabel': 'Account {login}',
  // Shown when a source has nowhere to send money — a wallet in a currency no
  // live account is held in. Names the currency, because "no destinations" on
  // its own reads as a broken screen rather than as a fact about this wallet.
  'transfer.noDestination':
    'You have no live trading account in {currency}, so there is nowhere to move this money to. ' +
    'Open one, or go back and choose a different source.',
  // A wallet the client has never held a balance in. NOT "0.00" — an unopened
  // wallet is an absence, and the transfer is still allowed because the server
  // decides that, not this screen.
  'transfer.walletUnopened': 'Not opened yet',
  /*
   * The settlement caveat, stated on the confirmation. A transfer is asynchronous
   * — `wallet_to_account` HOLDS the amount and credits nothing until the bridge
   * confirms — so a screen implying the money has arrived is wrong at exactly
   * the moment a client checks their platform and finds nothing.
   */
  'transfer.settlementNote':
    'Transfers are processed in order and can take a few moments to appear. The amount is held ' +
    'until it settles.',
  'transfer.doneTitle': 'Transfer submitted',
  'transfer.doneBody':
    'Your transfer is being processed. It will appear in your transactions once it settles.',
  'transfer.another': 'Make another transfer',

  // ── Dashboard ─────────────────────────────────────────────────────────────
  'dashboard.title': 'Trading Overview',
  'dashboard.liveBadge': 'Live MT5 Sync',
  'dashboard.welcome':
    'Welcome back! Monitor your live balances, trading accounts, and recent transactions.',
  'dashboard.recentTitle': 'Recent Activity',
  'dashboard.recentSubtitle': 'Latest deposits, withdrawals, and MT5 transfers',
  'dashboard.viewAll': 'View All',
  'dashboard.noActivityTitle': 'No Transactions Recorded Yet',
  'dashboard.newAccount': 'New Account',
  'dashboard.statTradingAccounts': 'Trading Accounts',
  'dashboard.statActiveMt5': 'Active MT5',
  'dashboard.statPendingTx': 'Pending Transactions',
  'dashboard.statThisMonth': 'This Month',
  'dashboard.instantDeposit': 'Instant Deposit',
  'dashboard.instantDepositHint': 'Fund your wallet via USDT or Wire',
  'dashboard.internalTransfer': 'Internal Transfer',
  'dashboard.internalTransferHint': 'Move funds between MT5 accounts',
  'dashboard.kycStatus': 'KYC Status',
  /*
   * UNUSED, deliberately kept rather than deleted.
   *
   * `KycStatusCard` renders NOTHING for an approved client now — a permanent
   * "Level 1 Verified" card is a status light that never changes, telling
   * somebody something they cannot act on while pushing the data they came for
   * down the page. The header pill was removed for the same reason.
   *
   * The string stays because "verified" is a state a future screen may need to
   * name (a profile summary, an account-status page), and rewriting it later
   * risks a different wording for the same fact. Delete it if that never comes.
   */
  'dashboard.kycVerified': 'Level 1 Verified • Trading Enabled',
  // The other four states this card can be in. Only `kycVerified` existed, and
  // it was rendered unconditionally — so every client, including one who had
  // just registered, was told trading was enabled.
  'dashboard.kycLoading': 'Checking your verification status…',
  'dashboard.kycPending': 'Under review — we will email you when it is complete.',
  'dashboard.kycRejected': 'Action required — your documents were not approved.',
  'dashboard.kycNotStarted': 'Not started — verify your identity to enable trading.',
  'dashboard.openPositions': '{count} Open Positions',
  'dashboard.underReview': '{count} Under Review',
  'dashboard.noActivityBody':
    'Your recent deposits, withdrawals and transfers will appear here automatically.',
  // ── Opening an account ────────────────────────────────────────────────────
  // "Live" and "Demo" are jargon to somebody opening their first account, so
  // each option says what it MEANS. Only one distinction matters and it is
  // expensive in one direction.
  'accounts.live': 'Live account',
  'accounts.liveBody': 'Trades with real money. Fund it from your wallet once it is open.',
  // Each tab opens its OWN kind of account, so the button says which — "Open
  // account" inside the Demo tab leaves a client wondering what they will get.
  'accounts.openLiveTitle': 'Open a live account',
  'accounts.openDemoTitle': 'Open a demo account',
  'accounts.openConfirm': 'Open account',
  'accounts.opening': 'Opening…',
  'accounts.cancel': 'Cancel',

  /*
   * `accounts.fieldType` and `accounts.typeCurrencyHint` are GONE.
   *
   * They belonged to a single "Account type" dropdown that listed MT5 group
   * paths and a hint saying which currency the chosen one was held in. The form
   * asks the two real questions now — currency and product — and derives the
   * group, so a label for the path and a hint restating the currency the client
   * just picked are both answering questions nobody is asked any more.
   */
  'accounts.fieldCurrency': 'Currency',
  'accounts.fieldProduct': 'Product',
  // Stated rather than asked when a currency carries exactly one product: a
  // select that cannot be changed is a label wearing a control's clothes.
  // 'accounts.onlyProduct' is GONE. It read "Opening a {product} account." and
  // stood in for the product SELECT whenever a currency carried exactly one —
  // so the field a client most wants to confirm was the one field the form did
  // not show. The select is now always rendered, matching the currency field
  // directly above it, which has always shown its single option.
  // 'accounts.leverageHint' is GONE. It explained what leverage is under a field
  // whose every option is written as a ratio, on a form that opens a trading
  // account — a standing paragraph of prose between two controls, read once and
  // then read past. The risk it named is real and belongs where the risk is
  // taken, not under a dropdown at account-opening time.
  'accounts.fieldLeverage': 'Leverage',

  // Shown INSTEAD of the create button when the broker has not switched this
  // environment on. Silence there reads as a broken page.
  'accounts.liveClosed':
    'Live accounts cannot be opened online yet. Contact support and we will open one for you.',
  'accounts.demoClosed':
    'Demo accounts cannot be opened online yet. Contact support and we will open one for you.',

  // Shown INSTEAD of the create button once the client is at the limit — the
  // reason, in the place the control was, rather than a control that refuses.
  'accounts.capReached': 'You have reached the maximum of {max} accounts of this kind.',

  'accounts.fieldName': 'Account name',
  // The placeholder does the hint's job by example. 'accounts.nameHint' said the
  // name was optional and is gone with that: the field is now REQUIRED, so the
  // string was not merely surplus, it was wrong.
  'accounts.namePlaceholder': 'Swing trading',
  // Shown ON the name field, from two sources that must say the same thing: the
  // form's own check against the names already on screen, and the API's
  // ACCOUNT_NAME_TAKEN when the two disagree. Deliberately does not name the
  // clashing account — the client is looking at their own list.
  'accounts.nameTaken': 'You already have an account with this name.',
  'accounts.fieldStartingBalance': 'Starting balance',
  'accounts.startingBalanceHint':
    'Practice money, up to {max}. Choose an amount close to what you would really trade — the practice is only useful if the position sizes are.',
  'accounts.colBalance': 'Balance',

  // Per-tab, so each says what is missing rather than "no accounts" twice.
  'accounts.liveEmpty': 'No live accounts yet',
  'accounts.liveEmptyBody':
    'A live account trades real money. Open one, then fund it from your wallet.',
  'accounts.demoEmpty': 'No demo accounts yet',
  'accounts.demoEmptyBody':
    'A demo account trades practice money. Nothing is at risk, and you do not need to be verified.',

  'accounts.openLive': 'Open a live account',
  'accounts.demo': 'Demo account',
  'accounts.demoBody': 'Trades with practice money. Nothing at risk, and no verification needed.',
  'accounts.openDemo': 'Open a demo account',
  'accounts.openFailed': 'That account could not be opened. Please try again.',
  // The self-service request failed — which is NOT "the broker has switched
  // this off". Naming the retry rather than the failure, because pressing it is
  // the only thing the client can do about it.
  'accounts.availabilityRetry': 'Retry',
  'accounts.liveNeedsKyc':
    'A live account needs your identity verified first. You can open a demo account right now without it.',
  'accounts.verifyNow': 'Verify my identity',

  'accounts.openedTitle': 'Your account is ready',
  'accounts.openedDone': 'Done',
  'accounts.credentialsEmailed':
    'Your login and passwords have been emailed to {email}. They are not shown here.',
  'accounts.credentialsNoCopy':
    'We keep no copy of your passwords. If the email does not arrive, contact support and we will set a new one — they cannot be looked up.',
  'accounts.colLogin': 'Login',
  'accounts.colCurrency': 'Currency',
  'accounts.colLeverage': 'Leverage',
  'accounts.colEnvironment': 'Type',

  'accounts.emptyBody': 'Create an MT5 live or demo account to start trading.',
  'dashboard.recentTransactions': 'Recent Transactions',

  'wallet.usdWallet': 'USD Wallet',
  'wallet.usdtWallet': 'USDT TRC20',

  'accounts.title': 'Trading Accounts',
  'accounts.subtitle': 'Manage your MetaTrader 5 trading accounts and leverage settings',
  'accounts.openNew': 'Open New Account',
  'accounts.empty': 'No Active Trading Accounts',

  // ── Live / demo, from GET /trading/accounts ───────────────────────────────
  //
  // "Live" rather than "Real", matching the `trading_environment` enum and the
  // MT5 vocabulary the client already sees in the terminal. One word for one
  // thing across the whole product: a portal that says "Real" beside a terminal
  // that says "Live" makes people ask whether they are the same account.
  'accounts.loading': 'Loading your trading accounts',
  'accounts.loadFailed': 'We could not load your trading accounts.',
  'accounts.liveHeading': 'Live accounts',
  'accounts.liveNote': 'Real funds. Trades on these accounts move your balance.',
  'accounts.demoHeading': 'Demo accounts',
  'accounts.demoNote': 'Practice money. Nothing here affects your wallet.',
  'accounts.liveTag': 'Live',
  'accounts.demoTag': 'Demo',
  'accounts.loginLabel': 'MT5 login',
  // 'accounts.groupLabel' and 'accounts.tierLabel' are GONE with the two rows
  // that used them. Both rendered a permanent em dash: nothing has ever written
  // `trading_accounts.tier`, and `mt5_group` was not persisted at creation. The
  // card now names the PRODUCT, which is the answer the client themselves gave
  // when they opened the account. The group survives on the detail screen,
  // where a server path is a support detail rather than a label.
  'accounts.productLabel': 'Product',
  'accounts.leverageLabel': 'Leverage',
  'accounts.openedLabel': 'Opened',
  'accounts.leverageValue': '1:{ratio}',
  // Shown where the CRM genuinely holds no value for a field. An em dash rather
  // than a zero or a guess — the same rule the wallet follows for a currency
  // that has not been opened.
  'accounts.unknownValue': '—',
  'accounts.noneOfKind': 'None yet.',

  // ── One account: /accounts/[id] ───────────────────────────────────────────
  //
  // The screen states WHERE each number came from, because it shows two that can
  // legitimately disagree: the CRM's cached balance and MT5's live one. Two
  // unlabelled money figures that differ is worse than one figure.
  'accounts.viewDetail': 'View account',
  'accounts.detailBack': 'All accounts',
  'accounts.detailLoading': 'Loading this account',
  'accounts.detailLoadFailed': 'We could not load this account.',
  'accounts.detailNotFound': 'Account not found',
  'accounts.detailNotFoundBody':
    'This account does not exist, or it is not one of yours. Check the link and try again from ' +
    'your accounts list.',

  // The live panel. "Live figures" rather than "real-time": the numbers are read
  // when the page loads, and calling them real-time promises a stream that is
  // not there.
  'accounts.liveFiguresTitle': 'Live from MetaTrader 5',
  /*
   * The state BEFORE the first read lands. It used to say "read from the
   * trading server when this page loaded", which stopped being true when the
   * panel started polling — and a note claiming the figure is as old as the
   * page, on a panel refreshing every ten seconds, is worse than no note.
   */
  'accounts.liveFiguresNote': 'Live from MetaTrader 5',
  'accounts.liveFiguresReadAt': 'Live from MetaTrader 5 · read at {time}',
  'accounts.equityLabel': 'Equity',
  'accounts.equityHint': 'Balance plus credit plus open profit — what you can act on.',
  'accounts.floatingLabel': 'Floating P/L',
  'accounts.floatingHint': 'Unrealised, across all open positions.',
  'accounts.marginLabel': 'Margin used',
  'accounts.freeMarginLabel': 'Free margin',
  'accounts.marginLevelLabel': 'Margin level',
  // Null margin level means "no margin requirement at all", which is not zero.
  'accounts.marginLevelNone': 'No open positions',
  'accounts.creditLabel': 'Credit',
  /*
   * The tile using this label went unrendered until 27 Aug, and the arithmetic
   * on the panel was wrong because of it: `floating` is derived server-side as
   * `equity - balance - credit`, so on an account carrying a bonus the three
   * figures shown did not add up and nothing on screen accounted for the gap.
   */
  'accounts.creditHint': 'Counts toward equity; it is not withdrawable.',
  'accounts.mt5BalanceLabel': 'Balance',
  'accounts.mt5BalanceHint': 'Cash on the account, excluding open profit.',
  // The two reasons live figures are missing. They must not share a string: one
  // is permanent and about this account, the other is temporary and about the
  // platform.
  'accounts.liveNoLogin': 'Not on the trading server yet',
  'accounts.liveNoLoginBody':
    'This account has no MetaTrader 5 login, so there are no live figures to read. It will ' +
    'appear here once the login is issued.',
  'accounts.liveUnavailable': 'Live figures unavailable',
  'accounts.liveUnavailableBody':
    'The trading server could not be reached just now. Your balance on record is shown below, ' +
    'and it is unaffected.',

  // ── Open positions, live from MT5 ─────────────────────────────────────────
  //
  // Every figure moves on every tick, so the panel states WHEN it was read. A
  // trading number with no indication of its age gets treated as current
  // however old it is.
  /*
   * ⚠️ CLOSED trades, not open ones. The open-positions table was removed from
   * this page and its copy went with it — `positionsLive`, `positionsReadAt`
   * and the live-reading language, which only made sense for a figure that
   * moves on every tick.
   *
   * A closed trade is SETTLED: its result does not change after the fact, so
   * there is no read time to caveat and no polling to explain. What has to be
   * said instead is the WINDOW, because the totals are computed over it rather
   * than over the account's lifetime.
   */
  'accounts.positionsTitle': 'Closed positions',
  'accounts.positionsWindow': 'Realised trades, last 30 days.',
  'accounts.positionsLoading': 'Loading your closed positions',
  'accounts.positionsLoadFailed': 'We could not load your closed positions.',
  /*
   * Said flatly, and it names the WINDOW rather than the account.
   *
   * "Nothing closed on this account" would be wrong for the common case that
   * produced it: a client who traded three months ago and nothing since. The
   * period is the reason the table is empty, so the period is what the sentence
   * has to mention — otherwise a client reads it as their history being lost.
   */
  'accounts.positionsEmpty': 'No trades closed on this account in the last 30 days.',
  'accounts.positionsCapped':
    'Showing the most recent trades in this period. Older ones are not listed.',
  'accounts.sideBuy': 'Buy',
  'accounts.sideSell': 'Sell',
  'accounts.colSide': 'Side',
  'accounts.colClosePrice': 'Price',
  'accounts.colSwap': 'Swap',
  'accounts.colCommission': 'Commission',
  'accounts.colRealised': 'Realised P/L',
  'accounts.colClosed': 'Closed',
  'accounts.openTerminal': 'Open MetaTrader 5',

  // ── Closed-trade totals, over the SAME window as the table ───────────────
  //
  // `netProfit` is what a client looks for first, so it leads. The rest is the
  // arithmetic behind it — a net figure with no gross either side is a number
  // nobody can check.
  'accounts.statsNet': 'Net P/L',
  'accounts.statsTrades': 'Trades',
  'accounts.statsWinRate': 'Win rate',
  'accounts.statsVolume': 'Volume',
  'accounts.statsBest': 'Best trade',
  'accounts.statsWorst': 'Worst trade',
  // Wins and losses together, because a win rate without its denominator
  // invites reading 100% off a single trade as a track record.
  'accounts.statsWinLoss': '{wins} won · {losses} lost',
  'accounts.statsNoTrades': '—',

  // ── Deposits and withdrawals on ONE account ───────────────────────────────
  //
  // "Deposits and withdrawals" from the ACCOUNT's point of view, which is the
  // page the reader is on: money into this account is a deposit, whichever
  // direction the API records it in.
  //
  // Rendered for LIVE accounts only — a demo account cannot receive a transfer,
  // so the panel would be permanently empty and would invite a client to look
  // for a button that does not apply to practice money.
  'accounts.transactionsTitle': 'Deposits and withdrawals',
  'accounts.transactionsNote': 'Transfers between your wallet and this account.',
  'accounts.transactionsLoading': 'Loading this account transfers',
  'accounts.transactionsLoadFailed': 'We could not load this account transfers.',
  'accounts.transactionsEmpty': 'Nothing has moved in or out of this account yet.',
  'accounts.transfer': 'transfer',
  'accounts.transfersPlural': 'transfers',
  'accounts.colDirection': 'Direction',
  'accounts.colAmount': 'Amount',
  'accounts.colState': 'Status',
  'accounts.directionDeposit': 'Deposit',
  'accounts.directionWithdrawal': 'Withdrawal',
  // `pending` is the state that earns its place: a wallet→account transfer
  // holds the amount while the bridge confirms, so a client who cannot see it
  // has money that has left their wallet and not arrived.
  'accounts.stateSettled': 'Settled',
  'accounts.statePending': 'Pending',
  'accounts.stateFailed': 'Failed',

  // ── Table columns, shared across the account panels ───────────────────────
  //
  // What is left of a longer block: these mostly belonged to the deal table on
  // the Activity card, and both that table and the card itself are gone. Only
  // the headers the transfers and positions tables still use survive.
  'accounts.colTime': 'When',
  'accounts.colSymbol': 'Symbol',
  'accounts.colVolume': 'Volume',

  'kyc.resumingTitle': 'Resuming Identity Verification',
  'kyc.resumingBody': 'Fetching your progress and loading your last active step…',
  'kyc.layoutTitle': 'Identity Verification',
  'dashboard.firstDeposit': 'Make Your First Deposit',

  // ── KYC ───────────────────────────────────────────────────────────────────
  'kyc.required': 'Required',
  // Sidebar badge states — see kycNavBadge() in portal-layout.tsx. There is
  // deliberately no "verified" string: a badge is a call to action, and an
  // approved client has none.
  'kyc.badgeInReview': 'In review',
  'kyc.badgeActionRequired': 'Action needed',
  'kyc.approvedBody':
    'Your identity has been verified successfully. You now have full access to trading accounts and features.',
  'kyc.rejectedBody':
    'Your KYC documents were not approved. Please review the requirements and re-submit your verification.',
  'kyc.submittedBody':
    "Your documents have been received and are currently under compliance review. This process usually takes 1–2 business days. We'll update your account status once review is complete.",
  'kyc.resuming': 'Resuming your verification…',
  'kyc.submittedTitle': 'Verification Submitted',
  'kyc.approvedTitle': 'KYC Approved!',
  'kyc.rejectedTitle': 'KYC Verification Rejected',
  'kyc.backToDashboard': 'Back to Dashboard',
  'kyc.loadFailedShort': 'Could not load your verification details',
  'kyc.loadFailed': 'Could not load your verification details.',
  'kyc.optionalUpload': 'Optional',
  // Sets the expectation before they choose: a passport needs one photo, an ID
  // card needs two. Plural handled by the count itself reading naturally.
  'kyc.pageCount': '{count} photo(s)',
  // Names the slot, because "please complete this step" leaves a client
  // hunting for which of several uploads is missing.
  'kyc.needUpload': 'Please upload: {label}',
  // A rejected client needs to know WHY and be able to act on it. The screen
  // previously said "review the requirements and re-submit" and offered neither
  // the reason nor a route back to the form.
  'kyc.reapply': 'Update and re-submit',
  'kyc.rejectionReasonLabel': 'Why it was returned',
  'kyc.rejectedFieldsLabel': 'What needs fixing',
  // The review screen is appended by the client, not configured in the admin
  // builder — see the note in kyc/step/[step]/page.tsx — so its copy lives here
  // rather than arriving from /kyc/config like every other step's.
  'kyc.reviewTitle': 'Review & Submit',
  'kyc.reviewDescription': 'Confirm all details and submit your application for compliance review.',
  'kyc.statusLoadFailed': 'Could not load your verification status.',
  'kyc.uploadTooLarge':
    'That file is {size} MB. The limit is {limit} MB — please upload a smaller scan or photo.',
  'kyc.uploadFailed': 'Upload failed. Please try again.',
  'kyc.selfieFailed': 'Could not upload your selfie. Please retake it.',
  'kyc.selfieRetake': 'Retake',
  'kyc.selfieCapture': 'Capture',

  // ── KYC: review summary and steps ─────────────────────────────────────────
  'kyc.personalInfo': 'Personal Information',
  'kyc.fullName': 'Full Name',
  'kyc.dateOfBirth': 'Date of Birth',
  'kyc.phone': 'Phone',
  'kyc.nationality': 'Nationality',
  'kyc.country': 'Country',
  'kyc.verificationFiles': 'Verification Files',
  'kyc.idDocument': 'ID Document',
  'kyc.selfiePhoto': 'Selfie Photo',
  'kyc.proofOfAddress': 'Proof of Address',
  'kyc.uploaded': 'Uploaded',
  'kyc.captured': 'Captured',
  'kyc.missing': 'Missing',
  'kyc.docNationalId': 'National ID',
  'kyc.docDrivingLicense': 'Driving License',
  'kyc.docUtilityBill': 'Utility Bill',
  'kyc.docBankStatement': 'Bank Statement',
  'kyc.docTenancyAgreement': 'Tenancy Agreement',
  'kyc.loadingTitle': 'Loading Verification Details…',
  'kyc.loadingBody': 'Restoring your step progress and form data',
  'kyc.rejectionNote': 'Admin Rejection Note:',
  'kyc.actionRequired': '⚠️ Action Required: KYC Returned for Correction',
  'kyc.updateHighlighted':
    'Please update the highlighted fields below with valid information and click continue. Your existing data remains saved.',
  'kyc.documentReturned': '⚠️ Document Returned for Correction',
  'kyc.correctField': '⚠️ Correct Field',
  'kyc.submitCta': 'Submit Verification',
  'kyc.processing': 'Processing…',
  'kyc.requiredFields': 'Please fill in all required fields.',
  'kyc.tooYoung': 'You must be at least 18 years old to register and complete KYC.',
  'kyc.needDocFront': 'Please upload the front of your document.',
  'kyc.needSelfie': 'Please take or upload your selfie.',
  'kyc.needAddressProof': 'Please upload your proof of address.',
  // Said when a photo is CHOSEN but not confirmed. "Please upload" is true of
  // the system and useless to the person, who is looking at their own photo
  // with the button that sends it a few pixels away.
  'kyc.confirmChosenPhoto': 'Almost there — tap "Use this" under your photo to send it.',

  // ── KYC: capture and upload ───────────────────────────────────────────────
  'kyc.cameraDeniedTitle': 'Camera Access Required',
  'kyc.cameraDeniedBody': 'Please allow camera permissions in your browser to take your selfie.',
  // Why the camera is required, and the two things that actually block it.
  // A client in a social app's in-app browser gets no getUserMedia at all and
  // would otherwise be stuck with no explanation.
  'kyc.cameraDeniedHow':
    'A live photo is required for this step, so we can tell it is really you. Allow camera access in your browser settings — or if you opened this link inside another app, open it in Safari or Chrome instead.',
  'kyc.cameraRetry': 'Retry Camera',
  'kyc.cameraHint': 'Center your face inside the circle and click snap photo.',
  'kyc.snapPhoto': 'Snap Photo',
  'kyc.uploadingSelfie': 'Uploading…',
  'kyc.selfieCaptured': 'Selfie Captured',
  'kyc.retakePhoto': 'Retake Photo',
  'kyc.encodeFailed': 'Could not encode the captured image.',
  'kyc.uploadingFile': 'Uploading File…',
  'kyc.uploadWait': 'Please wait a moment',
  'kyc.replaceHint': 'Replace',
  'kyc.uploadFormats': 'PNG, JPG, PDF · Max {limit}MB',
  // Device-neutral: most clients are on a phone, which has neither a drag nor a
  // drop. The two buttons beside this say what to actually do.
  'kyc.dropHint': 'Take a photo of the document, or choose a file you already have',
  'kyc.takePhoto': 'Take photo',
  'kyc.chooseFile': 'Choose file',
  // The confirm step. The photo is NOT on the server yet at this point, which is
  // the whole reason the step exists — a blurry shot costs nothing to redo here
  // and costs a full mobile upload once it has been sent.
  'kyc.preparingImage': 'Preparing your photo…',
  'kyc.lowResolutionWarning':
    'This photo is quite small and may be hard to read. If you can, retake it closer or in better light.',
  'kyc.checkBeforeSending': 'Is the whole document visible and readable?',
  'kyc.useThisPhoto': 'Use this',
  'kyc.chooseAnother': 'Retake',
  'kyc.passportLabel': 'Passport bio page (required)',
  'kyc.passportHint': 'The main photo and signature page of your passport',
  'kyc.needDocBack': 'Please upload the back side of your {document}.',
  'kyc.enterField': 'Enter {label}',
  'kyc.selectField': 'Select {label}',
  'kyc.uploadedSuffix': '{label} Uploaded',

  // ── Country / phone picker ────────────────────────────────────────────────
  'country.noneFound': 'No country found',
  'country.searchPlaceholder': 'Search country or code…',

  // ── Shared / generic ──────────────────────────────────────────────────────
  /*
   * Written for a CLIENT, not for the API owner.
   *
   * It used to end "...once these endpoints exist:" and was followed by a row of
   * `GET /platforms`-style chips. Both are gone: the person reading this is
   * waiting to trade, not to deploy, and route names told them nothing while
   * telling everyone the shape of the API.
   */
  'backendPending.title': 'Not available yet',
  'backendPending.body':
    'This part of the portal is still being built. It will appear here automatically as soon as it is ready.',

  'common.retry': 'Try again',
  /*
   * Two labels for one action, preserved rather than unified.
   *
   * AsyncBoundary's button says "Retry"; the KYC step page says "Try again".
   * Making them one string is a product decision and a visible change, and an
   * extraction pass is the wrong commit to smuggle it into — a test caught this
   * the moment the two were collapsed. Recorded here so the inconsistency is
   * visible and resolvable on purpose.
   */
  'common.retryShort': 'Retry',
  'common.loading': 'Loading',
  'kyc.selfiePreviewAlt': 'Selfie preview',
  // `nav.searchPlaceholder` was removed with the header search box it belonged
  // to: an input with no handler, no results surface and no endpoint, offering
  // a ⌘K shortcut that was never bound. Notification copy now lives under
  // `notifications.*` at the foot of this file.
  'common.cancel': 'Cancel',
  'common.continue': 'Continue',
  'common.back': 'Back',
  'common.next': 'Next',
  'common.submit': 'Submit',
  /*
   * Shown under a failed request, alongside the message.
   *
   * The API generates a request id, sends it in the error body and logs it with
   * the failure — and until now no screen displayed it. A user reporting "it
   * failed" gave us nothing that finds their failure in the log, so the id
   * existed for a correlation nobody could actually make.
   */
  'common.errorReference': 'Reference: {id}',
  'common.genericError': 'Something went wrong. Please try again.',
  'common.requestId': 'Reference: {id}',
  'common.close': 'Close',

  // ── The verification gate in front of the money actions ───────────────────
  //
  // One dialog, three entry points (deposit, withdraw, transfer), and it says
  // something different depending on whether the client has work to do or is
  // waiting on us. "Under review" is not a call to action, so it does not get
  // the same button — sending someone back into a wizard they have already
  // finished is how a product loses trust.
  'kycGate.title': 'Verify your identity first',
  'kycGate.body':
    'Deposits, withdrawals and transfers open once your identity check is approved. It takes a few minutes.',
  'kycGate.reviewTitle': 'Your verification is being reviewed',
  'kycGate.reviewBody':
    'We are checking the documents you sent. Deposits, withdrawals and transfers open as soon as that is approved.',
  'kycGate.rejectedTitle': 'Your verification needs attention',
  'kycGate.rejectedBody':
    'Something in your submission could not be accepted. Open verification to see what to correct.',
  'kycGate.verifyCta': 'Verify my account',
  'kycGate.statusCta': 'View verification',
  'kycGate.dismiss': 'Not now',
  // The step BEFORE identity, and the only one whose fix is not at /kyc.
  'kycGate.emailTitle': 'Confirm your email address first',
  'kycGate.emailBody':
    'We sent a link to your inbox. Confirm your address to unlock identity verification and the partner programme.',
  'kycGate.emailCta': 'Resend the link',

  // ── Notifications ─────────────────────────────────────────────────────────
  //
  // The LIVE bell — `GET /notifications` and its three siblings. The per-kind
  // pairs (`kind<PascalKind>Title/Body`) mirror the backend's event catalogue
  // via `components/layout/notification-kinds.ts`; an event this file has no
  // pair for renders as `fallbackTitle`, never a raw slug. Money placeholders
  // are filled by `formatMoney` — never by interpolating a raw amount.
  'notifications.title': 'Notifications',
  'notifications.open': 'Open notifications',
  'notifications.loading': 'Loading notifications',
  'notifications.loadFailed': 'Could not load your notifications.',
  'notifications.emptyTitle': 'Nothing yet',
  'notifications.emptyBody': 'Alerts about your account will appear here.',
  // The PANEL's description, read by a screen reader when it opens. Distinct
  // from emptyBody, which describes an empty list — announcing that to
  // somebody whose panel holds thirty rows is simply wrong.
  'notifications.panelDescription': 'Recent alerts about your account.',
  'notifications.unreadCountLabel': '{count} unread',
  'notifications.markAllRead': 'Mark all as read',
  'notifications.markAllReadFailed': 'Could not mark notifications as read.',
  'notifications.itemUnread': 'Unread',
  'notifications.recentNotice': 'Showing your {count} most recent notifications.',
  'notifications.fallbackTitle': 'Notification',
  'notifications.soundOn': 'Notification sound is on',
  'notifications.soundOff': 'Notification sound is off',
  'notifications.verifyEmailTitle': 'Verify your email first',
  'notifications.verifyEmailBody':
    'Account alerts appear here once your email address is confirmed.',
  'notifications.kindDepositSucceededTitle': 'Deposit credited',
  'notifications.kindDepositSucceededBody':
    'Your deposit of {amount} has been confirmed and credited to your wallet.',
  'notifications.kindDepositFailedTitle': 'Deposit failed',
  'notifications.kindDepositFailedBody':
    'Your deposit of {amount} could not be completed. You can try again.',
  'notifications.kindWalletCreditedTitle': 'Wallet credited',
  'notifications.kindWalletCreditedBody': '{amount} was added to your wallet: {reason}',
  'notifications.kindWithdrawalApprovedTitle': 'Withdrawal approved',
  'notifications.kindWithdrawalApprovedBody':
    'Your withdrawal of {amount} was approved and is being processed.',
  'notifications.kindWithdrawalRejectedTitle': 'Withdrawal declined',
  'notifications.kindWithdrawalRejectedBody':
    'Your withdrawal of {amount} was declined: {reason}. The funds are back in your balance.',
  'notifications.kindWithdrawalPaidTitle': 'Withdrawal sent',
  'notifications.kindWithdrawalPaidBody':
    'Your withdrawal of {amount} has been sent to your nominated destination.',
  'notifications.kindKycApprovedTitle': 'Identity verified',
  'notifications.kindKycApprovedBody':
    'Your verification was approved. Deposits and withdrawals are unlocked.',
  'notifications.kindKycRejectedTitle': 'Verification needs attention',
  'notifications.kindKycRejectedBody': 'Your verification was declined: {reason}. You can retry.',
  'notifications.kindCommissionConfirmedTitle': 'Commission credited',
  // The client's side of the same trade. "Rebate" rather than "commission",
  // because the money is theirs coming back rather than something they earned —
  // and the two arrive from the same event, so a shared word would make them
  // indistinguishable in the bell.
  'notifications.kindRebateCreditedTitle': 'Rebate credited',
  // ── ONE MESSAGE PER RUN, NOT PER TRADE ──────────────────────────────────
  // These were written per accrual, so a client closing a thousand positions
  // got a thousand bell rows. They summarise a payout run now, and `{count}`
  // is what makes that legible — "$148.08 across 188 trades" is a sentence
  // somebody can act on; the same total with no count reads as one payment.
  'notifications.kindRebateCreditedBody':
    '{amount} was added to your wallet from {count} trade(s).',
  'notifications.kindCommissionConfirmedBody':
    'Commission of {amount} was credited to your wallet from {count} trade(s).',
  'notifications.kindPartnerApprovedTitle': 'Partner application approved',
  'notifications.kindPartnerApprovedBody':
    'Welcome to the partner programme. Your referral link is ready.',
  'notifications.kindPartnerRejectedTitle': 'Partner application declined',
  'notifications.kindPartnerRejectedBody': 'Your partner application was declined: {reason}',
  'notifications.kindPartnerSuspendedTitle': 'Partner account suspended',
  'notifications.kindPartnerSuspendedBody':
    'Your partner account was suspended. Contact support for details.',
  'notifications.kindPartnerRestoredTitle': 'Partner account restored',
  'notifications.kindPartnerRestoredBody': 'Your partner account is active again.',
  'notifications.kindTradingAccountOpenedTitle': 'Trading account ready',
  // The login, because that is the number they will be asked for. The password
  // is not here and is not anywhere in this app — it was emailed, and the body
  // says so rather than leaving them looking for it on screen.
  'notifications.kindTradingAccountOpenedBody':
    'Your {environment} account {login} is open. The login details were emailed to you.',
  'notifications.kindTransferCompletedTitle': 'Transfer complete',
  'notifications.kindTransferCompletedBody': '{amount} was {direction}.',
  // The two halves of the sentence above. Phrased as completed actions so they
  // read correctly in it, and translated rather than interpolating the
  // backend's `wallet_to_account` enum.
  'notifications.transferToAccount': 'moved to your trading account',
  'notifications.transferToWallet': 'returned to your wallet',
  // The toast's action button. Short because it sits inside a toast, and a
  // verb because it does something rather than describing where it goes.
  'notifications.view': 'View',
  // ── Partner programme ─────────────────────────────────────────────────────

  // The pitch, shown only to somebody who is not yet a partner.
  'partner.pitchHeading': 'How the programme works',
  'partner.pitchOne': 'Share your referral link with people you introduce.',
  'partner.pitchTwo': 'Clients who register through your link are attributed to you permanently.',
  'partner.pitchThree': 'You earn from their trading activity, at the rate set for your level.',

  // Applying.
  'partner.applyHeading': 'Become a partner',
  'partner.applyIntro':
    'Earn from the clients you introduce to OxShare. Your account is already verified, so there is nothing to fill in — send the request and we will review it.',
  // ── The partner area's tabs ───────────────────────────────────────────────
  'partner.tabOverview': 'Overview',
  'partner.tabCommissions': 'Commission',
  'partner.tabPositions': 'Open positions',

  'partner.commissionsLoading': 'Loading your commission',
  'partner.commissionsFailed': 'Could not load your commission.',
  'partner.commissionsEmpty': 'No commission yet',
  // No longer promises "what the broker made on it": the base and rate columns
  // were removed from this table, and an empty state that describes columns the
  // table does not have is the first thing a partner reads and the last thing
  // anybody updates.
  'partner.commissionsEmptyBody':
    'You earn when a client you introduced closes a trade. Each entry shows your share and whether it has been released.',
  'partner.colDate': 'Date',
  'partner.colClient': 'Client',
  'partner.colSource': 'From',
  'partner.colAmount': 'Your share',
  /*
   * The WORKING behind the amount.
   *
   * `baseAmount` and `rateValue` ride on the same response and nothing
   * rendered them, so the party most likely to dispute a commission was shown
   * the least of it — while the admin console's own commissions screen argues
   * "a commission an operator cannot recompute from the row is one they cannot
   * defend when a partner disputes it". The partner deserves the same row.
   */
  'partner.colBase': 'Calculated on',
  'partner.colRate': 'Rate',
  'partner.colStatus': 'Status',
  'partner.sourceTrade': 'Closed trade',
  // Historical only — commission is no longer earned on deposits.
  'partner.sourceDeposit': 'Deposit',
  'partner.viaSubPartner': '(via sub-partner)',
  'partner.statusPaid': 'Paid',
  'partner.statusPending': 'Pending',
  'partner.statusReversed': 'Reversed',

  'partner.positionsLoading': 'Loading open positions',
  'partner.positionsFailed': 'Could not load the open positions.',
  'partner.positionsEmpty': 'Nothing open right now',
  'partner.positionsEmptyBody':
    'Trades your clients have open appear here while they run. Closed ones move to the Commission tab.',
  'partner.colSymbol': 'Symbol',
  'partner.colSide': 'Side',
  'partner.colVolume': 'Lots',
  'partner.colOpenPrice': 'Open price',
  'partner.colFloating': 'Floating',
  'partner.colOpened': 'Opened',
  'partner.sideBuy': 'Buy',
  'partner.sideSell': 'Sell',

  'partner.agencyLabel': 'Your agency',
  'partner.pendingSubmittedFor': 'Applied for {agency} on {date}',
  'partner.chooseAgency': 'Choose a programme',
  /*
   * Shown INSTEAD of the picker to an applicant introduced by an existing
   * partner. It states the programme rather than asking, and says why: a client
   * shown a fixed value with no explanation reads it as a control that is
   * broken, and one shown nothing at all cannot tell what they will be selling.
   */
  'partner.inheritedAgency': 'Your programme',
  'partner.inheritedAgencyHint':
    'Selected for you automatically: you were introduced by a partner, so you join their ' +
    'programme and sell the same products. Nothing to fill in here.',
  // Not a validation error: an operator has configured nothing to apply for,
  // and naming that is more useful than a message about an unshown field.
  'partner.noAgenciesOffered':
    'No partner programmes are open at the moment. Please check back, or contact support if you were invited to apply.',
  'partner.chooseAgencyHint':
    'Which programme you are appointed under decides the account types your clients can open. Pick the one you want to apply for — an administrator reviews it.',
  'partner.agencySells': 'Accounts: {products}',
  'partner.applyFootnote': 'We review every request and email you the decision.',
  'partner.submit': 'Request to become a partner',
  'partner.submitting': 'Submitting…',
  'partner.submitFailed': 'Your application could not be submitted. Please try again.',

  // Awaiting a decision.
  'partner.pendingHeading': 'Your application is under review',
  'partner.pendingBody':
    'We will email you as soon as a decision is made. There is nothing else to do for now.',
  'partner.pendingSubmitted': 'Submitted {date}',

  // Turned down.
  'partner.rejectedHeading': 'Your application was not approved',
  'partner.rejectedReasonLabel': 'Reason given',
  'partner.rejectedReapply':
    'You can apply again. If anything in the reason above has changed, say so in your new application.',
  'partner.reapply': 'Apply again',

  // Approved — the partner dashboard.
  'partner.approvedSince': 'Partner since {date}',
  // Replaced `partner.levelLabel` in 0102. The rung answered "where do you
  // stand"; REACH answers the question a partner actually has, which is how far
  // down their own network they are paid on.
  'partner.referralCodeLabel': 'Your referral code',
  'partner.referralLinkLabel': 'Your referral link',
  'partner.copy': 'Copy',
  'partner.copied': 'Copied',
  // ── Commission balances ───────────────────────────────────────────────────
  // A partner's earnings sit in their own wallet, PER CURRENCY, and reach the
  // spending wallet through one transfer each. The wording carries the same rule
  // the wallet screen does: no wallet is NOT a zero balance.
  'partner.balancesHeading': 'Commission balances',
  'partner.balanceAvailable': 'Available to move',
  'partner.balancesCount': '{count} currencies',
  'partner.balanceOpened': 'Opened {date}',
  // The "never credited" state — no wallet in ANY currency. Says what has not
  // happened and what will make it happen, never "$0.00", which would claim a
  // wallet that does not exist.
  'partner.commissionEmpty': 'No commission credited yet',
  'partner.commissionEmptyBody':
    'Your commission wallet opens the first time a commission is confirmed. Earnings are held ' +
    'here, separately from your deposits, until you move them across.',
  'partner.commissionNote':
    'Commission is held separately from your main balance so you can always tell what you have ' +
    'earned from what you have deposited. Move it to your main wallet to withdraw it or fund a ' +
    'trading account.',
  // The label on the CARD FACE, where an ordinary wallet card carries the
  // currency's name. The code is already printed beneath it in bold, so this
  // slot says the thing the card would otherwise leave unsaid.
  // Every button names the balance it moves, even when there is only one. The
  // cells are otherwise identical, and a money control that reads the same
  // beside two different balances is ambiguous about which one it acts on.
  'partner.commissionTransferNamed': 'Move {currency} to wallet',
  'partner.commissionTransferTitle': 'Move commission to your wallet',
  'partner.commissionTransferBody':
    'The amount moves to your main {currency} wallet immediately, where you can withdraw it or ' +
    'transfer it to a trading account. This does not change your lifetime earnings.',
  'partner.commissionAmountLabel': 'Amount ({currency})',
  'partner.commissionAvailable': '{amount} available',
  'partner.commissionTransferAll': 'Transfer all',
  'partner.commissionOverBalance': 'That is more than your commission balance.',
  'partner.commissionCancel': 'Cancel',
  'partner.commissionTransferConfirm': 'Transfer',
  'partner.commissionTransferring': 'Transferring…',
  'partner.commissionTransferFailed': 'Could not move your commission. Please try again.',
  'partner.copyFailed': 'Could not copy. Select the link and copy it manually.',
  'partner.suspendedNotice':
    'Your partner account is currently suspended. Your referral link still works, but you are not earning. Contact support for details.',

  // Not eligible yet.
  'partner.ineligibleHeading': 'Verify your identity first',
  'partner.verifyNow': 'Verify my identity',
  // The other ineligibility: the ladder has no rung left beneath the partner who
  // introduced them. A heading only — the sentence under it is the API's, so
  // there is no second copy of the explanation here to drift from it.
  'partner.ineligibleChainFullHeading': 'The programme is full beneath your introducer',

  'partner.loadFailed': 'Could not load your partner status.',
  'partner.loading': 'Loading your partner status…',

  // ── Partner dashboard (GET /ib/overview) ──────────────────────────────────
  // The approved partner's working screen: what they earn, who they introduced
  // and who sits beneath them.
  'partner.overviewLoading': 'Loading your partner dashboard…',
  'partner.overviewLoadFailed': 'Could not load your partner dashboard.',

  'partner.earningsLifetime': 'Lifetime earnings',
  'partner.earningsRecent': 'Last 30 days',
  'partner.earningsLiveNote': 'Credited to your wallet as it is earned.',
  /*
   * THE MULTI-CURRENCY LINE.
   *
   * `IbOverviewService` sums earnings in ONE currency, because there is no FX
   * source in this system — so a partner whose clients trade in a second
   * currency accrues real commission that these totals do not cover. It sits in
   * its own commission wallet and is shown in full below.
   *
   * Without this line the screen puts a zero lifetime total directly above a
   * funded balance and explains neither.
   */
  'partner.earningsCurrencyScope':
    'These totals cover {currency} only — there is no exchange rate in this system to combine ' +
    'currencies with. You also hold commission in {others}; see the balances below.',

  'partner.clientsHeading': 'Clients you introduced',
  'partner.clientsCount': '{count} total · {verified} verified',
  /*
   * Shown only when the roster is larger than what one dashboard response
   * carries. The count beside the filter is the TRUE total, counted server-side,
   * so without this line the two figures disagree on screen and the reader is
   * left to work out which one is lying.
   *
   * It names what the search covers rather than apologising for the cap: a
   * partner filtering this table needs to know they are filtering the most
   * recent rows, which is the same rule /transactions follows.
   */
  'partner.clientsCapped':
    'Showing your {shown} most recent clients. Search and filters cover these rows.',
  'partner.clientsEmpty': 'No clients yet',
  'partner.clientsEmptyBody':
    'Share your referral link — clients who sign up through it appear here.',
  'partner.clientsColName': 'Client',
  'partner.clientsColStatus': 'Identity',
  'partner.clientsColSince': 'Joined',
  'partner.clientVerified': 'Verified',
  'partner.clientUnverified': 'Not verified',

  'partner.subPartnersHeading': 'Partners beneath you',
  'partner.subPartnersEmpty': 'No sub-partners yet',
  'partner.subPartnersEmptyBody':
    'Partners placed under you appear here, with the level they were assigned.',
  'partner.subPartnerSuspended': 'Suspended',
  'partner.subPartnerActive': 'Active',

  // ── The partner area, continued ───────────────────────────────────────────
  // The referral toolkit sits in the header band, above everything else on the
  // screen: it is what a returning partner comes back to copy.
  'partner.referralHint':
    'Anyone who registers through this link is attributed to you permanently.',

  // Two more tabs. The client list and the sub-partner tree used to be capped,
  // scrollable boxes inside the overview; both are unbounded lists and now have
  // a tab each, where they can be sorted, filtered and paged.
  'partner.tabClients': 'Clients',
  'partner.tabNetwork': 'Network',

  'partner.networkActive': '{count} active',
  'partner.viewAll': 'View all',
  'partner.noMatches': 'Nothing matches your filters',
  'partner.searchClients': 'Search by name',
  'partner.filterAll': 'All',
  'partner.colPartner': 'Partner',
  'partner.colSince': 'Since',

  'partner.termsHeading': 'Your terms',
  // The one thing about a partner's arrangement this screen still states — and
  // it is not a rate. The rate card went in 0112: the broker publishes it, and
  // a portal copy goes stale the day the desk renegotiates.
  'partner.programmeProductsLabel': 'Account types your clients can open',
  // An EMPTY product list means unrestricted (see `IbAccountDto`), which is a
  // different fact from being on no agency — so it gets its own sentence
  // rather than an empty list rendered as nothing.
  'partner.programmeUnrestricted': 'Your clients can open any account type the broker offers.',
  'partner.programmeNone': 'No agency',
  'partner.programmeNoneBody':
    'You are not appointed under an agency, so your clients can open any account type the ' +
    'broker offers.',

  'partner.subPartnersNote':
    'You earn on their clients too, at the difference between your rate and theirs. Only the ' +
    'partners directly beneath you are listed — that is as far as a payout resolves.',
  'partner.clientsVerifiedNote':
    'Only a verified client can fund an account, so only a verified client can earn you commission.',

  // ── How the money actually reaches the partner ────────────────────────────
  // Four steps, because the gap between "earned" and "spendable" is what most
  // partner support messages are about: an accrual is pending until the confirm
  // job credits it, and it sits in the commission wallet until they move it.
  'partner.howHeading': 'How you are paid',
  'partner.howStepOne': 'Share your link',
  'partner.howStepOneBody':
    'Clients who register through your referral link are attributed to you permanently.',
  'partner.howStepTwo': 'They close a trade',
  'partner.howStepTwoBody':
    'Commission is worked out when a position CLOSES — never while it is open, and never on a ' +
    'deposit or a transfer. It appears in your commission list as pending.',
  'partner.howStepThree': 'It is released',
  'partner.howStepThreeBody':
    'Shortly afterwards it is credited to your commission wallet, held separately from your deposits.',
  'partner.howStepFour': 'You move it across',
  'partner.howStepFourBody':
    'Transfer it to your main wallet to withdraw it or fund a trading account.',

  // ── The commission summary ────────────────────────────────────────────────
  /*
   * These totals are summed IN THE BROWSER from the entries in the list, and
   * `GET /ib/commissions` returns the most recent entries rather than all of
   * them. So the scope line is not decoration: it is the difference between a
   * true statement and a lifetime total that quietly under-reports.
   *
   * The lifetime figure above is the server's own sum over the whole ledger.
   * Both are labelled, for the reason the account screen labels its two
   * balances — two money figures that differ and neither says which is which is
   * worse than showing one.
   */
  'partner.summaryHeading': 'Commission summary',
  'partner.summaryScope': 'Totals cover the {count} entries listed below, newest first.',
  'partner.summaryCurrency': 'In {currency}',
  'partner.totalReleased': 'Released',
  'partner.totalReleasedHint': 'Credited to your commission wallet',
  'partner.totalAwaiting': 'Awaiting release',
  'partner.totalAwaitingHint': 'Earned, not credited yet',
  'partner.totalReversed': 'Reversed',
  'partner.totalReversedHint': 'Withdrawn before it was released',
  'partner.sourceDirect': 'Your own clients',
  'partner.sourceNetwork': 'Your partners’ clients',
  'partner.colReleasedAt': 'Released',

  // ── Commission transfers (GET /ib/wallet/transfers) ───────────────────────
  // The short list that explains the balance beside it. The FULL history is
  // /transactions, which carries these rows alongside every other movement.
  'partner.transfersHeading': 'Moved to your wallet',
  /*
   * The TAB label — "Withdrawals" would be wrong and "Moved to your wallet" was
   * vague.
   *
   * Nothing leaves the platform here: this is commission moving from the
   * COMMISSION wallet to the MAIN one, which is the step before a withdrawal
   * rather than the withdrawal itself. Calling it a withdrawal would have a
   * partner looking for money that is still on the platform.
   *
   * "Payouts" and "Commission withdrawn" were both rejected for the same
   * reason: a payout is what the broker pays out, and a withdrawal takes money
   * off the platform. This is the partner moving their own already-earned money
   * between their own two wallets, and the label says exactly that.
   */
  'partner.tabTransfers': 'Commission transfers',
  'partner.colFromWallet': 'From wallet',
  'partner.colToWallet': 'To wallet',
  'partner.colCurrency': 'Currency',
  'partner.transfersLoading': 'Loading your commission transfers…',
  'partner.transfersFailed': 'Could not load your commission transfers.',
  'partner.transfersEmpty': 'You have not moved any commission yet',
  'partner.transfersEmptyBody':
    'When you move commission into your main wallet, the most recent moves are listed here.',
  'partner.transfersAll': 'All transactions',
  'partner.transfersNote':
    'The full record is on your transactions page, alongside every other movement.',

  // ── Wallet cards ──────────────────────────────────────────────────────────
  // The credit-card presentation. `walletIdLabel` is shown with a truncated id
  // — see the card component for why the whole uuid is not rendered.
  'wallet.cardIdLabel': 'Wallet no.',
  'wallet.cardHolder': 'Account holder',
  'wallet.cardOpened': 'Opened',
  'wallet.cardNotOpenedTitle': 'Not opened',
  // Names the GROUP for assistive tech: "Your wallets, carousel".
  'wallet.carouselLabel': 'Your wallets',
  'wallet.previousCard': 'Previous wallet',
  'wallet.nextCard': 'Next wallet',
  'wallet.goToCard': 'Show {currency} wallet',
  'wallet.recentHeading': 'Recent activity',
  'wallet.recentEmpty': 'No transactions yet',
  'wallet.recentEmptyBody': 'Deposits, withdrawals and transfers appear here as they happen.',
  'wallet.copyId': 'Copy wallet number',
  'wallet.copiedId': 'Wallet number copied',
  'wallet.totalHeading': 'Total balance',
  'wallet.totalNote': 'Across your opened wallets, per currency.',
  // The ACTION, not the state. "Balance hidden" as a button name leaves a
  // screen-reader user unable to tell what pressing it would do.
  'wallet.hideAmount': 'Hide balance',
  'wallet.showAmount': 'Show balance',

  // ── Transactions filtering ────────────────────────────────────────────────
  'transactions.filters': 'Filters',
  'transactions.filterType': 'Type',
  'transactions.filterStatus': 'Status',
  'transactions.filterCurrency': 'Currency',
  'transactions.filterAll': 'All',
  /*
   * `filterSearch` and `filterSearchPlaceholder` are GONE with the search box.
   * It matched provider references and raw amount strings — useful only to
   * somebody who had already copied one of those from elsewhere — while
   * occupying a permanent slot above a table that can now be ordered and paged.
   */
  'transactions.filterDateRange': 'Date range',
  // Named for the calendar rather than reusing `common.next`: "Next" alone on
  // an icon-only control tells a screen-reader user nothing about what advances.
  'transactions.calendarPrevMonth': 'Previous month',
  'transactions.calendarNextMonth': 'Next month',
  'transactions.filterFrom': 'From',
  'transactions.filterTo': 'To',
  'transactions.filterApply': 'Apply',
  'transactions.filterClear': 'Clear filters',
  'transactions.filterClearDates': 'Clear dates',
  'transactions.dateAnyTime': 'Any time',
  'transactions.dateFromOnly': 'From {from}',
  'transactions.dateToOnly': 'Until {to}',
  'transactions.dateBoth': '{from} — {to}',
  'transactions.rangeInvalid': 'The start date is after the end date.',
  'transactions.noMatches': 'No transactions match these filters',
  'transactions.noMatchesBody': 'Try widening the date range or clearing a filter.',
  'transactions.showingCount': 'Showing {shown} of {total}',
  // Appended after `showingCount` only when a filter is hiding rows, so the
  // footer can say "showing 10 of 24 · 37 in total" without repeating itself
  // when nothing is filtered.
  'transactions.ofTotal': '{total} in total',
  'transactions.colCurrency': 'Currency',
  'transactions.colMethod': 'Method',
  // Money the team placed by hand. The client's own words for it, never the
  // raw `manual_admin` provider string — that is an internal identifier and has
  // no business on somebody's statement.
  'transactions.manualCredit': 'Added by our team',

  // The sort SELECT is gone (`sortNewest`, `sortOldest`, `sortAmountDesc`,
  // `sortAmountAsc`, `sortLabel`). Ordering is a table-header click now, so the
  // control is the column itself and needs no separate label — the four fixed
  // pairings it offered were a menu of the combinations somebody enumerated.
  //
  // The paging strings are NOT here either: `DataTable` and `Pagination` are
  // twins with admin and carry admin's own `pagination.*` and `table.*` keys,
  // which are added below rather than duplicated under a `transactions.` prefix.
  'transactions.transfer': 'Transfer',

  // ── Table and pagination ──────────────────────────────────────────────────
  //
  // TWINNED WITH ADMIN, key for key. `components/{data-table,pagination,
  // cursor-pagination}.tsx` and `lib/table-sort.ts` are twin files, so their
  // strings have to exist here under the same names — a twin that reads a key
  // this app spells differently is a twin that renders blank in one of the two.
  'pagination.summary': 'Showing {showing} {noun}',
  'pagination.range': 'Showing {start} to {end} of {total} {noun}',
  'pagination.summaryOfTotal': 'Showing {showing} {noun} of {total}',
  'pagination.page': 'Page {number}',
  'pagination.previous': 'Previous',
  'pagination.next': 'Next',
  'pagination.rowsPerPage': 'Rows per page:',
  'pagination.ellipsis': '…',
  'pagination.showingAll': 'Showing all {count}',
  'pagination.firstTitle': 'First Page',
  'pagination.firstAria': 'Go to First Page',
  'pagination.previousTitle': 'Previous Page',
  'pagination.nextTitle': 'Next Page',
  'pagination.lastTitle': 'Last Page',
  'pagination.lastAria': 'Go to Last Page',
  'table.sortScopeNote': 'Sorted within this page only — other pages are not included.',
  'table.selectedCount': '{count} {noun} selected',
  'table.row': 'row',
  'table.rows': 'rows',
  'table.clearSelection': 'Clear selection',

  // ── Trading accounts ──────────────────────────────────────────────────────
  'accounts.balanceLabel': 'Balance',
  'accounts.statusLabel': 'Status',
  'accounts.currencyLabel': 'Currency',
  'accounts.statusActive': 'Active',
  'accounts.statusSuspended': 'Suspended',
  'accounts.statusClosed': 'Closed',
  'accounts.loginPending': 'Being issued',
  'accounts.copyLogin': 'Copy login',
  'accounts.copiedLogin': 'Login copied',
  'accounts.liveCount': '{count} live',
  'accounts.demoCount': '{count} demo',
  /*
   * Stated on the screen, not just in a code comment.
   *
   * The CRM holds `balance` because there is no MT5 bridge; equity, margin and
   * open positions genuinely do not exist anywhere in this system. A trading
   * screen that showed a balance without saying what it is NOT invites a client
   * to read it as equity, and those differ by every open position.
   */
  'accounts.fundAccount': 'Transfer funds',

  /*
   * ── Account settings: the name, and the two passwords ────────────────────
   *
   * The reset copy carries three facts a client cannot recover on their own, so
   * none of them is optional: BOTH passwords change (an investor password
   * already shared with an analyst stops working), the new pair arrives by
   * EMAIL and nowhere else, and open positions are untouched. A confirmation
   * that said only "are you sure?" would leave every one of those to be found
   * out afterwards.
   */
  'accounts.actionsLabel': 'Actions',
  'accounts.renameAction': 'Change name',
  /*
   * Topping a DEMO account back up.
   *
   * The copy never uses "deposit" or "funds" — both mean real money everywhere
   * else in this portal, and a client who reads either on a practice account is
   * owed no ambiguity about which kind of money just moved.
   */
  'accounts.topUpAction': 'Add practice money',
  'accounts.topUpTitle': 'Add practice money',
  'accounts.topUpBody':
    'This tops up your demo balance so you can keep practising. It is not real money and cannot ' +
    'be withdrawn.',
  'accounts.topUpAmountLabel': 'Amount',
  'accounts.topUpCeilingHint': 'Up to {max} {currency} at a time.',
  'accounts.topUpSubmit': 'Add to balance',
  'accounts.topUpSubmitting': 'Adding…',
  'accounts.topUpDoneTitle': 'Practice money added',
  // The CREDITED figure. The API caps an over-large request rather than
  // refusing it, so this may be less than what was typed — which is exactly
  // why the message states an amount instead of just saying "done".
  'accounts.topUpDone': '{amount} {currency} has been added to your demo balance.',
  'accounts.topUpFailed': 'Could not add practice money to this account.',

  'accounts.renameTitle': 'Change account name',
  'accounts.nameLabel': 'Account name',
  /*
   * Its own key, and it has outlived the one it was distinguished from.
   *
   * It used to be contrasted with `accounts.nameHint` on the open-account form,
   * which said the name was optional and cosmetic. That string is gone — the
   * name is required there now — but the reason for a separate key here is
   * unchanged and is the stronger half: this control writes to MT5, so what it
   * says has to be about the broker's own record rather than about telling your
   * accounts apart. `accounts.namePlaceholder` IS shared: the example is as good
   * in both places.
   */
  'accounts.nameMt5Hint': 'This is the name MetaTrader shows for this account.',
  'accounts.nameSave': 'Save name',
  'accounts.nameSaving': 'Saving…',
  'accounts.nameSaved': 'Name updated.',
  'accounts.nameFailed': 'Could not update the name.',
  'accounts.passwordTitle': 'Trading passwords',
  'accounts.passwordHint':
    'Lost your password? We will issue a new master and investor password and email them to you.',
  'accounts.passwordReset': 'Reset passwords',
  'accounts.passwordResetting': 'Resetting…',
  'accounts.passwordConfirmTitle': 'Reset both trading passwords?',
  'accounts.passwordConfirmBody':
    'Your master AND investor passwords will both be replaced. Anyone using your investor ' +
    'password to watch this account will need the new one. Open positions and your balance ' +
    'are not affected.',
  'accounts.passwordConfirmCta': 'Yes, reset them',
  'accounts.passwordCancel': 'Cancel',
  'accounts.passwordSentTitle': 'New passwords sent',
  'accounts.passwordSent': 'New passwords sent to {email}. They are not shown here.',
  'accounts.passwordFailed': 'Could not reset the passwords.',

  // ── The money flows: shared steps and gateway payments ────────────────────
  'money.stepMethod': 'Method',
  'money.stepAmount': 'Amount',
  'money.stepConfirm': 'Confirm',
  'money.stepDone': 'Done',
  'money.useMax': 'Use max',
  'money.back': 'Back',
  'money.continue': 'Continue',
  'money.availableBalance': 'Available: {amount}',

  /*
   * Gateway copy — everything below is shown AFTER the deposit is filed, when
   * the server's answer has said which flow this is.
   *
   * `gatewayBadge` ("Instant"), `manualBadge` ("Manual") and `redirecting`
   * ("Opening the payment page…") are GONE. All three appeared BEFORE the answer
   * arrived, predicted from a `kind` field on the method that migration 0043
   * dropped — and the prediction was wrong for a whole release, labelling the
   * live Whish gateway "Manual". Copy that promises a payment page for a deposit
   * that will not open one is the failure mode, so the promise now waits for the
   * fact. `gatewayNote` goes with them: it was already unused.
   */
  'deposit.payNow': 'Continue to payment',
  'deposit.gatewayReturnNote':
    'Once you have paid, you will be returned here and your balance updates automatically.',
  'deposit.openPaymentPage': 'Open the payment page',
  'deposit.paymentLinkReady': 'Your payment link is ready',
  'deposit.paymentLinkBody':
    'If the payment page did not open, use the button below. The link stays valid until you pay ' +
    'it or it expires.',

  // The return screens, after the provider sends the client back.
  'deposit.checking': 'Confirming your payment…',
  'deposit.checkingBody': 'We are checking with the payment provider. This usually takes a moment.',
  'deposit.successTitle': 'Payment received',
  /*
   * No `{amount}` placeholder, deliberately. The return screen settles the
   * deposit but does not fetch its details, so an amount here would either be
   * read from the URL — a value the client can edit — or left blank. Naming the
   * wallet instead is true without either.
   */
  'deposit.successBody': 'Your deposit has been credited to your wallet.',
  'deposit.pendingStillTitle': 'Payment not confirmed yet',
  /*
   * The careful one. At Whish, `pending` INCLUDES "the client tried and failed"
   * — the link stays payable until it is paid or expires. So this must not say
   * the payment failed, and must not say it succeeded.
   */
  'deposit.pendingStillBody':
    'The provider has not confirmed this payment yet. If you completed it, it will appear in your ' +
    'transactions shortly — there is no need to pay again.',
  'deposit.failureTitle': 'Payment not completed',
  'deposit.failureBody':
    'This payment was not completed and nothing has been charged. You can start a new deposit ' +
    'whenever you are ready.',
  'deposit.backToWallet': 'Back to my wallet',
  'deposit.tryAgain': 'Start a new deposit',
  'deposit.missingReference': 'This link is missing its payment reference.',

  // ── Destination: where the money lands ────────────────────────────────────
  'deposit.destinationTitle': 'Where should it go?',
  'deposit.destinationLabel': 'Destination',
  'deposit.groupWallet': 'My wallets',
  'deposit.groupAccounts': 'Trading accounts',
  'deposit.toWallet': '{currency} wallet',
  'deposit.toWalletHint': 'Keep it in your wallet to withdraw or transfer later.',
  'deposit.toAccount': 'Account {login}',
  'deposit.toAccountHint': 'Funded automatically once the payment clears.',
  'deposit.amountRange': 'Between {min} and {max}',
  'deposit.amountBelowMin': 'The minimum deposit is {min}.',
  // Names the rail rather than the currency: "USD takes 2 decimal places" reads
  // as a fact about money, which invites arguing with it. "Whish Money takes
  // USD to 2 decimal places" is a fact about the rail the client just chose.
  'deposit.amountTooPrecise':
    '{method} takes {currency} to {places} decimal places. Use {suggestion} instead.',
  'deposit.amountAboveMax': 'The maximum deposit is {max}.',
  'deposit.pay': 'Pay {amount}',

  // ── Dashboard (GET /dashboard) ────────────────────────────────────────────
  'dashboard.greeting': 'Welcome back, {name}',
  'dashboard.loading': 'Loading your dashboard…',
  'dashboard.loadFailed': 'Could not load your dashboard.',
  /*
   * "Largest", not "Total", and the distinction is the whole reason the figure
   * is computed the way it is.
   *
   * Balances cannot be added across currencies without an exchange rate, and
   * this platform holds none — so `largestBalance` reports the biggest SINGLE
   * holding, labelled with its own currency. The old copy said "Total balance /
   * Across your opened wallets" over exactly that number, which is a sentence
   * claiming a sum nobody computed. A client holding $700 and €500 read "$700"
   * under the word "total".
   */
  'dashboard.largestBalance': 'Largest balance',
  'dashboard.largestBalanceNote': 'Your biggest single wallet',
  'dashboard.statWallets': 'Wallets',
  'dashboard.statWalletsNote': 'Currencies you hold',
  'dashboard.statPendingTxNote': 'Waiting on our review',
  'dashboard.statReferred': 'Clients introduced',
  'dashboard.statReferredNote': 'Through your referral code',
  'dashboard.statReferredClients': 'Clients referred',
  'dashboard.accountsHeading': 'Trading accounts',
  'dashboard.accountsEmpty': 'No trading accounts yet',
  'dashboard.accountsEmptyBody': 'Your MT5 accounts appear here once they are opened.',
  'dashboard.transactionsEmpty': 'No transactions yet',
  'dashboard.transactionsEmptyBody': 'Deposits and withdrawals appear here as they happen.',
  'dashboard.quickActions': 'Quick actions',
  'dashboard.viewAllAccounts': 'All accounts',
  'dashboard.viewAllTransactions': 'All transactions',
} as const;

/** Every valid key. A typo is a compile error, never a string rendered as itself. */
export type MessageKey = keyof typeof messages;
