'use client';

import { PdlSweepShadowPill } from '@/components/pdlSweep/PdlSweepShadowPill';
import { HISTORICAL_FIRED_DAYS } from '@/lib/pdlSweepConstants';
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
        {rows.length} trading days tracked — live rule: always LONG 12:00–15:00 UTC unless
        PDL✗ · LDN✗ · H11✗ (all false). Hard SL 20p. Engine: pdl_window.
      </p>
      <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-600 dark:text-slate-400">
        <span>
          Forward fired (3/3 research):{' '}
          <strong className="text-slate-900 dark:text-slate-100">{firedRows.length}</strong>
        </span>
        <span>
          Research baseline:{' '}
          <strong className="text-slate-900 dark:text-slate-100">{HISTORICAL_FIRED_DAYS}</strong> days
          (75%)
        </span>
        <span>
          Forward win rate:{' '}
          <strong className="text-slate-900 dark:text-slate-100">{forwardWinRate}</strong>
        </span>
      </div>
    </header>
  );
}
