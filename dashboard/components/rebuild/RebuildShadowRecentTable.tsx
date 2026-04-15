import type { RebuildShadowSignalRow } from '@/lib/types';
import {
  rebuildIsBar1,
  rebuildRPips,
  rebuildSignalTime,
} from '@/lib/rebuildShadowAggregates';
import { omegaFmtTime, omegaR2 } from '@/lib/omegaShadowFormat';
import { rebuildOutcomeTextClass } from '@/components/rebuild/rebuildOutcomeStyle';

interface RebuildShadowRecentTableProps {
  signals: RebuildShadowSignalRow[];
}

function tpPrice(s: RebuildShadowSignalRow): number | null {
  const v = s.take_profit ?? s.tp_price;
  return v != null && Number.isFinite(Number(v)) ? Number(v) : null;
}

function slPrice(s: RebuildShadowSignalRow): number | null {
  const v = s.stop_loss ?? s.sl_price;
  return v != null && Number.isFinite(Number(v)) ? Number(v) : null;
}

export function RebuildShadowRecentTable({ signals }: RebuildShadowRecentTableProps) {
  const rows = signals.slice(0, 50);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
        Recent signals (last 50)
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-400 border-b border-slate-100">
              <th className="text-left pb-2 pr-2">Time</th>
              <th className="text-left pb-2 pr-2">Session</th>
              <th className="text-left pb-2 pr-2">Dir</th>
              <th className="text-right pb-2 pr-2">Entry</th>
              <th className="text-right pb-2 pr-2">TP</th>
              <th className="text-right pb-2 pr-2">SL</th>
              <th className="text-right pb-2 pr-2">R pips</th>
              <th className="text-right pb-2 pr-2">Distance</th>
              <th className="text-left pb-2 pr-2">Outcome</th>
              <th className="text-right pb-2 pr-2">Exit bar</th>
              <th className="text-left pb-2 pr-2">News</th>
              <th className="text-right pb-2">P&L R</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const bar1 = rebuildIsBar1(s);
              const oc = s.final_outcome ?? (s.resolved_at ? '—' : null);
              return (
                <tr key={s.id} className="border-b border-slate-50 text-slate-700">
                  <td className="py-1.5 pr-2 whitespace-nowrap">{omegaFmtTime(rebuildSignalTime(s))}</td>
                  <td className="py-1.5 pr-2">{s.session ?? '—'}</td>
                  <td className="py-1.5 pr-2 uppercase">{s.direction}</td>
                  <td className="text-right py-1.5 pr-2">{omegaR2(s.entry_price)}</td>
                  <td className="text-right py-1.5 pr-2">
                    {tpPrice(s) != null ? omegaR2(tpPrice(s)!) : '—'}
                  </td>
                  <td className="text-right py-1.5 pr-2">
                    {slPrice(s) != null ? omegaR2(slPrice(s)!) : '—'}
                  </td>
                  <td className="text-right py-1.5 pr-2">
                    {rebuildRPips(s) != null ? omegaR2(rebuildRPips(s)!) : '—'}
                  </td>
                  <td className="text-right py-1.5 pr-2">
                    {s.pattern_distance != null ? omegaR2(Number(s.pattern_distance)) : '—'}
                  </td>
                  <td className="py-1.5 pr-2">
                    <span className={rebuildOutcomeTextClass(typeof oc === 'string' ? oc : null)}>
                      {oc ?? '—'}
                    </span>
                    {bar1 && (
                      <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-800">
                        Bar 1 {'\u26A1'}
                      </span>
                    )}
                  </td>
                  <td className="text-right py-1.5 pr-2">
                    {s.exit_bar != null ? String(s.exit_bar) : '—'}
                  </td>
                  <td className="py-1.5 pr-2">
                    {s.during_news_event ? (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                        {s.during_news_event}
                      </span>
                    ) : null}
                  </td>
                  <td className="text-right py-1.5">
                    {s.pnl_r != null ? `${omegaR2(s.pnl_r)}R` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
