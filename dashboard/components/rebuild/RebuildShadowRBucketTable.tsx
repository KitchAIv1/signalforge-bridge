import type { RebuildRBucketRow } from '@/lib/rebuildShadowAggregates';
import { omegaPct, omegaR2 } from '@/lib/omegaShadowFormat';

interface RebuildShadowRBucketTableProps {
  rows: RebuildRBucketRow[];
}

export function RebuildShadowRBucketTable({ rows }: RebuildShadowRBucketTableProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
        R bucket breakdown
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-400 border-b border-slate-100">
              <th className="text-left pb-2 pr-3">R bucket</th>
              <th className="text-right pb-2 pr-3">n</th>
              <th className="text-right pb-2 pr-3">TP rate</th>
              <th className="text-right pb-2 pr-3">R1 rate</th>
              <th className="text-right pb-2 pr-3">Avg pips</th>
              <th className="text-right pb-2">Avg P&L R</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.bucket} className="border-b border-slate-50 text-slate-700">
                <td className="py-2 pr-3">{r.bucket}</td>
                <td className="text-right py-2 pr-3">{r.n}</td>
                <td className="text-right py-2 pr-3">
                  {r.tpRate !== null ? omegaPct(r.tpRate) : '—'}
                </td>
                <td className="text-right py-2 pr-3">
                  {r.r1Rate !== null ? omegaPct(r.r1Rate) : '—'}
                </td>
                <td className="text-right py-2 pr-3">
                  {r.avgPips !== null ? omegaR2(r.avgPips) : '—'}
                </td>
                <td className="text-right py-2">
                  {r.avgPnlR !== null ? `${omegaR2(r.avgPnlR)}R` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
