'use client';

import type { BridgeTradeLogRow } from '@/lib/types';
import {
  isPhase2ShadowFlagged,
  resolvePhase2AdvisoryDisplay,
} from '@/lib/phase2LaneAdvisoryFormat';

interface Phase2ShadowStatsBarProps {
  tradeRows: BridgeTradeLogRow[];
}

function countByKind(tradeRows: BridgeTradeLogRow[]) {
  let shadowCount = 0;
  let liveBlockCount = 0;
  let clearCount = 0;

  for (const tradeRow of tradeRows) {
    const display = resolvePhase2AdvisoryDisplay(
      tradeRow.lane_advisory,
      tradeRow.decision,
      tradeRow.block_reason,
    );
    if (display.kind === 'r1_shadow' || display.kind === 'phase2_shadow') shadowCount += 1;
    else if (display.kind === 'r1_live' || display.kind === 'phase2_live') liveBlockCount += 1;
    else clearCount += 1;
  }

  return { shadowCount, liveBlockCount, clearCount };
}

export function Phase2ShadowStatsBar({ tradeRows }: Phase2ShadowStatsBarProps) {
  const executedRows = tradeRows.filter((row) => row.decision === 'EXECUTED');
  const blockedRows = tradeRows.filter((row) => row.decision === 'BLOCKED');
  const shadowRows = tradeRows.filter((row) => isPhase2ShadowFlagged(row));
  const { shadowCount, liveBlockCount, clearCount } = countByKind(tradeRows);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Rows loaded" value={String(tradeRows.length)} hint={`${executedRows.length} executed · ${blockedRows.length} blocked`} />
      <StatCard label="Shadow flagged" value={String(shadowCount)} hint={`${shadowRows.length} in current view`} accent="amber" />
      <StatCard label="Live blocks" value={String(liveBlockCount)} hint="R1 or Phase2 enforce" accent="red" />
      <StatCard label="Clear passes" value={String(clearCount)} hint="No gate signal on row" />
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint: string;
  accent?: 'amber' | 'red';
}) {
  const valueClass =
    accent === 'amber'
      ? 'text-amber-600 dark:text-amber-300'
      : accent === 'red'
        ? 'text-red-600 dark:text-red-300'
        : 'text-slate-900 dark:text-slate-100';

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${valueClass}`}>{value}</p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
    </div>
  );
}
