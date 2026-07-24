'use client';

import type { SpeedfloorPaperScore } from '@/lib/alphaOmegaPaper/aggregatePaperOutcomes';
import {
  formatSignedDollars,
  formatSignedPips,
} from '@/lib/alphaOmegaTradeDisplay';

interface AlphaOmegaPaperScoreCardProps {
  paperScore: SpeedfloorPaperScore | null;
  loading: boolean;
}

export function AlphaOmegaPaperScoreCard({
  paperScore,
  loading,
}: AlphaOmegaPaperScoreCardProps) {
  const value = loading
    ? '…'
    : paperScore
      ? formatSignedPips(paperScore.paperNetPips)
      : '—';
  const hint = loading
    ? 'Simulating SPEEDFLOOR shadows'
    : paperScore
      ? `${formatSignedDollars(paperScore.paperNetDollars)} · ${paperScore.closedCount} closed` +
        (paperScore.openCount ? ` · ${paperScore.openCount} open` : '')
      : 'No SPEEDFLOOR paper yet';
  const tone =
    paperScore && paperScore.paperNetPips > 0
      ? 'text-violet-600 dark:text-violet-300'
      : paperScore && paperScore.paperNetPips < 0
        ? 'text-violet-700 dark:text-violet-200'
        : 'text-violet-600 dark:text-violet-300';

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 dark:border-violet-900/50 dark:bg-violet-950/20">
      <p className="text-[11px] font-medium uppercase tracking-wide text-violet-700 dark:text-violet-300">
        Shadow paper net
      </p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${tone}`}>{value}</p>
      <p className="mt-0.5 text-[11px] text-violet-700/80 dark:text-violet-300/80">{hint}</p>
      <p className="mt-1 text-[10px] text-violet-600/70 dark:text-violet-400/70">
        Display-only · not in Today/7d live nets
      </p>
    </div>
  );
}
