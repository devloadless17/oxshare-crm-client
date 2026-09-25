'use client';

import { KycStatusCard } from '@/components/dashboard/kyc-status-card';
import { DashboardBody } from '@/components/dashboard/dashboard-body';
import { WelcomeBanner } from '@/components/dashboard/welcome-banner';
import { useUser } from '@/context/UserContext';

/**
 * The client's landing page.
 *
 * ## What was here, and why the emptiness was correct at the time
 *
 * This screen was a heading, a KYC prompt and a download link. It had been
 * stripped to that deliberately: the version before it carried live balance
 * cards and two stat tiles reading "0 trading accounts" and "0 pending
 * transactions", and the comment above those tiles admitted no endpoint existed
 * for either. A client holding three accounts read "0", the same way a client
 * holding $700 once read "$0.00" on the wallet.
 *
 * Emptying it was right. An emptier dashboard that tells the truth beats a full
 * one that invents figures — and the note left behind said plainly that real
 * numbers would return with real endpoints behind them.
 *
 * ## They have
 *
 * `GET /dashboard` counts rows: wallets, transactions, trading accounts, open
 * positions and five totals, in one request so the panels cannot disagree about
 * which instant they describe. Nothing on this screen is derived or defaulted.
 *
 * The positions panel renders empty for everyone, because nothing writes to
 * `positions` until an MT5 bridge exists — but the query is REAL, so that
 * emptiness is a database answer rather than a hardcoded state. Its copy says
 * trades are not SYNCED rather than "you have no trades", because a client who
 * traded this morning would still see zero and the second sentence would be
 * false.
 *
 * ## KYC stays at the top
 *
 * It is the client's genuine next action while it is outstanding, and
 * `KycStatusCard` renders nothing once there is nothing to do — so a verified
 * client gets the data, not a permanent green tick.
 */
export default function DashboardPage() {
  const { user } = useUser();

  /*
   * The greeting uses the client's own name when there is one.
   *
   * `undefined` rather than a placeholder when the profile has no name: this app
   * once rendered the literal "Client User" for a null user on the
   * customer-facing portal, which is fabricated identity in the same family as a
   * fabricated balance. The generic welcome line is used instead.
   */
  const firstName = user?.firstName?.trim();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      {/* The banner carries the page's heading — the greeting that used to sit
          under it repeated the same "Welcome back" and was removed. */}
      <WelcomeBanner firstName={firstName} />

      {/* Renders nothing once verification is done — a badge is a call to
          action, and an approved client has no action. */}
      <KycStatusCard />

      <DashboardBody />
    </div>
  );
}
