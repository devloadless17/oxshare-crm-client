'use client';

import * as React from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { normalizeRange, type DateRange } from '@/lib/date-range';
import { t } from '@/lib/i18n';

/**
 * The phone's version of a toolbar: one row of buttons, with the controls in a
 * sheet that rises from the bottom.
 *
 * ## Why a sheet and not the desktop toolbar, stacked
 *
 * Stacked, the four filter controls are ~300px of form above the first row of
 * data on a 700px screen — the client scrolls past their own filters on every
 * visit to reach what they came for. A single "Filters" button with a count
 * keeps the data on screen and says whether anything is narrowing it; the
 * sheet opens where a thumb already is, and closes on "Show results".
 *
 * `md:hidden` on the bar: from `md` up the full toolbar is on screen and this
 * does not render.
 */
export function MobileFilterSheet({
  activeCount,
  onClear,
  title,
  description,
  children,
  trailing,
}: {
  /** How many filters are set — shown on the button so a narrowed list is never silent. */
  activeCount: number;
  onClear: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  /** Another control on the same row — the statement's Export. */
  trailing?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="flex items-center gap-2 md:hidden">
      <Button
        type="button"
        variant="outline"
        className="h-10 flex-1 justify-between"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        <span className="inline-flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          {title}
        </span>
        {activeCount > 0 && (
          <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground tabular-nums">
            {activeCount}
          </span>
        )}
      </Button>
      {trailing}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="md:hidden">
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            {description && <SheetDescription>{description}</SheetDescription>}
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          <div className="flex gap-2 border-t border-border px-5 py-3">
            {activeCount > 0 && (
              <Button type="button" variant="ghost" className="flex-1" onClick={onClear}>
                {t('transactions.filterClear')}
              </Button>
            )}
            <Button type="button" className="flex-1" onClick={() => setOpen(false)}>
              {t('sheets.showResults')}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

/**
 * A list of large, labelled actions in a bottom sheet — the phone's Export.
 *
 * Two side-by-side buttons ("Download CSV", "Print / Save PDF") do not fit a
 * 360px row beside a Filters button without truncating both. One "Export"
 * button opening a sheet gives each action a full-width row with a sentence
 * saying what it produces, which is what a client choosing between a
 * spreadsheet and a PDF actually needs to know.
 */
export function ActionSheet({
  trigger,
  title,
  actions,
}: {
  trigger: (open: () => void) => React.ReactNode;
  title: string;
  actions: {
    icon: React.ElementType;
    label: string;
    description: string;
    onSelect: () => void;
    disabled?: boolean;
  }[];
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      {trigger(() => setOpen(true))}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
          <div className="space-y-1 p-3">
            {actions.map(({ icon: Icon, label, description, onSelect, disabled }) => (
              <button
                key={label}
                type="button"
                disabled={disabled}
                onClick={() => {
                  setOpen(false);
                  onSelect();
                }}
                className="flex w-full cursor-pointer items-center gap-4 rounded-xl px-3 py-3 text-start transition-colors hover:bg-accent focus-outline disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border text-link">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{label}</span>
                  <span className="block text-xs text-muted-foreground">{description}</span>
                </span>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

/**
 * From / To as two NATIVE date fields — the sheet's date control.
 *
 * Not the two-month popover the desktop toolbar uses: on a phone that panel
 * pins itself to the viewport with `position: fixed`, and inside a sheet that
 * is animating in on a transform, "the viewport" becomes the sheet — the
 * calendar lands in the wrong place. The native field opens the phone's own
 * date wheel, which every client already knows how to use.
 */
export function NativeDateRange({
  value,
  onChange,
  label,
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
  label: string;
}) {
  const set = (patch: Partial<DateRange>) => {
    const next = { ...value, ...patch };
    // Backwards selection is normalised, not refused — the toolbar's rule too.
    onChange(next.from && next.to ? normalizeRange(next) : next);
  };
  return (
    <fieldset className="space-y-1.5">
      <legend className="mb-1.5 block text-[11px] font-semibold text-muted-foreground">
        {label}
      </legend>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="block text-[11px] text-muted-foreground">{t('sheets.dateFrom')}</span>
          <Input
            type="date"
            className="h-10"
            value={value.from ?? ''}
            onChange={(e) => set({ from: e.target.value || null })}
          />
        </label>
        <label className="space-y-1">
          <span className="block text-[11px] text-muted-foreground">{t('sheets.dateTo')}</span>
          <Input
            type="date"
            className="h-10"
            value={value.to ?? ''}
            onChange={(e) => set({ to: e.target.value || null })}
          />
        </label>
      </div>
    </fieldset>
  );
}
