'use client';

import { PdlSweepShadowPill } from '@/components/pdlSweep/PdlSweepShadowPill';
import {
  HISTORICAL_FIRED_DAYS,
  PDL_DETECTION_CRON_UTC,
  PDL_WINDOW_HARD_SL_PIPS,
  PDL_WINDOW_VT_SPREAD_PIPS,
} from '@/lib/pdlSweepConstants';
import { computePdlForwardWinRate } from '@/lib/pdlSweepStats';
import type { PdlSweepSignalRow } from '@/lib/pdlSweepTypes';

type PageHeaderProps = {
  rows: PdlSweepSignalRow[];
  firedRows: PdlSweepSignalRow[];
  liveArmed: boolean;
};

export function PdlSweepPageHeader({ rows, firedRows, liveArmed }: PageHeaderProps) {
  const forwardWinRate = computePdlForwardWinRate(firedRows);

  return (
    <header className="mb-6 shrink-0">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          PDL Sweep / Window
        </h1>
        <PdlSweepShadowPill liveArmed={liveArmed} />
      </div>
      <p className="mt-1 text-sm text-slate-500">
        {rows.length} trading days tracked — live entry ~{PDL_DETECTION_CRON_UTC} UTC,
        flatten 13:00; SHORT if all✗ or all✓ (P1L1H1), else LONG. Hard SL{' '}
        {PDL_WINDOW_HARD_SL_PIPS}p · VT spread {PDL_WINDOW_VT_SPREAD_PIPS}p netted. Engine:
        pdl_window.
      </p>
      <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-600 dark:text-slate-400">
        <span>
          Research 3/3 fired:{' '}
          <strong className="text-slate-900 dark:text-slate-100">{firedRows.length}</strong>
        </span>
        <span>
          Research baseline:{' '}
          <strong className="text-slate-900 dark:text-slate-100">{HISTORICAL_FIRED_DAYS}</strong>{' '}
          days
        </span>
        <span>
          Research H12 win rate:{' '}
          <strong className="text-slate-900 dark:text-slate-100">{forwardWinRate}</strong>
        </span>
      </div>
    </header>
  );
}
