import type { OmegaShadowSignalRow } from '@/lib/types';
import { omegaFmtTime, omegaR2 } from '@/lib/omegaShadowFormat';

function outcomeClassName(outcome: OmegaShadowSignalRow['final_outcome']) {
  if (outcome === 'tp3r') return 'text-emerald-600 font-medium';
  if (outcome === 'tp2r') return 'text-emerald-500 font-medium';
  if (outcome === 'tp1r') return 'text-emerald-400';
  if (outcome === 'sl') return 'text-red-500';
  if (outcome === 'expired') return 'text-slate-400';
  return 'text-slate-300';
}

function spreadClassName(spreadR: number) {
  if (spreadR > 0.35) return 'text-red-400';
  if (spreadR > 0.2) return 'text-amber-500';
  return 'text-slate-600';
}

interface OmegaShadowRecentSignalRowProps {
  row: OmegaShadowSignalRow;
}

export function OmegaShadowRecentSignalRow({
  row,
}: OmegaShadowRecentSignalRowProps) {
  const rPips = (row.r_size_raw * 10000).toFixed(1);
  const dirColor =
    row.direction === 'long' ? 'text-emerald-600' : 'text-red-500';
  const outcomeCell =
    row.final_outcome ?? (row.resolved_at ? '?' : 'pending');

  return (
    <tr className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
      <td className="py-1.5 pr-3 text-slate-500">{omegaFmtTime(row.fired_at)}</td>
      <td className={`py-1.5 pr-3 font-medium uppercase ${dirColor}`}>
        {row.direction}
      </td>
      <td className="py-1.5 pr-3 text-slate-600 capitalize">{row.session}</td>
      <td className="py-1.5 pr-3 text-slate-600 capitalize">{row.regime}</td>
      <td className="py-1.5 pr-3 text-right text-slate-600">
        {(row.confidence * 100).toFixed(0)}%
      </td>
      <td
        className={`py-1.5 pr-3 text-right ${spreadClassName(row.spread_r)}`}
      >
        {(row.spread_r * 100).toFixed(0)}%
      </td>
      <td className="py-1.5 pr-3 text-right text-slate-600">{rPips}</td>
      <td className="py-1.5 pr-3 text-right text-slate-600">
        {row.mfe_r !== null ? `${omegaR2(row.mfe_r)}R` : '—'}
      </td>
      <td className="py-1.5 pr-3">
        {row.during_news_event ? (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
            {row.during_news_event}
          </span>
        ) : null}
      </td>
      <td
        className={`py-1.5 text-right ${outcomeClassName(row.final_outcome)}`}
      >
        {outcomeCell}
      </td>
    </tr>
  );
}
