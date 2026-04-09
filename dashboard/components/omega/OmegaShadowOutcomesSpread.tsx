import type { OmegaDerivedStats } from '@/lib/omegaShadowAggregates';

interface OmegaShadowOutcomesSpreadProps {
  derived: OmegaDerivedStats;
}

export function OmegaShadowOutcomesSpread({
  derived,
}: OmegaShadowOutcomesSpreadProps) {
  const { outcomeMap, resolvedList, spreadTight, spreadMed, spreadWide, total } =
    derived;
  const resolvedCount = resolvedList.length;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
          Outcome distribution
        </div>
        <div className="space-y-2">
          {[
            { key: 'tp3r', label: 'Hit 3R', color: 'bg-emerald-500' },
            { key: 'tp2r', label: 'Hit 2R', color: 'bg-emerald-400' },
            { key: 'tp1r', label: 'Hit 1R', color: 'bg-emerald-300' },
            { key: 'sl', label: 'Stop loss', color: 'bg-red-400' },
            { key: 'expired', label: 'Expired', color: 'bg-slate-300' },
          ].map(({ key, label, color }) => {
            const count = outcomeMap[key] ?? 0;
            const pctW =
              resolvedCount > 0 ? (count / resolvedCount) * 100 : 0;
            return (
              <div key={key} className="flex items-center gap-2">
                <span className="text-xs text-slate-500 w-16">{label}</span>
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${color}`}
                    style={{ width: pctW + '%' }}
                  />
                </div>
                <span className="text-xs text-slate-600 w-8 text-right">
                  {count}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
          Signal quality — spread/R ratio
        </div>
        <div className="space-y-2">
          {[
            { label: 'Tight (<20% spread)', count: spreadTight, color: 'bg-emerald-500' },
            { label: 'Medium (20–35%)', count: spreadMed, color: 'bg-amber-400' },
            { label: 'Wide (>35% spread)', count: spreadWide, color: 'bg-red-400' },
          ].map(({ label, count, color }) => {
            const pctW = total > 0 ? (count / total) * 100 : 0;
            return (
              <div key={label} className="flex items-center gap-2">
                <span className="text-xs text-slate-500 w-36">{label}</span>
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${color}`}
                    style={{ width: pctW + '%' }}
                  />
                </div>
                <span className="text-xs text-slate-600 w-8 text-right">
                  {count}
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-400">
          Wide spread signals consume &gt;35% of R in spread cost
        </div>
      </div>
    </div>
  );
}
