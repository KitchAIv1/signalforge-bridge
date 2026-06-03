import type { ReactElement } from 'react';

export function AmdHistoryChartGrayCard({
  message,
}: {
  message: string;
}): ReactElement {
  return (
    <div className="flex h-40 items-center justify-center rounded-lg border border-slate-700 bg-slate-800/60 px-4">
      <p className="text-center text-sm text-slate-400">{message}</p>
    </div>
  );
}

export function AmdHistoryChartPendingBanner(): ReactElement {
  return (
    <div className="rounded-lg border border-amber-700/50 bg-amber-950/40 px-3 py-2">
      <p className="text-xs text-amber-300">
        ⏳ Distribution window not yet complete — outcome tag and reversal status update at 16:30 UTC
      </p>
    </div>
  );
}

export function shouldShowOutcomePendingBanner(
  outcomeEvaluatedAt: string | null | undefined,
  forceOutcomePending?: boolean,
): boolean {
  if (forceOutcomePending && process.env.NODE_ENV === 'development') return true;
  return !outcomeEvaluatedAt;
}

export function resolveChartEmptyState(amdState: {
  amd_tag: string;
  chart_data: unknown;
  trade_date: string;
}): 'insufficient' | 'pre_may_no_data' | null {
  if (amdState.amd_tag === 'INSUFFICIENT_DATA') return 'insufficient';
  if (!amdState.chart_data && amdState.trade_date < '2025-05-01') return 'pre_may_no_data';
  return null;
}
