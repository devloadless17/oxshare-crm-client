'use client';

import * as React from 'react';
import { Tabs, TabPanel, type TabDefinition } from '@/components/ui/tabs';
import { PartnerOverview } from '@/components/partner/partner-overview';
import { PartnerCommissions } from '@/components/partner/partner-commissions';
import { PartnerPositions } from '@/components/partner/partner-positions';
import { t } from '@/lib/i18n';

/**
 * An approved partner's own area, in three tabs.
 *
 * ## Why tabs rather than one long page
 *
 * The three answer different questions and are read at different moments:
 * "how am I doing" (overview), "what have I earned and is it paid" (commission),
 * "is my book actually trading" (positions). Stacked, the tables pushed the
 * headline figures off the screen for anyone with a real client list, and the
 * commission history — the thing a partner comes back for — sat below two
 * screens of summary.
 *
 * ## Each tab fetches ITS OWN data, and only when opened
 *
 * `TabPanel` renders nothing when inactive, so the commission and position
 * queries do not fire on a page load that only wanted the headline. That
 * matters more here than on the settings screen it was borrowed from: these
 * two are the expensive reads, and most visits are somebody checking a total.
 *
 * ## Local state, not the URL
 *
 * A partner does not send anybody a link to their own commission tab, and a
 * history entry per tab press would bury the page they arrived from. The admin
 * console puts its tab in the query string for the opposite reason — operators
 * do send each other links.
 */
const TABS: TabDefinition[] = [
  { value: 'overview', label: t('partner.tabOverview') },
  { value: 'commissions', label: t('partner.tabCommissions') },
  { value: 'positions', label: t('partner.tabPositions') },
];

export function PartnerDashboard() {
  const [tab, setTab] = React.useState('overview');

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Tabs tabs={TABS} value={tab} onValueChange={setTab} idPrefix="partner" />

      <TabPanel
        value="overview"
        activeValue={tab}
        idPrefix="partner"
        className="flex min-h-0 flex-1 flex-col"
      >
        <PartnerOverview />
      </TabPanel>

      <TabPanel
        value="commissions"
        activeValue={tab}
        idPrefix="partner"
        className="flex min-h-0 flex-1 flex-col"
      >
        <PartnerCommissions />
      </TabPanel>

      <TabPanel
        value="positions"
        activeValue={tab}
        idPrefix="partner"
        className="flex min-h-0 flex-1 flex-col"
      >
        <PartnerPositions />
      </TabPanel>
    </div>
  );
}
