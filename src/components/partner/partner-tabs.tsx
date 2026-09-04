'use client';

import * as React from 'react';
import { ArrowLeftRight, Coins, LayoutGrid, Network, Users } from 'lucide-react';
import { Tabs, TabPanel, type TabDefinition } from '@/components/ui/tabs';
import { PartnerOverview } from '@/components/partner/partner-overview';
import { PartnerClients } from '@/components/partner/partner-clients';
import { PartnerNetwork } from '@/components/partner/partner-network';
import { PartnerCommissions } from '@/components/partner/partner-commissions';
import { PartnerTransfers } from '@/components/partner/partner-transfers';
import type { IbOverview, IbStatus } from '@/lib/api/partner';
import { t } from '@/lib/i18n';

/**
 * The detail, in five tabs.
 *
 * ## Why five rather than the three this replaced
 *
 * The client list and the sub-partner tree were capped scroll boxes inside the
 * overview — `max-h-[22rem]`, no sort, no search, no indication of how much sat
 * below the fold. Both lists are unbounded, so that treatment got worse exactly
 * as a partner succeeded: the one with two hundred clients had the least usable
 * view of them.
 *
 * As tabs they are `DataTable`s — sorted, filtered, paged, and identical in
 * behaviour to /transactions. A partner should not have to learn a second table
 * in the same app.
 *
 * ## Where each tab gets its data
 *
 * Overview, Clients and Network render from the ONE `GET /ib/overview` response
 * the page already holds, passed as props — so moving between them is instant
 * and no two panels can show figures from two different instants.
 *
 * Commission owns its read, and `TabPanel` renders nothing while inactive, so
 * it does not fire on a visit that only wanted the headline.
 *
 * ## THE OPEN POSITIONS TAB IS GONE, and it could not have been fixed in place
 *
 * It read `GET /ib/positions`, which queries the `positions` TABLE — created
 * empty on purpose and written by nothing, because a stored profit is stale the
 * moment it is saved. So the tab was permanently blank on a platform with live
 * trades, which reads as "your clients are not trading".
 *
 * The obvious repair is what the account screen does: read live from MT5. That
 * is one bridge call per client ACCOUNT, serialised behind the single session
 * lock — a partner with fifty clients holding two accounts each is a hundred
 * round trips on every page load, blocking every other client on the platform
 * meanwhile.
 *
 * It was removed instead. FR-IB-17 owes a partner visibility of their sub-tree
 * EARNINGS, and the commission tab carries every closed trade that paid them —
 * which is what they are actually owed, and what only this system knows.
 *
 * ## Local state, not the URL
 *
 * A partner does not send anybody a link to their own commission tab, and a
 * history entry per tab press would bury the page they arrived from. The admin
 * console puts its tab in the query string for the opposite reason — operators
 * do send each other links.
 */
const ICON = 'h-4 w-4';

const TABS: TabDefinition[] = [
  { value: 'overview', label: t('partner.tabOverview'), icon: <LayoutGrid className={ICON} /> },
  { value: 'clients', label: t('partner.tabClients'), icon: <Users className={ICON} /> },
  { value: 'network', label: t('partner.tabNetwork'), icon: <Network className={ICON} /> },
  { value: 'commissions', label: t('partner.tabCommissions'), icon: <Coins className={ICON} /> },
  /*
   * MOVED OUT of the Commission tab, where it was a short unpaged panel.
   *
   * It answers a different question — Commission is "what have I earned", this
   * is "what have I taken out" — and sharing a tab made the second read as a
   * footnote to the first. It was also capped at whatever the endpoint returned,
   * with no pager and no count, so it got less useful with every transfer.
   */
  {
    value: 'transfers',
    label: t('partner.tabTransfers'),
    icon: <ArrowLeftRight className={ICON} />,
  },
];

/* Document flow, like the rest of this screen — the table's own floor is
   what gives a short list its height, not a share of the viewport. */
const PANEL = 'flex flex-col';

export function PartnerTabs({
  data,
  account,
}: {
  data: IbOverview;
  /** The overview response carries no agency; the status response does. */
  account: NonNullable<IbStatus['account']>;
}) {
  const [tab, setTab] = React.useState('overview');

  return (
    <div className="flex flex-col">
      <Tabs tabs={TABS} value={tab} onValueChange={setTab} idPrefix="partner" />

      <TabPanel value="overview" activeValue={tab} idPrefix="partner" className={PANEL}>
        {/* The overview's list panels show the newest few and hand the reader on
            to the tab that holds all of them, rather than duplicating a table
            badly. Switching tab rather than linking, because there is no URL to
            link to — see the note above. */}
        <PartnerOverview data={data} account={account} onNavigate={setTab} />
      </TabPanel>

      <TabPanel value="clients" activeValue={tab} idPrefix="partner" className={PANEL}>
        <PartnerClients data={data} />
      </TabPanel>

      <TabPanel value="network" activeValue={tab} idPrefix="partner" className={PANEL}>
        <PartnerNetwork subPartners={data.subPartners} />
      </TabPanel>

      <TabPanel value="commissions" activeValue={tab} idPrefix="partner" className={PANEL}>
        <PartnerCommissions />
      </TabPanel>

      <TabPanel value="transfers" activeValue={tab} idPrefix="partner" className={PANEL}>
        <PartnerTransfers />
      </TabPanel>
    </div>
  );
}
