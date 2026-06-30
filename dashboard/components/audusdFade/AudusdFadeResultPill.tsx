'use client';

import type { FadeTradeResult } from '@/lib/audusdFadeTypes';

type ResultPillProps = {
  result: FadeTradeResult | null;
  successful: boolean | null;
};

export function AudusdFadeResultPill({ result, successful }: ResultPillProps) {
  if (result == null) {
    return (
      <span className="rounded px-1.5 py-0.5 text-xs font-semibold text-sky-700 bg-sky-50 dark:text-sky-300 dark:bg-sky-900/20">
        OPEN
      </span>
    );
  }
  if (successful === true) {
    return (
      <span className="rounded px-1.5 py-0.5 text-xs font-semibold text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-900/20">
        ✓ WIN
      </span>
    );
  }
  if (successful === false) {
    return (
      <span className="rounded px-1.5 py-0.5 text-xs font-semibold text-red-700 bg-red-50 dark:text-red-300 dark:bg-red-900/20">
        ✗ LOSS
      </span>
    );
  }
  return (
    <span className="rounded px-1.5 py-0.5 text-xs font-semibold text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-900/20">
      {result.replace('_', ' ').toUpperCase()}
    </span>
  );
}
