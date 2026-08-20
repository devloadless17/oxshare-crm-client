'use client';

import * as React from 'react';
import { Coins, LayoutGrid, LineChart, Network, Users } from 'lucide-react';
import { Tabs, TabPanel, type TabDefinition } from '@/components/ui/tabs';
import { PartnerOverview } from '@/components/partner/partner-overview';
import { PartnerClients } from '@/components/partner/partner-clients';
import { PartnerNetwork } from '@/components/partner/partner-network';
import { PartnerCommissions } from '@/components/partner/partner-commissions';
import { PartnerPositions } from '@/components/partner/partner-positions';
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
 * Commission and Open positions own their reads, and `TabPanel` renders nothing
 * while inactive, so neither fires on a visit that only wanted the headline.
 * Those two are the expensive lists.
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
  { value: 'positions', label: t('partner.tabPositions'), icon: <LineChart className={ICON} /> },
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

      <TabPanel value="positions" activeValue={tab} idPrefix="partner" className={PANEL}>
        <PartnerPositions />
      </TabPanel>
    </div>
  );
}
