'use client';

import * as React from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Button } from './button';
import { cn } from '@/lib/utils';
import { t } from '@/lib/i18n';
import {
  applyDayClick,
  buildMonth,
  EMPTY_RANGE,
  initialMonth,
  nextMonth,
  parseIso,
  previousMonth,
  todayIso,
  type CalendarDay,
  type DateRange,
} from '@/lib/date-range';

/**
 * A from/to date range behind ONE trigger, opening TWO months side by side.
 *
 * ## Why two months rather than one
 *
 * A range almost always spans a boundary — "the last few weeks", "since the end
 * of last month" — and with a single month visible the user has to page
 * backwards, losing sight of the end they already picked. Two panels make the
 * common range a two-click gesture with both ends on screen at once.
 *
 * On a narrow viewport only the first panel renders. Two 7-column grids do not
 * fit a phone without shrinking the hit targets below what a thumb can hit
 * reliably, and a cramped calendar is worse than a paged one.
 *
 * ## Why not `<input type="date">`
 *
 * That is what `ui/date-picker.tsx` is, and it is right for a single date in a
 * form — it gets the platform's own picker for free. It cannot express a RANGE:
 * two of them side by side cannot show which days fall between the ends, cannot
 * be navigated as one unit, and give no way to see both months together. The
 * request here is specifically one trigger opening a two-calendar range, so the
 * grid is drawn rather than delegated.
 *
 * ## All the date arithmetic lives in `lib/date-range.ts`
 *
 * Deliberately: every boundary case here (month ends, backwards selection,
 * timezone slippage) has a wrong answer that only shows up in production, and
 * pure functions make each one a single assertion. This component owns
 * presentation and the open/closed state, nothing else.
 */
export interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  /** No day after this is selectable. Defaults to today — see the note below. */
  maxDate?: string;
  minDate?: string;
  className?: string;
  /** Accessible name for the trigger, since its text is the formatted range. */
  label?: string;
}

