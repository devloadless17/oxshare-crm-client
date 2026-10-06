'use client';

import { t, type MessageKey } from '@/lib/i18n';
import { presetRange, RANGE_PRESETS, type DateRange, type RangePreset } from '@/lib/date-range';

const PRESET_LABEL: Record<RangePreset, MessageKey> = {
  '7d': 'transactions.presetLast7',
  '30d': 'transactions.presetLast30',
  thisMonth: 'transactions.presetThisMonth',
  lastMonth: 'transactions.presetLastMonth',
  '3m': 'transactions.presetLast3Months',
  thisYear: 'transactions.presetThisYear',
};

/**
 * The quick periods, one tap each — the admin console's vocabulary. Each picks
 * a complete range ending today (`presetRange`), which the picker commits.
 */
export function DateRangePresets({ onPick }: { onPick: (range: DateRange) => void }) {
  return (
    <div className="mb-3 flex flex-wrap gap-1.5 border-b border-border pb-3">
      {RANGE_PRESETS.map((preset) => (
        <button
          key={preset}
          type="button"
          onClick={() => onPick(presetRange(preset))}
          className="rounded-full border border-input bg-card px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted focus-outline"
        >
          {t(PRESET_LABEL[preset])}
        </button>
      ))}
    </div>
  );
}
