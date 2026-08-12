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
  'nav.logout': 'Log out',
  'nav.accountMenu': 'Account menu',

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
  'profile.typeCorporate': 'Corporate',
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
  'auth.verify.backToSignIn': 'Back to Sign In',
  'auth.verify.missingToken': 'Verification token is missing in URL parameters.',
  'auth.verify.invalidToken': 'The verification link is invalid or has expired.',
  'auth.verify.resendCta': 'Resend Verification Email',

  // ── Withdrawal confirmation (FR-CORE-08 / FR-IND-05) ──────────────────────
  'withdraw.continue': 'Continue',
  'withdraw.sendingCode': 'Sending code…',
  'withdraw.otpLabel': 'Confirmation code',
  'withdraw.otpHint':
    'The code is tied to this exact amount and destination. Change either and you will need a new one.',
  'withdraw.needOtp': 'Enter the 6-digit code from your email.',
  // Shown when a refresh is resumed rather than restarted. Says the code still
  // works, because the previous behaviour taught clients the opposite: the form
  // reset, the emailed code stopped being accepted, and nothing connected the
  // two.
  'withdraw.restoredNotice':
    'We kept this withdrawal from before you reloaded, so the code already in your email still works.',
  'withdraw.otpSendFailed': 'Could not send the confirmation code. Please try again.',
  'withdraw.editDetails': 'Change amount or destination',
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
  // `colReference` is gone with its column: a 20-character opaque provider id
  // that a client has no use for in a list, taking the width that made every
  // other column readable. It is still on the deposit confirmation, which is
  // where somebody actually needs to quote it.
  'transactions.deposit': 'Deposit',
  'transactions.withdrawal': 'Withdrawal',
  'transactions.statePending': 'Pending review',
  'transactions.stateApproved': 'Approved',
  'transactions.stateSuccess': 'Completed',
  'transactions.stateRejected': 'Rejected',
  'transactions.stateFailure': 'Failed',

  // ── Withdraw (CORE-07 / CORE-08) ──────────────────────────────────────────
  'withdraw.title': 'Withdraw',
  'withdraw.subtitle': 'Request a withdrawal from your available balance',
  'withdraw.loading': 'Loading your balances',
  'withdraw.loadFailed': 'Could not load your balances.',
  'withdraw.currency': 'Currency',
  'withdraw.amount': 'Amount',
  'withdraw.amountPlaceholder': '0.00',
  'withdraw.available': 'Available: {amount}',
  'withdraw.destination': 'Destination',
  'withdraw.destinationPlaceholder': 'IBAN, or your USDT TRC20 address',
  'withdraw.destinationHint':
    'Double-check this. A withdrawal sent to the wrong destination cannot be recalled.',
  'withdraw.submit': 'Request withdrawal',
  'withdraw.submitting': 'Submitting…',
  'withdraw.needAmount': 'Enter an amount to withdraw.',
  'withdraw.needDestination': 'Enter where the funds should be sent.',
  'withdraw.failed': 'Could not submit your withdrawal request.',
  'withdraw.submittedTitle': 'Withdrawal requested',
  'withdraw.submittedBody':
    'Your request is with our team for review. The amount is held against your balance until it is approved or declined, and you will be emailed either way.',
  'withdraw.viewTransactions': 'View your transactions',
  'withdraw.noWallets': 'You have no funded wallet to withdraw from yet.',
  'withdraw.reviewNote':
    'Every withdrawal is reviewed by our team before any funds move. Nothing leaves your account automatically.',

  // ── Deposit (CORE-06) ─────────────────────────────────────────────────────
  'deposit.title': 'Deposit',
  'deposit.subtitle': 'Tell us what you are sending, then transfer it quoting the reference.',
  'deposit.methodTitle': 'How are you sending it?',
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
  // The screen behind these is a placeholder: `POST /payments/transfers` works,
  // but nothing lists the client's trading accounts, so there is no picker to
  // populate. See app/transfer/page.tsx.
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

  // "Account type" rather than "group": a group is MT5's word for the folder a
  // login sits in, and the client is choosing a product.
  'accounts.fieldType': 'Account type',
  'accounts.typeCurrencyHint': 'This account will be held in {currency}.',
  'accounts.fieldLeverage': 'Leverage',
  'accounts.leverageHint':
    'How far your margin stretches. Higher leverage magnifies losses as much as gains.',

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
  'accounts.namePlaceholder': 'Swing trading',
  'accounts.nameHint': 'Optional. Helps you tell your accounts apart if you have several.',
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
  'accounts.groupLabel': 'Group',
  'accounts.tierLabel': 'Type',
  'accounts.leverageLabel': 'Leverage',
  'accounts.openedLabel': 'Opened',
  'accounts.leverageValue': '1:{ratio}',
  // Shown where the CRM genuinely holds no value for a field. An em dash rather
  // than a zero or a guess — the same rule the wallet follows for a currency
  // that has not been opened.
  'accounts.unknownValue': '—',
  'accounts.noneOfKind': 'None yet.',

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
  'kyc.submittedTitle': 'Verification Submitted',
  'kyc.approvedTitle': 'KYC Approved!',
  'kyc.rejectedTitle': 'KYC Verification Rejected',
  'kyc.backToDashboard': 'Back to Dashboard',
  'kyc.loadFailedShort': 'Could not load your verification details',
  'kyc.loadFailed': 'Could not load your verification details.',
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
  'notifications.kindCommissionConfirmedBody':
    'A commission of {amount} was credited to your wallet.',
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
  'partner.commissionsEmptyBody':
    'You earn when a client you introduced closes a trade. Each entry shows what the broker made on it and your share.',
  'partner.colDate': 'Date',
  'partner.colClient': 'Client',
  'partner.colSource': 'From',
  'partner.colBase': 'Broker earned',
  'partner.colRate': 'Your rate',
  'partner.colAmount': 'Your share',
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

  'partner.agencyLabel': 'Your programme',
  'partner.agencyProducts': 'Your clients can open: {products}',
  'partner.pendingSubmittedFor': 'Applied for {agency} on {date}',
  'partner.chooseAgency': 'Choose a programme',
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
  'partner.approvedHeading': 'You are a partner',
  'partner.approvedSince': 'Partner since {date}',
  'partner.levelLabel': 'Your level',
  'partner.referralCodeLabel': 'Your referral code',
  'partner.referralLinkLabel': 'Your referral link',
  'partner.copy': 'Copy',
  'partner.copied': 'Copied',
  'partner.copyFailed': 'Could not copy. Select the link and copy it manually.',
  'partner.suspendedNotice':
    'Your partner account is currently suspended. Your referral link still works, but you are not earning. Contact support for details.',
  'partner.earningsPending':
    'Earnings reporting is not available yet. Your introductions are being recorded.',

  // Not eligible yet.
  'partner.ineligibleHeading': 'Verify your identity first',
  'partner.verifyNow': 'Verify my identity',

  'partner.loadFailed': 'Could not load your partner status.',
  'partner.loading': 'Loading your partner status…',

  // ── Partner dashboard (GET /ib/overview) ──────────────────────────────────
  // The approved partner's working screen: what they earn, who they introduced
  // and who sits beneath them.
  'partner.overviewLoading': 'Loading your partner dashboard…',
  'partner.overviewLoadFailed': 'Could not load your partner dashboard.',

  'partner.earningsHeading': 'Earnings',
  'partner.earningsLifetime': 'Lifetime earnings',
  'partner.earningsRecent': 'Last 30 days',
  /*
   * THE honesty line, and the reason `engineLive` crosses the wire at all.
   *
   * Shown beside a zero total whenever no commission engine has run. Without it
   * a structural zero is indistinguishable from "you earned nothing", which on a
   * screen about money somebody expects to be paid reads as a dispute rather
   * than as a feature that has not shipped.
   */
  /*
   * Shown only until the engine has confirmed its FIRST payout platform-wide.
   *
   * It no longer says "not live yet" — the engine exists and runs hourly. What
   * it says now is the narrower and still-true thing: nothing has been credited
   * so far, so a zero here is an empty history rather than an uncalculated one.
   */
  'partner.earningsNotLive':
    'No commission has been credited yet. Earnings are calculated when a client you introduced ' +
    'makes a deposit, and are paid into your wallet shortly afterwards.',
  'partner.earningsLiveNote': 'Credited to your wallet as it is earned.',
  'partner.earningsPendingLabel': 'Awaiting payout',

  'partner.levelHeading': 'Your level',
  'partner.levelRateRevenue': '{rate}% revenue share',
  'partner.levelRatePerLot': '{rate} per lot',
  'partner.levelDirectLimit': 'Up to {max} direct partners',
  'partner.levelDirectUnlimited': 'Unlimited direct partners',
  'partner.levelUnknown': 'Your level is being configured.',

  'partner.clientsHeading': 'Clients you introduced',
  'partner.clientsCount': '{count} total · {verified} verified',
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
  'partner.subPartnerLevel': 'Level {level}',
  'partner.subPartnerSuspended': 'Suspended',
  'partner.subPartnerActive': 'Active',

  // ── Wallet cards ──────────────────────────────────────────────────────────
  // The credit-card presentation. `walletIdLabel` is shown with a truncated id
  // — see the card component for why the whole uuid is not rendered.
  'wallet.cardIdLabel': 'Wallet ID',
  'wallet.cardHolder': 'Account holder',
  'wallet.cardOpened': 'Opened',
  'wallet.cardNotOpenedTitle': 'Not opened',
  'wallet.previousCard': 'Previous wallet',
  'wallet.nextCard': 'Next wallet',
  'wallet.goToCard': 'Show {currency} wallet',
  'wallet.recentHeading': 'Recent activity',
  'wallet.recentEmpty': 'No transactions yet',
  'wallet.recentEmptyBody': 'Deposits, withdrawals and transfers appear here as they happen.',
  'wallet.copyId': 'Copy wallet ID',
  'wallet.copiedId': 'Wallet ID copied',
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
  'deposit.amountAboveMax': 'The maximum deposit is {max}.',
  'deposit.pay': 'Pay {amount}',

  // ── Dashboard (GET /dashboard) ────────────────────────────────────────────
  'dashboard.greeting': 'Welcome back, {name}',
  'dashboard.loading': 'Loading your dashboard…',
  'dashboard.loadFailed': 'Could not load your dashboard.',
  'dashboard.totalBalance': 'Total balance',
  'dashboard.totalBalanceNote': 'Across your opened wallets',
  'dashboard.statOpenPositions': 'Open positions',
  'dashboard.statReferredClients': 'Clients referred',
  'dashboard.walletsHeading': 'Your wallets',
  'dashboard.walletsEmpty': 'No wallets opened yet',
  'dashboard.walletsEmptyBody': 'A wallet opens with your first deposit in that currency.',
  'dashboard.positionsHeading': 'Open positions',
  'dashboard.positionsEmpty': 'No open positions',
  /*
   * The honest sentence for an empty positions panel.
   *
   * It says trades are not SYNCED yet rather than "you have no trades", because
   * those are different claims and only the first is one this system can make:
   * nothing writes to `positions` until an MT5 bridge exists, so a client who
   * traded this morning would still see zero here. Same rule as the wallet's
   * missing-wallet-is-not-a-zero.
   */
  'dashboard.positionsEmptyBody':
    'Trades opened in MetaTrader 5 are not synced to the portal yet. Your terminal is the source ' +
    'of truth for live positions.',
  'dashboard.positionsColSymbol': 'Symbol',
  'dashboard.positionsColSide': 'Side',
  'dashboard.positionsColVolume': 'Volume',
  'dashboard.positionsColOpenPrice': 'Open price',
  'dashboard.positionsColAccount': 'Account',
  'dashboard.positionsColOpened': 'Opened',
  'dashboard.sideBuy': 'Buy',
  'dashboard.sideSell': 'Sell',
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
