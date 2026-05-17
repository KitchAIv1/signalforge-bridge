'use client';

import type { BridgeTradeLogRow } from '@/lib/types';
import { amdTagColor, amdTagLabel } from '@/lib/amdPanelFormatters';
import { formatActivityIsoTimestamp } from '@/components/activity/activityFormat';
import { RegimeConfidenceBadge } from '@/components/RegimeConfidenceBadge';
import { CloseTagButton } from '@/components/activity/CloseTagButton';

export function ActivityTradeTableRow({ row }: { row: BridgeTradeLogRow }) {
  const isExecuted = row.decision === 'EXECUTED';
  const isWin = row.result === 'win';
  const isLoss = row.result === 'loss';
  const pnlColorClass = isWin ? 'text-emerald-600' : isLoss ? 'text-red-500' : 'text-slate-500';
  const resultBadgeClasses = row.result
    ? isWin
      ? 'bg-emerald-100 text-emerald-700'
      : isLoss
        ? 'bg-red-100 text-red-700'
        : 'bg-slate-100 text-slate-600'
    : '';
  const decisionBadgeClasses =
    row.decision === 'EXECUTED'
      ? 'bg-emerald-100 text-emerald-700'
      : row.decision === 'BLOCKED'
        ? 'bg-red-100 text-red-700'
        : 'bg-amber-100 text-amber-700';

  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50">
      <td className="px-3 py-2 text-xs text-slate-600">{formatActivityIsoTimestamp(row.created_at)}</td>
      <td className="px-3 py-2 text-xs font-medium">{row.engine_id}</td>
      <td className="px-3 py-2 text-xs">{row.pair}</td>
      <td className="px-3 py-2 text-xs font-medium">
        {row.direction === 'long' || row.direction === 'LONG' ? (
          <span className="text-emerald-600">LONG</span>
        ) : (
          <span className="text-red-500">SHORT</span>
        )}
      </td>
      <td className="px-3 py-2 text-xs">
        <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${decisionBadgeClasses}`}>
          {row.decision}
        </span>
      </td>
      <td className="max-w-[140px] truncate px-3 py-2 text-xs text-slate-500" title={row.block_reason ?? ''}>
        {row.block_reason ?? '—'}
      </td>
      <td className="px-3 py-2 text-xs text-slate-500">{row.signal_session ?? '—'}</td>
      <td className="px-3 py-2 text-xs">
        {isExecuted && row.fill_price != null ? Number(row.fill_price).toFixed(5) : '—'}
      </td>
      <td className="px-3 py-2 text-xs">
        {isExecuted && row.stop_loss != null ? Number(row.stop_loss).toFixed(5) : '—'}
      </td>
      <td className="px-3 py-2 text-xs">
        {isExecuted && row.take_profit != null ? Number(row.take_profit).toFixed(5) : '—'}
      </td>
      <td className="px-3 py-2 text-xs">
        {isExecuted && row.exit_price != null ? Number(row.exit_price).toFixed(5) : '—'}
      </td>
      <td className={`px-3 py-2 text-xs font-medium ${pnlColorClass}`}>
        {row.pnl_dollars != null ? (row.pnl_dollars >= 0 ? '+' : '') + Number(row.pnl_dollars).toFixed(2) : '—'}
      </td>
      <td className={`px-3 py-2 text-xs ${pnlColorClass}`}>
        {row.pnl_r != null ? (row.pnl_r >= 0 ? '+' : '') + Number(row.pnl_r).toFixed(2) + 'R' : '—'}
      </td>
      <td className="px-3 py-2 text-xs text-slate-500">
        {row.duration_minutes != null ? Math.round(Number(row.duration_minutes)) + 'm' : '—'}
      </td>
      <td className="px-3 py-2 text-xs text-slate-500">{row.close_reason ?? '—'}</td>
      <td className="px-3 py-2 text-xs">
        {row.result ? (
          <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${resultBadgeClasses}`}>
            {row.result}
          </span>
        ) : (
          '—'
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
          <span className="text-gray-600">—</span>
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
