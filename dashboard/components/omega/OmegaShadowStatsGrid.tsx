import type { OmegaDerivedStats } from '@/lib/omegaShadowAggregates';
import {
  SHADOW_GATE_R1,
  TRAINING_R1_RATE,
} from '@/lib/omegaShadowConstants';
import { omegaPct, omegaR2 } from '@/lib/omegaShadowFormat';
import { OmegaShadowStatCard } from '@/components/omega/OmegaShadowStatCard';

interface OmegaShadowStatsGridProps {
  derived: OmegaDerivedStats;
}

export function OmegaShadowStatsGrid({ derived }: OmegaShadowStatsGridProps) {
  const {
    total,
    pending,
    resolvedList,
    r1Rate,
    avgMfe,
    avgMae,
    simPnl,
  } = derived;
  const r1Color =
    r1Rate === null
      ? ''
      : r1Rate >= SHADOW_GATE_R1
        ? 'text-emerald-600'
        : 'text-red-500';
  const pnlColor = simPnl >= 0 ? 'text-emerald-600' : 'text-red-500';
  const resolvedCount = resolvedList.length;

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
        label="Live r1HitRate"
        value={r1Rate !== null ? omegaPct(r1Rate) : '—'}
        sub={`gate: ${omegaPct(SHADOW_GATE_R1)}`}
        color={r1Color}
      />
      <OmegaShadowStatCard
        label="Backtest r1"
        value={omegaPct(TRAINING_R1_RATE)}
        sub="validation baseline"
        color="text-slate-500"
      />
      <OmegaShadowStatCard
        label="Avg MFE"
        value={avgMfe !== null ? `${omegaR2(avgMfe)}R` : '—'}
        sub="favorable excursion"
      />
      <OmegaShadowStatCard
        label="Avg MAE"
        value={avgMae !== null ? `${omegaR2(avgMae)}R` : '—'}
        sub="adverse excursion"
      />
      <OmegaShadowStatCard
        label="Sim P&L ($10R)"
        value={`${simPnl >= 0 ? '+' : ''}$${simPnl}`}
        sub={`${resolvedCount} trades`}
        color={pnlColor}
      />
    </div>
  );
}
