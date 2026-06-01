'use client';

import type { ScalperTradeSummary } from '@/lib/directionDecisionLogic';
import type { ScalperDayState } from '@/lib/types';

interface ScalperDetailStripProps {
  scalperDayState: ScalperDayState | null;
  tradeSummary: ScalperTradeSummary;
  visible: boolean;
}

function formatPrice(value: number | null | undefined): string {
  if (value == null) return '—';
  return value.toFixed(5);
}

export function ScalperDetailStrip({
  scalperDayState,
  tradeSummary,
  visible,
}: ScalperDetailStripProps) {
  if (!visible) return null;

  const ratchetMax = 3;
  const ratchetCount = scalperDayState?.ratchet_count ?? 0;

  return (
    <div className="mt-auto rounded-lg border border-teal-200 bg-teal-50/60 px-3 py-2 dark:border-teal-800 dark:bg-teal-900/15">
      <p className="text-xs font-semibold uppercase tracking-wide text-teal-800 dark:text-teal-300">
        Scalper detail
      </p>
      <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-700 dark:text-slate-200 sm:grid-cols-4">
        <p>
          <span className="text-slate-500 dark:text-slate-400">Reference: </span>
          {formatPrice(scalperDayState?.reference_price)}
        </p>
        <p>
          <span className="text-slate-500 dark:text-slate-400">Trigger: </span>
          {formatPrice(scalperDayState?.trigger_level)}
        </p>
        <p>
          <span className="text-slate-500 dark:text-slate-400">Ratchet: </span>
          {ratchetCount}/{ratchetMax}
        </p>
        <p>
          <span className="text-slate-500 dark:text-slate-400">Trades: </span>
          {tradeSummary.wins}W / {tradeSummary.losses}L ·{' '}
          {tradeSummary.netPips >= 0 ? '+' : ''}
          {tradeSummary.netPips} pips
        </p>
      </div>
      {scalperDayState?.stop_reason && (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Stop reason: {scalperDayState.stop_reason}
        </p>
      )}
    </div>
  );
}
