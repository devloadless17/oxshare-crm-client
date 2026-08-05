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

  // ── Profile ───────────────────────────────────────────────────────────────
  'profile.title': 'Profile',
  'profile.subtitle': 'Your account details, security and active sessions.',
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
  'transactions.colReference': 'Reference',
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
  'deposit.subtitle': 'Add funds to your OXShare wallet',

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
  'dashboard.kycVerified': 'Level 1 Verified • Trading Enabled',
  'dashboard.openPositions': '{count} Open Positions',
  'dashboard.underReview': '{count} Under Review',
  'dashboard.noActivityBody':
    'Your recent deposits, withdrawals and transfers will appear here automatically.',
  'accounts.emptyBody': 'Create an MT5 live or demo account to start trading.',
  'dashboard.recentTransactions': 'Recent Transactions',

  'wallet.usdWallet': 'USD Wallet',
  'wallet.usdtWallet': 'USDT TRC20',

  'accounts.title': 'Trading Accounts',
  'accounts.subtitle': 'Manage your MetaTrader 5 trading accounts and leverage settings',
  'accounts.openNew': 'Open New Account',
  'accounts.empty': 'No Active Trading Accounts',

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
  'backendPending.body':
    "This page's UI is ready, but the API it needs is not implemented yet. It will light up automatically once these endpoints exist:",

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
  'nav.searchPlaceholder': 'Search accounts, deposits, trades... (⌘K)',
  'nav.notifications': 'Notifications',
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
} as const;

/** Every valid key. A typo is a compile error, never a string rendered as itself. */
export type MessageKey = keyof typeof messages;
