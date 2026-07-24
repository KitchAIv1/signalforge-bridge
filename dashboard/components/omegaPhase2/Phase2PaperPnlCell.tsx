'use client';

import type { SpeedfloorPaperOutcome } from '@/lib/alphaOmegaPaper/paperSimTypes';
import {
  formatSignedDollars,
  formatSignedPips,
  pnlToneClass,
} from '@/lib/alphaOmegaTradeDisplay';

interface Phase2PaperPnlCellProps {
  outcome: SpeedfloorPaperOutcome | undefined;
  loading: boolean;
}

export function Phase2PaperPnlCell({ outcome, loading }: Phase2PaperPnlCellProps) {
  if (loading && !outcome) {
    return <span className="text-[11px] text-violet-500">Paper…</span>;
  }
  if (!outcome) {
    return <span className="text-slate-400">—</span>;
  }
  if (outcome.status === 'insufficient_data') {
    return (
      <span className="text-[11px] text-amber-600 dark:text-amber-400" title={outcome.detail ?? ''}>
        Paper n/a
      </span>
    );
  }
  if (outcome.status === 'paper_open') {
    return (
      <span className="text-[11px] font-medium text-violet-600 dark:text-violet-300">
        Paper open
      </span>
    );
  }
  const tone = pnlToneClass(null, outcome.paperPips);
  return (
    <div className={`tabular-nums ${tone}`} title={paperTitle(outcome)}>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-300">
        Paper
      </div>
      <div>{formatSignedPips(outcome.paperPips)}</div>
      <div className="text-[10px] opacity-80">{formatSignedDollars(outcome.paperDollars)}</div>
    </div>
  );
}

function paperTitle(outcome: SpeedfloorPaperOutcome): string {
  const parts = [
    outcome.exitTrigger ? `exit=${outcome.exitTrigger}` : null,
    outcome.holdMinutes != null ? `hold=${outcome.holdMinutes}m` : null,
    outcome.paperUnits != null ? `units=${outcome.paperUnits}` : null,
  ].filter(Boolean);
  return parts.join(' · ');
}
