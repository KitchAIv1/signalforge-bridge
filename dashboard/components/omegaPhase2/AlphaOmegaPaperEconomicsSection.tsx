'use client';

import { Phase2PaperPnlCell } from '@/components/omegaPhase2/Phase2PaperPnlCell';
import type { SpeedfloorPaperOutcome } from '@/lib/alphaOmegaPaper/paperSimTypes';
import { formatDurationMinutes } from '@/lib/alphaOmegaTradeDisplay';

interface AlphaOmegaPaperEconomicsSectionProps {
  outcome?: SpeedfloorPaperOutcome;
  loading: boolean;
}

export function AlphaOmegaPaperEconomicsSection({
  outcome,
  loading,
}: AlphaOmegaPaperEconomicsSectionProps) {
  return (
    <section>
      <p className="text-[11px] uppercase tracking-wide text-violet-600 dark:text-violet-300">
        Paper outcome (display-only)
      </p>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <div>
          <dt className="text-slate-500">Paper PnL</dt>
          <dd>
            <Phase2PaperPnlCell outcome={outcome} loading={loading} />
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Paper exit</dt>
          <dd className="text-slate-800 dark:text-slate-200">
            {outcome?.exitTrigger ?? '—'}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Paper hold</dt>
          <dd className="tabular-nums text-slate-800 dark:text-slate-200">
            {outcome?.holdMinutes != null
              ? formatDurationMinutes(outcome.holdMinutes)
              : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Paper units</dt>
          <dd className="tabular-nums text-slate-800 dark:text-slate-200">
            {outcome?.paperUnits != null ? outcome.paperUnits.toLocaleString() : '—'}
          </dd>
        </div>
      </dl>
    </section>
  );
}
