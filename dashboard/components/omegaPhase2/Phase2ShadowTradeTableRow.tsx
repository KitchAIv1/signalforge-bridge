'use client';

import type { BridgeTradeLogRow } from '@/lib/types';
import { amdTagColor, amdTagLabel } from '@/lib/amdPanelFormatters';
import { formatActivityIsoTimestamp } from '@/components/activity/activityFormat';
import { Phase2LaneAdvisoryBadge } from '@/components/omegaPhase2/Phase2LaneAdvisoryBadge';
import { resolvePhase2AdvisoryDisplay } from '@/lib/phase2LaneAdvisoryFormat';
import { formatCloseReason } from '@/lib/formatCloseReason';

export const PHASE2_SHADOW_DESKTOP_COLUMN_COUNT = 11;

interface Phase2ShadowTradeTableRowProps {
  tradeRow: BridgeTradeLogRow;
}

function decisionBadgeClass(decision: string): string {
  if (decision === 'EXECUTED') {
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300';
  }
  if (decision === 'BLOCKED') {
    return 'bg-red-100 text-red-700 dark:bg-red-950/45 dark:text-red-300';
  }
  return 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300';
}

export function Phase2ShadowTradeTableRow({ tradeRow }: Phase2ShadowTradeTableRowProps) {
  const advisoryDisplay = resolvePhase2AdvisoryDisplay(
    tradeRow.lane_advisory,
    tradeRow.decision,
    tradeRow.block_reason,
  );
  const isLong = tradeRow.direction === 'long' || tradeRow.direction === 'LONG';
  const pnlClass =
    tradeRow.result === 'win'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tradeRow.result === 'loss'
        ? 'text-red-600 dark:text-red-400'
        : 'text-slate-600 dark:text-slate-400';

  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50">
      <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-300">
        {formatActivityIsoTimestamp(tradeRow.created_at)}
      </td>
      <td className="px-3 py-2 text-xs font-medium">
        {isLong ? (
          <span className="text-emerald-600 dark:text-emerald-400">LONG</span>
        ) : (
          <span className="text-red-600 dark:text-red-400">SHORT</span>
        )}
      </td>
      <td className="px-3 py-2 text-xs">
        <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${decisionBadgeClass(tradeRow.decision)}`}>
          {tradeRow.decision}
        </span>
      </td>
      <td className="px-3 py-2 text-xs">
        <Phase2LaneAdvisoryBadge display={advisoryDisplay} />
      </td>
      <td
        className="max-w-[160px] truncate px-3 py-2 text-xs text-slate-600 dark:text-slate-400"
        title={tradeRow.block_reason ?? undefined}
      >
        {tradeRow.block_reason ?? '—'}
      </td>
      <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">{tradeRow.signal_session ?? '—'}</td>
      <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">{tradeRow.status}</td>
      <td className={`px-3 py-2 text-xs font-medium ${pnlClass}`}>
        {tradeRow.pnl_r != null ? (tradeRow.pnl_r >= 0 ? '+' : '') + Number(tradeRow.pnl_r).toFixed(2) + 'R' : '—'}
      </td>
      <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">
        {formatCloseReason(tradeRow.close_reason)}
      </td>
      <td className={`px-3 py-2 text-xs font-medium ${amdTagColor(tradeRow.amd_tag ?? null)}`}>
        {tradeRow.amd_tag ? amdTagLabel(tradeRow.amd_tag) : '—'}
      </td>
      <td
        className="max-w-[180px] truncate px-3 py-2 font-mono text-[10px] text-slate-500 dark:text-slate-500"
        title={tradeRow.lane_advisory ?? undefined}
      >
        {tradeRow.lane_advisory ?? '—'}
      </td>
    </tr>
  );
}
