import type { RebuildDerivedStats } from '@/lib/rebuildShadowAggregates';
import {
  REBUILD_FILTERED_MIN_SIGNALS,
  REBUILD_GATE_FILTERED_TP,
  REBUILD_GATE_FILTERED_PNL_R,
  REBUILD_FILTERED_SESSION_TP_FLOOR,
  REBUILD_FILTERED_SESSION_MIN_N,
} from '@/lib/rebuildShadowConstants';
import { omegaPct, omegaR2 } from '@/lib/omegaShadowFormat';
import { OmegaShadowGateRow } from '@/components/omega/OmegaShadowGateRow';

interface RebuildShadowGateSectionProps {
  derived: RebuildDerivedStats;
}

export function RebuildShadowGateSection({ derived }: RebuildShadowGateSectionProps) {
  const {
    filteredResolvedCount,
    filteredTpRate,
    filteredAvgPnlR,
    gateFilteredSignals,
    gateFilteredTp,
    gateFilteredPnlR,
    gateFilteredSessionTp,
  } = derived;

  const ready = filteredResolvedCount >= 10;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
        Phase 4 gate tracker — filtered signals
      </div>
      <div className="text-xs text-slate-400 mb-3">
        All gates evaluated on filtered signals only
        (hours 7,9,14,15,19 UTC blocked · R 7–10 pip blocked · news blocked)
      </div>

      {/* Progress bar toward 150 filtered signals */}
      <div className="mb-4">
        <div className="flex justify-between text-xs text-slate-500 mb-1">
          <span>{filteredResolvedCount} / {REBUILD_FILTERED_MIN_SIGNALS} filtered resolved</span>
          <span>OOS validation target</span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-slate-800 transition-all"
            style={{
              width: `${Math.min(100,
                (filteredResolvedCount / REBUILD_FILTERED_MIN_SIGNALS) * 100
              )}%`,
            }}
          />
        </div>
      </div>

      <OmegaShadowGateRow
        label={`Filtered resolved signals ≥ ${REBUILD_FILTERED_MIN_SIGNALS}`}
        current={`${filteredResolvedCount} / ${REBUILD_FILTERED_MIN_SIGNALS}`}
        threshold={String(REBUILD_FILTERED_MIN_SIGNALS)}
        met={gateFilteredSignals}
      />
      <OmegaShadowGateRow
        label={`Filtered TP rate ≥ ${omegaPct(REBUILD_GATE_FILTERED_TP)}`}
        current={filteredTpRate !== null ? omegaPct(filteredTpRate) : '—'}
        threshold={omegaPct(REBUILD_GATE_FILTERED_TP)}
        met={gateFilteredTp}
        pending={!ready}
      />
      <OmegaShadowGateRow
        label={`Filtered avg P&L R ≥ ${omegaR2(REBUILD_GATE_FILTERED_PNL_R)}R`}
        current={filteredAvgPnlR !== null ? `${omegaR2(filteredAvgPnlR)}R` : '—'}
        threshold={`${omegaR2(REBUILD_GATE_FILTERED_PNL_R)}R`}
        met={gateFilteredPnlR}
        pending={!ready}
      />
      <OmegaShadowGateRow
        label={`No filtered session n≥${REBUILD_FILTERED_SESSION_MIN_N} below ${omegaPct(REBUILD_FILTERED_SESSION_TP_FLOOR)} TP`}
        current={
          gateFilteredSessionTp == null
            ? `insufficient n (need session n≥${REBUILD_FILTERED_SESSION_MIN_N})`
            : gateFilteredSessionTp
            ? 'all sessions passing'
            : 'session below floor'
        }
        threshold="all sessions"
        met={gateFilteredSessionTp}
        pending={gateFilteredSessionTp === null}
      />
      <OmegaShadowGateRow
        label="Out-of-sample week validated (manual)"
        current="pending — requires week 2 data"
        threshold="manual confirm"
        met={null}
        pending={true}
      />
    </div>
  );
}
