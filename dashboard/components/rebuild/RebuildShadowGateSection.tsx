import type { RebuildDerivedStats } from '@/lib/rebuildShadowAggregates';
import { REBUILD_MIN_RESOLVED_GATES, REBUILD_SESSION_TP_FLOOR } from '@/lib/rebuildShadowConstants';
import { omegaPct } from '@/lib/omegaShadowFormat';
import { OmegaShadowGateRow } from '@/components/omega/OmegaShadowGateRow';

interface RebuildShadowGateSectionProps {
  derived: RebuildDerivedStats;
}

export function RebuildShadowGateSection({ derived }: RebuildShadowGateSectionProps) {
  const {
    resolvedCount,
    r1Rate,
    tpRate,
    bar1Rate,
    gateResolved,
    gateR1,
    gateTp,
    gateBar1,
    gateSessionTp,
  } = derived;
  const ratesReady = resolvedCount >= 10;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
        Phase 4 gate tracker
      </div>
      <div className="text-xs text-slate-400 mb-3">Gates (all must pass)</div>

      <div className="mb-4">
        <div className="flex justify-between text-xs text-slate-500 mb-1">
          <span>
            {resolvedCount}/{REBUILD_MIN_RESOLVED_GATES} resolved
          </span>
          <span>minimum</span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-slate-800 transition-all"
            style={{
              width: `${Math.min(100, (resolvedCount / REBUILD_MIN_RESOLVED_GATES) * 100)}%`,
            }}
          />
        </div>
      </div>

      <OmegaShadowGateRow
        label="Resolved signals ≥ 100"
        current={`${resolvedCount} / ${REBUILD_MIN_RESOLVED_GATES}`}
        threshold="100"
        met={gateResolved}
      />
      <OmegaShadowGateRow
        label="R1 hit rate ≥ 60%"
        current={r1Rate !== null ? omegaPct(r1Rate) : '—'}
        threshold="60%"
        met={gateR1}
        pending={!ratesReady}
      />
      <OmegaShadowGateRow
        label="TP rate ≥ 60%"
        current={tpRate !== null ? omegaPct(tpRate) : '—'}
        threshold="60%"
        met={gateTp}
        pending={!ratesReady}
      />
      <OmegaShadowGateRow
        label="Bar-1 hit rate ≥ 55%"
        current={bar1Rate !== null ? omegaPct(bar1Rate) : '—'}
        threshold="55%"
        met={gateBar1}
        pending={!ratesReady}
      />
      <OmegaShadowGateRow
        label={`No session n>20 with TP < ${omegaPct(REBUILD_SESSION_TP_FLOOR)}`}
        current={gateSessionTp == null ? 'insufficient' : gateSessionTp ? 'passing' : 'failing'}
        threshold="all segments"
        met={gateSessionTp}
        pending={!gateResolved}
      />
    </div>
  );
}