export function DateRangePicker({
  value,
  onChange,
  maxDate,
  minDate,
  className,
  label,
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  /*
   * Today is resolved ONCE per mount rather than on every render.
   *
   * `todayIso()` reads the clock, so calling it inline would make the render
   * impure and — across a midnight boundary with the picker open — could shift
   * which cell is highlighted mid-interaction. It also defaults `maxDate`: a
   * FILTER over past transactions has no meaning in the future, and offering
   * days that cannot match anything invites a client to conclude the filter is
   * broken.
   */
  const today = React.useMemo(() => todayIso(), []);
  const effectiveMax = maxDate ?? today;

  /*
   * The month the left panel is showing. Seeded from the current selection so
   * reopening the picker lands on what was chosen rather than on today.
   */
  const [view, setView] = React.useState(() => initialMonth(value, today));

  /*
   * The selection IN PROGRESS, separate from the committed `value`.
   *
   * A range is two clicks. Committing on the first would fire `onChange` with a
   * half-range — from set, to null — which for a filter means "everything since
   * that day", so the table would visibly re-filter to the wrong result between
   * the two clicks. The draft is committed when the range completes or when the
   * user closes the popover.
   */
  const [draft, setDraft] = React.useState<DateRange>(value);

  // Reopening starts from whatever is committed, so an abandoned selection does
  // not persist into the next visit.
  const openPicker = () => {
    setDraft(value);
    setView(initialMonth(value, today));
    setOpen(true);
  };

  const commit = React.useCallback(
    (range: DateRange) => {
      onChange(range);
      setOpen(false);
      // Focus returns to the control that opened the popover. Without this,
      // keyboard focus is left on a button that no longer exists and the tab
      // sequence restarts at the top of the document.
      triggerRef.current?.focus();
    },
    [onChange],
  );

  /*
   * Close on an outside click or Escape.
   *
   * A `mousedown` listener rather than `click`: a `click` handler fires after
   * the target has already received the press, so a click on another control
   * would both close this and activate that — usually fine, but confusing when
   * the other control is a second filter that then opens its own popover.
   *
   * Escape ABANDONS the draft (closes without committing), which is what Escape
   * means everywhere else. Clicking outside COMMITS what is selected, because
   * that reads as "I'm done here" rather than "cancel".
   */
  React.useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        onChange(draft);
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, draft, onChange]);

  const handleDayClick = (day: CalendarDay) => {
    if (day.disabled) return;
    const updated = applyDayClick(draft, day.iso);
    setDraft(updated);
    // Both ends chosen — the gesture is finished, so commit and close rather
    // than making the user find a confirm button for a decision already made.
    if (updated.from && updated.to) commit(updated);
  };

  const right = nextMonth(view.year, view.month);
  const hasSelection = value.from !== null || value.to !== null;

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openPicker())}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label ?? t('transactions.filterDateRange')}
        className="flex h-9 w-full items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-medium transition-colors hover:bg-muted focus-outline"
      >
        <CalendarIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span
          className={cn('flex-1 truncate text-start', !hasSelection && 'text-muted-foreground')}
        >
          {formatRangeLabel(value)}
        </span>
        {/*
          The clear affordance is a SPAN, not a nested <button>.

          A button inside a button is invalid HTML and browsers recover from it
          unpredictably — some drop the inner one entirely. The outer trigger
          already handles the click; this one stops propagation so it clears
          instead of opening. It carries `role="button"` and a key handler so it
          stays reachable without a mouse.
        */}
        {hasSelection && (
          <span
            role="button"
            tabIndex={0}
            aria-label={t('transactions.filterClearDates')}
            onClick={(event) => {
              event.stopPropagation();
              onChange(EMPTY_RANGE);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.stopPropagation();
                onChange(EMPTY_RANGE);
              }
            }}
            className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-outline"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t('transactions.filterDateRange')}
          /*
           * `end-0` rather than `start-0` — logical, so it flips under RTL.
           *
           * The popover is wider than its trigger, and these filters sit toward
           * the right of a toolbar; anchoring to the leading edge would push it
           * off-screen on a narrow desktop window. `z-50` clears the sticky
           * table header, which is `z-20`.
           */
          /*
           * ⚠️ `w-max` — WITHOUT IT THE POPOVER CANNOT BE WIDER THAN THE TRIGGER.
           *
           * This is the whole bug, and it is not obvious. An absolutely
           * positioned box with `width: auto` is shrink-to-fit, which CSS defines
           * as `min(max(preferred-minimum, available), preferred)` — and
           * `available` is the width of the containing block. The containing
           * block here is the `relative` wrapper around the trigger, one cell of
           * the filter grid. So two calendars side by side were squeezed into a
           * quarter-width toolbar column no matter how the grid inside was sized.
           *
           * `w-max` opts out: the box takes its max-content width, which is what
           * the two months actually need. The trigger keeps its own width and is
           * unaffected — it is a sibling, not a parent of this.
           *
           * ## The phone
           *
           * `max-w-[calc(100vw-2rem)]` caps it at the viewport with a 1rem
           * margin either side, because `w-max` on its own would happily run off
           * the screen. The second month is already hidden below `sm` (see
           * below), so at that cap a phone shows one full month rather than a
           * clipped pair. `end-0` anchors the popover's trailing edge to the
           * trigger's, so it grows INWARD — off the leading edge is where a
           * `start-0` version would disappear on a narrow window.
           */
          className="absolute end-0 z-50 mt-2 w-max max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card p-4 shadow-lg"
        >
          <div className="flex items-center justify-between px-1 pb-3">
            <button
              type="button"
              onClick={() => setView(previousMonth(view.year, view.month))}
              aria-label={t('transactions.calendarPrevMonth')}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-outline"
            >
              {/* Mirrored under RTL rather than swapped: "previous" points at
                  the start of the line, which is the right in Arabic. */}
              <ChevronLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
            </button>

            <div className="flex flex-1 justify-around gap-8 text-sm font-semibold">
              <span>{monthLabel(view.year, view.month)}</span>
              <span className="hidden sm:inline">{monthLabel(right.year, right.month)}</span>
            </div>

            <button
              type="button"
              onClick={() => setView(nextMonth(view.year, view.month))}
              aria-label={t('common.next')}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-outline"
            >
              <ChevronRight className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
            </button>
          </div>

          <div className="flex gap-8">
            <MonthGrid
              year={view.year}
              month={view.month}
              range={draft}
              today={today}
              minDate={minDate}
              maxDate={effectiveMax}
              onDayClick={handleDayClick}
            />
            {/* The second month is desktop-only — see the component note. */}
            <div className="hidden sm:block">
              <MonthGrid
                year={right.year}
                month={right.month}
                range={draft}
                today={today}
                minDate={minDate}
                maxDate={effectiveMax}
                onDayClick={handleDayClick}
              />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">{formatRangeLabel(draft)}</p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDraft(EMPTY_RANGE);
                  commit(EMPTY_RANGE);
                }}
              >
                {t('transactions.filterClearDates')}
              </Button>
              {/*
                An explicit Apply, for the half-range case.

                A completed range commits on the second click, so this is not
                the usual path. It exists because "from the 5th onward, no end
                date" is a legitimate filter that the click cycle alone can never
                commit — without this button that range would be unreachable.
              */}
              <Button type="button" size="sm" onClick={() => commit(draft)}>
                {t('transactions.filterApply')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** One month: weekday headings and a 6×7 grid of days. */
function MonthGrid({
  year,
  month,
  range,
  today,
  minDate,
  maxDate,
  onDayClick,
}: {
  year: number;
  month: number;
  range: DateRange;
  today: string;
  minDate?: string;
  maxDate?: string;
  onDayClick: (day: CalendarDay) => void;
}) {
  const days = React.useMemo(
    () => buildMonth(year, month, { range, today, minDate, maxDate }),
    [year, month, range, today, minDate, maxDate],
  );

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 pb-1">
        {weekdayLabels().map((weekday) => (
          <span
            key={weekday.key}
            className="flex h-8 w-10 items-center justify-center text-[11px] font-semibold text-muted-foreground"
            // The single letter is ambiguous out of context (T could be Tuesday
            // or Thursday), so the full name is what assistive tech announces.
            aria-label={weekday.long}
            title={weekday.long}
          >
            {weekday.short}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const isEnd = day.isRangeStart || day.isRangeEnd;
          return (
            <button
              key={day.iso}
              type="button"
              disabled={day.disabled}
              onClick={() => onDayClick(day)}
              /*
               * The full date is the accessible name. A bare "14" repeated
               * across two panels gives a screen-reader user no way to tell
               * which month they are in, and `aria-pressed` says whether the
               * cell is part of the current selection.
               */
              aria-label={longDateLabel(day.iso)}
              aria-pressed={isEnd || day.isInRange}
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-md text-sm transition-colors focus-outline',
                !day.inMonth && 'text-muted-foreground/40',
                day.disabled && 'cursor-not-allowed opacity-40 hover:bg-transparent',
                !day.disabled && !isEnd && !day.isInRange && 'hover:bg-muted',
                // The connecting wash between the two ends.
                day.isInRange && 'bg-primary/15 text-foreground',
                isEnd && 'bg-primary font-semibold text-primary-foreground',
                // Today is RINGED rather than filled, so it never competes with
                // a selected end for the same visual weight.
                day.isToday && !isEnd && 'ring-1 ring-inset ring-link',
              )}
            >
              {day.dayOfMonth}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Weekday headings, Monday-first, in the reader's own locale.
 *
 * Generated from a known Monday (2024-01-01) via `Intl` rather than hardcoded
 * English initials, so the calendar is already correct when a second locale
 * lands — the same reason every string in this app goes through `t()`.
 */
function weekdayLabels(): { key: string; short: string; long: string }[] {
  const monday = new Date(2024, 0, 1);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index);
    return {
      key: String(index),
      short: date.toLocaleDateString(undefined, { weekday: 'narrow' }),
      long: date.toLocaleDateString(undefined, { weekday: 'long' }),
    };
  });
}

function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

/**
 * `Monday, 7 August 2026` for one cell's accessible name.
 *
 * Built with local parts so it names the same day the grid drew — parsing the
 * ISO string with `new Date(iso)` would reintroduce the UTC shift the whole
 * module avoids.
 */
function longDateLabel(iso: string): string {
  const parts = parseIso(iso);
  // `iso` comes from `buildMonth`, so this cannot fail in practice. Falling back
  // to the raw string rather than asserting keeps an unexpected value visible as
  // itself instead of crashing a calendar cell.
  if (!parts) return iso;
  return new Date(parts.year, parts.month, parts.day).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** The trigger's text: what is selected, or an invitation to select. */
function formatRangeLabel(range: DateRange): string {
  const from = range.from ? shortDate(range.from) : null;
  const to = range.to ? shortDate(range.to) : null;

  if (from && to) return t('transactions.dateBoth', { from, to });
  if (from) return t('transactions.dateFromOnly', { from });
  if (to) return t('transactions.dateToOnly', { to });
  return t('transactions.dateAnyTime');
}

function shortDate(iso: string): string {
  const parts = parseIso(iso);
  if (!parts) return iso;
  return new Date(parts.year, parts.month, parts.day).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
