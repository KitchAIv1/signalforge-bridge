import type { OmegaDerivedStats } from '@/lib/omegaShadowAggregates';
import { MIN_RESOLVED_FOR_GATE } from '@/lib/omegaShadowConstants';
import { omegaPct, omegaR2 } from '@/lib/omegaShadowFormat';
import { OmegaShadowGateRow } from '@/components/omega/OmegaShadowGateRow';

interface OmegaShadowGateTrackerProps {
  derived: OmegaDerivedStats;
}

export function OmegaShadowGateTracker({
  derived,
}: OmegaShadowGateTrackerProps) {
  const {
    resolvedList,
    r1Rate,
    slRate,
    avgMfe,
    gateEnoughSignals,
    gateR1,
    gateSL,
    gateMfe,
    gateSessionOk,
    gateRegimeOk,
  } = derived;
  const resolvedCount = resolvedList.length;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
        Phase 3 → Phase 4 gate
      </div>
      <div className="text-xs text-slate-400 mb-3">
        All must pass before live execution is considered
      </div>

      <div className="mb-4">
        <div className="flex justify-between text-xs text-slate-500 mb-1">
          <span>{resolvedCount} resolved signals</span>
          <span>{MIN_RESOLVED_FOR_GATE} minimum required</span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-slate-800 transition-all"
            style={{
              width: `${Math.min(100, (resolvedCount / MIN_RESOLVED_FOR_GATE) * 100)}%`,
            }}
          />
        </div>
      </div>

      <OmegaShadowGateRow
        label="Minimum resolved signals"
        current={resolvedCount.toString()}
        threshold={`≥ ${MIN_RESOLVED_FOR_GATE}`}
        met={gateEnoughSignals}
      />
      <OmegaShadowGateRow
        label="r1HitRate ≥ 55%"
        current={r1Rate !== null ? omegaPct(r1Rate) : 'pending'}
        threshold="55%"
        met={gateR1}
        pending={!gateEnoughSignals}
      />
      <OmegaShadowGateRow
        label="SL hit rate < 45%"
        current={slRate !== null ? omegaPct(slRate) : 'pending'}
        threshold="< 45%"
        met={gateSL}
        pending={!gateEnoughSignals}
      />
      <OmegaShadowGateRow
        label="Avg MFE > 1.0R"
        current={avgMfe !== null ? `${omegaR2(avgMfe)}R` : 'pending'}
        threshold="> 1.0R"
        met={gateMfe}
        pending={!gateEnoughSignals}
      />
      <OmegaShadowGateRow
        label="No session below 45% (n>20)"
        current={gateSessionOk ? 'passing' : 'failing'}
        threshold="≥ 45% all sessions"
        met={gateSessionOk}
        pending={!gateEnoughSignals}
      />
      <OmegaShadowGateRow
        label="No regime below 45% (n>20)"
        current={gateRegimeOk ? 'passing' : 'failing'}
        threshold="≥ 45% all regimes"
        met={gateRegimeOk}
        pending={!gateEnoughSignals}
      />
    </div>
  );
}
