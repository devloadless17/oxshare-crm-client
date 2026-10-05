'use client';

import * as SelectPrimitive from '@radix-ui/react-select';
import { Check } from 'lucide-react';
import { Select, SelectContent, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Agency } from '@/lib/api/partner';
import { localized, t } from '@/lib/i18n';

/** "Accounts: Standard, Pro" in the reader's language, or '' when it sells none. */
export function agencyProducts(agency: Agency): string {
  if (agency.products.length === 0) return '';
  return t('partner.agencySells', {
    products: agency.products
      .map((product, i) => localized(product, agency.productsAr?.[i]))
      .join(t('common.listSeparator')),
  });
}

/**
 * The programme picker: one field that opens a SCROLLING list of every programme.
 *
 * No search, on purpose (the owner's call, 5 Oct 2026): a client choosing a
 * programme is browsing, not looking up a name they already know, so they are
 * shown them all and scroll. Each row carries the accounts that programme sells,
 * so the list itself is the comparison.
 *
 * ## The list FLOATS above the page
 *
 * The first version drew the list inside the apply panel, which scrolls on its
 * own and clips its overflow: the list was cut off at the panel's edge, and
 * scrolling it into view dragged the whole panel up under the reader's cursor
 * (reported, 5 Oct 2026). It is now the console's own Radix select — portalled,
 * positioned against the field, flipped above it when there is no room below,
 * capped to the space actually available — so opening it moves nothing.
 *
 * Rows are built here rather than with `ui/select`'s `SelectItem`, because that
 * wraps everything in `ItemText`, and `ItemText` is what the closed field
 * echoes: the accounts line would be repeated inside the field. Here only the
 * NAME is item text.
 */
export function AgencyPicker({
  agencies,
  value,
  onChange,
}: {
  agencies: Agency[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    // `value || undefined`: Radix shows the placeholder only for `undefined`.
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger
        aria-label={t('partner.chooseAgency')}
        className="h-11 data-[placeholder]:text-muted-foreground"
      >
        <SelectValue placeholder={t('partner.selectAgencyPlaceholder')} />
      </SelectTrigger>
      <SelectContent
        sideOffset={6}
        collisionPadding={16}
        className="max-h-[min(22rem,var(--radix-select-content-available-height))]"
      >
        {agencies.map((agency) => {
          const products = agencyProducts(agency);
          return (
            <SelectPrimitive.Item
              key={agency.id}
              value={agency.id}
              className="relative flex min-h-[3.25rem] w-full cursor-pointer select-none items-center gap-3 rounded-md py-2 ps-3 pe-9 outline-none transition-colors data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[state=checked]:font-semibold"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm">
                  <SelectPrimitive.ItemText>
                    {localized(agency.name, agency.nameAr)}
                  </SelectPrimitive.ItemText>
                </span>
                {products && (
                  <span className="block truncate text-[11px] font-normal text-muted-foreground">
                    {products}
                  </span>
                )}
              </span>
              <SelectPrimitive.ItemIndicator className="absolute end-3 flex items-center">
                <Check className="h-4 w-4 text-link" aria-hidden="true" />
              </SelectPrimitive.ItemIndicator>
            </SelectPrimitive.Item>
          );
        })}
      </SelectContent>
    </Select>
  );
}
