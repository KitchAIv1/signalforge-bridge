import type { RebuildDerivedStats } from '@/lib/rebuildShadowAggregates';
import { omegaPct, omegaR2 } from '@/lib/omegaShadowFormat';
import { OmegaShadowStatCard } from '@/components/omega/OmegaShadowStatCard';

interface RebuildShadowStatsBarProps {
  derived: RebuildDerivedStats;
}

export function RebuildShadowStatsBar({ derived }: RebuildShadowStatsBarProps) {
  const {
    total,
    pending,
    resolvedCount,
    tpRate,
    avgPnlR,
    netPnlR,
    filteredResolvedCount,
    filteredTpRate,
    filteredAvgPnlR,
    filteredNetPnlR,
    filteredAvgMfeR,
    filteredSignalsPerDay,
  } = derived;

  return (
    <div className="space-y-3">
      {/* All signals row */}
      <div>
        <div className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-2">
          All signals
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <OmegaShadowStatCard
            label="Total signals"
            value={total.toString()}
            sub={`${pending.length} pending`}
          />
          <OmegaShadowStatCard
            label="Resolved"
            value={resolvedCount.toString()}
            sub={`of ${total}`}
          />
          <OmegaShadowStatCard
            label="TP rate"
            value={tpRate !== null ? omegaPct(tpRate) : '—'}
            sub="unfiltered"
          />
          <OmegaShadowStatCard
            label="Avg P&L R"
            value={avgPnlR !== null ? `${omegaR2(avgPnlR)}R` : '—'}
            sub="per signal"
          />
          <OmegaShadowStatCard
            label="Net R total"
            value={`${netPnlR >= 0 ? '+' : ''}${omegaR2(netPnlR)}R`}
            sub={`${resolvedCount} resolved`}
            color={netPnlR >= 0 ? 'text-emerald-600' : 'text-red-500'}
          />
        </div>
      </div>

      {/* Filtered row */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <div className="text-xs text-slate-400 font-medium uppercase tracking-wide">
            Filtered
          </div>
          <div
            className="text-xs text-slate-400 border border-slate-200 rounded px-1.5 py-0.5"
            title="Excludes: hours 7,9,14,15,19 UTC | R size 7–10 pips | news events"
          >
            ⛔ hrs 7,9,14,15,19 · R 7–10 pip · news
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <OmegaShadowStatCard
            label="Filtered resolved"
            value={filteredResolvedCount.toString()}
            sub="150 target"
          />
          <OmegaShadowStatCard
            label="Signals / day"
            value={filteredSignalsPerDay !== null
              ? filteredSignalsPerDay.toFixed(1)
              : '—'}
            sub="filtered only"
          />
          <OmegaShadowStatCard
            label="Filtered TP rate"
            value={filteredTpRate !== null ? omegaPct(filteredTpRate) : '—'}
            sub="gate ≥ 35%"
            color={
              filteredTpRate === null ? undefined :
              filteredTpRate >= 0.35 ? 'text-emerald-600' : 'text-red-500'
            }
          />
          <OmegaShadowStatCard
            label="Filtered avg P&L R"
            value={filteredAvgPnlR !== null ? `${omegaR2(filteredAvgPnlR)}R` : '—'}
            sub="gate ≥ 0.20R"
            color={
              filteredAvgPnlR === null ? undefined :
              filteredAvgPnlR >= 0.20 ? 'text-emerald-600' : 'text-red-500'
            }
          />
          <OmegaShadowStatCard
            label="Filtered avg MFE"
            value={filteredAvgMfeR !== null ? `${omegaR2(filteredAvgMfeR)}R` : '—'}
            sub={filteredNetPnlR >= 0
              ? `+${omegaR2(filteredNetPnlR)}R net`
              : `${omegaR2(filteredNetPnlR)}R net`}
            color={filteredNetPnlR >= 0 ? 'text-emerald-600' : 'text-red-500'}
          />
        </div>
      </div>
    </div>
  );
}
