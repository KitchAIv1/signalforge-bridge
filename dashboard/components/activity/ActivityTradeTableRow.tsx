'use client';

import type { BridgeTradeLogRow } from '@/lib/types';
import { amdTagColor, amdTagLabel } from '@/lib/amdPanelFormatters';
import { formatActivityIsoTimestamp } from '@/components/activity/activityFormat';
import { RegimeConfidenceBadge } from '@/components/RegimeConfidenceBadge';
import { CloseTagButton } from '@/components/activity/CloseTagButton';
import { OmegaLegTypeBadge } from '@/components/shared/OmegaLegTypeBadge';
import { BrokerVenueBadge } from '@/components/shared/BrokerVenueBadge';
import { formatCloseReason } from '@/lib/formatCloseReason';
import { engineDisplayLabel } from '@/lib/engineDisplayLabel';

export function ActivityTradeTableRow({ row }: { row: BridgeTradeLogRow }) {
  const isExecuted = row.decision === 'EXECUTED';
  const isWin = row.result === 'win';
  const isLoss = row.result === 'loss';
  const pnlColorClass = isWin
    ? 'text-emerald-600 dark:text-emerald-400'
    : isLoss
      ? 'text-red-600 dark:text-red-400'
      : 'text-slate-600 dark:text-slate-400';
  const resultBadgeClasses = row.result
    ? isWin
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
      : isLoss
        ? 'bg-red-100 text-red-700 dark:bg-red-950/45 dark:text-red-300'
        : 'bg-slate-100 text-slate-600 dark:bg-slate-700/70 dark:text-slate-200'
    : '';
  const decisionBadgeClasses =
    row.decision === 'EXECUTED'
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
      : row.decision === 'BLOCKED'
        ? 'bg-red-100 text-red-700 dark:bg-red-950/45 dark:text-red-300'
        : 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300';

  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50">
      <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-300">{formatActivityIsoTimestamp(row.created_at)}</td>
      <td className="px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100">
        <div className="flex flex-wrap items-center gap-1">
          {engineDisplayLabel(row.engine_id)}
          <OmegaLegTypeBadge legType={row.leg_type} />
          <BrokerVenueBadge brokerId={row.broker_id} />
        </div>
      </td>
      <td className="px-3 py-2 text-xs text-slate-800 dark:text-slate-300">{row.pair}</td>
      <td className="px-3 py-2 text-xs font-medium">
        <div className="flex items-center gap-1">
          {row.direction === 'long' || row.direction === 'LONG' ? (
            <span className="text-emerald-600 dark:text-emerald-400">LONG</span>
          ) : (
            <span className="text-red-600 dark:text-red-400">SHORT</span>
          )}
          {row.direction_source === 'auto' && (
            <span className="rounded bg-blue-100 px-1 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
              AUTO
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-2 text-xs">
        <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${decisionBadgeClasses}`}>
          {row.decision}
        </span>
      </td>
      <td className="max-w-[140px] truncate px-3 py-2 text-xs text-slate-600 dark:text-slate-400" title={row.block_reason ?? ''}>
        {row.block_reason ?? '—'}
      </td>
      <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">{row.signal_session ?? '—'}</td>
      <td className="px-3 py-2 text-xs text-slate-800 dark:text-slate-300">
        {isExecuted && row.fill_price != null ? Number(row.fill_price).toFixed(5) : '—'}
      </td>
      <td className="px-3 py-2 text-xs text-slate-800 dark:text-slate-300">
        {isExecuted && row.stop_loss != null ? Number(row.stop_loss).toFixed(5) : '—'}
      </td>
      <td className="px-3 py-2 text-xs text-slate-800 dark:text-slate-300">
        {isExecuted && row.take_profit != null ? Number(row.take_profit).toFixed(5) : '—'}
      </td>
      <td className="px-3 py-2 text-xs text-slate-800 dark:text-slate-300">
        {isExecuted && row.exit_price != null ? Number(row.exit_price).toFixed(5) : '—'}
      </td>
      <td className={`px-3 py-2 text-xs font-medium ${pnlColorClass}`}>
        {row.pnl_dollars != null ? (row.pnl_dollars >= 0 ? '+' : '') + Number(row.pnl_dollars).toFixed(2) : '—'}
      </td>
      <td className={`px-3 py-2 text-xs ${pnlColorClass}`}>
        {row.pnl_r != null ? (row.pnl_r >= 0 ? '+' : '') + Number(row.pnl_r).toFixed(2) + 'R' : '—'}
      </td>
      <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">
        {row.duration_minutes != null ? Math.round(Number(row.duration_minutes)) + 'm' : '—'}
      </td>
      <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">{formatCloseReason(row.close_reason)}</td>
      <td className="px-3 py-2 text-xs text-slate-800 dark:text-slate-200">
        {row.result ? (
          <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${resultBadgeClasses}`}>
            {row.result}
          </span>
        ) : (
          <span className="text-slate-400 dark:text-slate-500">—</span>
        )}
      </td>
      <td className="px-3 py-2">
        <RegimeConfidenceBadge
          confidence={row.regime_confidence ?? null}
          direction={row.regime_direction ?? null}
          evaluatedAt={row.regime_evaluated_at ?? null}
        />
      </td>
      <td className={`px-3 py-2 text-xs font-medium ${amdTagColor(row.amd_tag ?? null)}`}>
        {row.amd_tag != null && row.amd_tag !== '' ? (
          amdTagLabel(row.amd_tag)
        ) : (
          <span className="text-slate-500 dark:text-slate-400">—</span>
        )}
      </td>
      <td className="px-3 py-2 align-top">
        <CloseTagButton
          tradeId={row.id}
          currentTag={row.close_tag ?? null}
          closeReason={row.close_reason ?? null}
          pnlR={row.pnl_r != null ? Number(row.pnl_r) : null}
        />
      </td>
    </tr>
  );
}
