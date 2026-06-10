'use client';

import type { AsianSessionDetection } from '@/lib/directionDecisionTypes';

type ConfidencePillProps = {
  tier: AsianSessionDetection['confidence_tier'];
};

export function AsianSessionConfidencePill({ tier }: ConfidencePillProps) {
  if (tier === 'HIGH') {
    return (
      <span className="rounded px-1.5 py-0.5 text-xs font-semibold text-green-700 bg-green-50 dark:text-green-400 dark:bg-green-900/20">
        ✓ HIGH
      </span>
    );
  }
  if (tier === 'MEDIUM') {
    return (
      <span className="rounded px-1.5 py-0.5 text-xs font-semibold text-slate-600 bg-slate-100 dark:text-slate-300 dark:bg-slate-800">
        MEDIUM
      </span>
    );
  }
  if (tier === 'LOW') {
    return (
      <span className="rounded px-1.5 py-0.5 text-xs font-semibold text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-900/20">
        ⚠ LOW
      </span>
    );
  }
  return <span className="text-slate-400">—</span>;
}
