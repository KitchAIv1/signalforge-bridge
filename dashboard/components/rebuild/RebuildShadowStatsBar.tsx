import type { RebuildDerivedStats } from '@/lib/rebuildShadowAggregates';
import { omegaPct, omegaR2 } from '@/lib/omegaShadowFormat';
import { OmegaShadowStatCard } from '@/components/omega/OmegaShadowStatCard';
import {
  REBUILD_GATE_BAR1,
  REBUILD_GATE_R1,
  REBUILD_GATE_TP,
} from '@/lib/rebuildShadowConstants';

interface RebuildShadowStatsBarProps {
  derived: RebuildDerivedStats;
}

export function RebuildShadowStatsBar({ derived }: RebuildShadowStatsBarProps) {
  const {
    total,
    pending,
    resolvedCount,
    tpRate,
    r1Rate,
    bar1Rate,
    avgPnlR,
    netPnlR,
  } = derived;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
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
        label="Overall TP rate"
        value={tpRate !== null ? omegaPct(tpRate) : '—'}
        sub={`gate ${omegaPct(REBUILD_GATE_TP)}`}
      />
      <OmegaShadowStatCard
        label="R1 hit rate"
        value={r1Rate !== null ? omegaPct(r1Rate) : '—'}
        sub={`gate ${omegaPct(REBUILD_GATE_R1)}`}
      />
      <OmegaShadowStatCard
        label="Bar-1 hit rate"
        value={bar1Rate !== null ? omegaPct(bar1Rate) : '—'}
        sub={`gate ${omegaPct(REBUILD_GATE_BAR1)}`}
      />
      <OmegaShadowStatCard
        label="Avg P&L R"
        value={avgPnlR !== null ? `${omegaR2(avgPnlR)}R` : '—'}
        sub="resolved w/ pnl_r"
      />
      <OmegaShadowStatCard
        label="Net R total"
        value={`${netPnlR >= 0 ? '+' : ''}${omegaR2(netPnlR)}R`}
        sub={`${resolvedCount} resolved`}
        color={netPnlR >= 0 ? 'text-emerald-600' : 'text-red-500'}
      />
    </div>
  );
}
