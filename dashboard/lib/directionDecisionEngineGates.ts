import type { AmdState, RegimeState, ScalperDayState, ScalperTrade } from '@/lib/types';
import type { AsianDirectionLogEntry } from '@/lib/fetchAsianDirectionLog';
import type { OmegaWindowStatus } from '@/lib/fetchOmegaWindowStatus';
import { REBUILD_BLOCKED_HOURS_UTC } from '@/lib/rebuildHourBlockedHoursUtc';
import type {
  AlignmentSummary,
  AsianCloseGate,
  AsianSessionVerdict,
  DirectionDecisionSnapshot,
  DistributionVerdict,
  EngineGateRow,
  EngineGateState,
  ScalperTradeSummary,
} from '@/lib/directionDecisionTypes';
import {
  buildAsianChecklist,
  buildDistributionChecklist,
  buildGateExplanation,
  computeAlignment,
  findLastActionableAsianRow,
  resolveAsianCloseGate,
} from '@/lib/directionDecisionChecklist';
import {
  isForexWeekendClosed,
  resolveAsianSessionPhase,
  resolveDistributionSessionPhase,
  todayUtcDate,
  utcHourNow,
} from '@/lib/directionDecisionPhases';

function isScalperAgree(amdState: AmdState | null): boolean {
  if (!amdState?.auto_direction) return false;
  if (amdState.auto_direction !== 'long' && amdState.auto_direction !== 'short') return false;
  const bias = amdState.asian_close_bias_signal;
  if (bias === 'BULLISH' && amdState.auto_direction === 'long') return true;
  if (bias === 'BEARISH' && amdState.auto_direction === 'short') return true;
  if (bias === 'NEUTRAL') return true;
  return false;
}

function summarizeScalperTrades(trades: ScalperTrade[]): ScalperTradeSummary {
  let wins = 0;
  let losses = 0;
  let netPips = 0;
  for (const trade of trades) {
    if (trade.result === 'win') wins += 1;
    if (trade.result === 'loss') losses += 1;
    netPips += trade.pnl_pips ?? 0;
  }
  return { wins, losses, netPips: Math.round(netPips * 10) / 10 };
}

export function buildEngineGates(input: {
  amdState: AmdState | null;
  scalperDayState: ScalperDayState | null;
  omegaWindow: OmegaWindowStatus | null;
  omegaDir: 'long' | 'short';
  pausedIds: string[];
  rebuildHourGateEnabled: boolean;
  engineActiveMap: Record<string, boolean>;
  asianCloseGate: AsianCloseGate;
}): EngineGateRow[] {
  const {
    amdState,
    scalperDayState,
    omegaWindow,
    omegaDir,
    pausedIds,
    rebuildHourGateEnabled,
    engineActiveMap,
    asianCloseGate,
  } = input;
  const hourUtc = utcHourNow();
  const rebuildBlocked =
    rebuildHourGateEnabled && REBUILD_BLOCKED_HOURS_UTC.includes(hourUtc);
  const autoDir = amdState?.auto_direction ?? null;

  let scalperState: EngineGateState = 'blocked';
  let scalperDetail = 'Not initialized';
  if (pausedIds.includes('scalper')) {
    scalperState = 'paused';
    scalperDetail = 'Paused in bridge controls';
  } else if (scalperDayState?.day_stopped && scalperDayState.stop_reason === 'no_agree') {
    scalperState = 'blocked';
    scalperDetail = 'BLOCKED (DISAGREE)';
  } else if (scalperDayState?.day_stopped) {
    scalperState = 'done';
    scalperDetail = scalperDayState.stop_reason ?? 'Day stopped';
  } else if (scalperDayState?.reference_price != null) {
    scalperState = 'armed';
    scalperDetail = `ref ${scalperDayState.reference_price} · trigger ${scalperDayState.trigger_level ?? '—'}`;
  } else if (!isScalperAgree(amdState)) {
    scalperState = 'blocked';
    scalperDetail = 'BLOCKED (DISAGREE)';
  } else if (autoDir) {
    scalperState = 'armed';
    scalperDetail = 'Waiting for reference price (post 10:32 UTC)';
  }

  let amdStateGate: EngineGateState = 'blocked';
  let amdDetail = 'No AMD state';
  if (!engineActiveMap.engine_amd) {
    amdStateGate = 'paused';
    amdDetail = 'engine_amd inactive';
  } else if (asianCloseGate === 'DISAGREE') {
    amdDetail = 'BLOCKED (ASIAN_CLOSE_DISAGREE)';
  } else if (!autoDir || autoDir === 'neutral') {
    amdDetail = 'Auto direction neutral';
  } else if (resolveDistributionSessionPhase() === 'pending') {
    amdStateGate = 'active';
    amdDetail = 'Entry window opens 10:31 UTC';
  } else if (resolveDistributionSessionPhase() === 'active') {
    amdStateGate = 'armed';
    amdDetail = 'Entry window 10:31–16:00 UTC';
  } else {
    amdStateGate = 'done';
    amdDetail = 'Distribution window closed';
  }

  let omegaState: EngineGateState = 'blocked';
  let omegaDetail = 'No active window';
  if (pausedIds.includes('omega')) {
    omegaState = 'paused';
    omegaDetail = 'Paused';
  } else if (isForexWeekendClosed()) {
    omegaState = 'blocked';
    omegaDetail = 'Weekend — market closed';
  } else if (omegaWindow?.isActive) {
    omegaState = 'active';
    const until = omegaWindow.validUntil
      ? new Date(omegaWindow.validUntil).toISOString().slice(11, 16)
      : '—';
    omegaDetail = `${omegaDir.toUpperCase()} · window until ${until} UTC`;
  } else {
    omegaDetail = `Set ${omegaDir.toUpperCase()} · no active window`;
  }

  let rebuildState: EngineGateState = rebuildBlocked ? 'blocked' : 'active';
  let rebuildDetail = rebuildBlocked ? `Hour ${hourUtc} blocked` : 'Clean window';
  if (pausedIds.includes('engine_rebuild')) {
    rebuildState = 'paused';
    rebuildDetail = 'Paused';
  }

  return [
    { engineId: 'scalper', label: 'Scalper', state: scalperState, detail: scalperDetail },
    { engineId: 'engine_amd', label: 'AMD Dist', state: amdStateGate, detail: amdDetail },
    { engineId: 'omega', label: 'Omega', state: omegaState, detail: omegaDetail },
    { engineId: 'engine_rebuild', label: 'Rebuild', state: rebuildState, detail: rebuildDetail },
  ];
}

export function buildDistributionVerdict(
  gate: AsianCloseGate,
  amdState: AmdState | null,
  alignment: AlignmentSummary,
): DistributionVerdict {
  const auto = amdState?.auto_direction;
  if (resolveDistributionSessionPhase() === 'pending') {
    return {
      headline: 'PENDING — distribution opens 10:00 UTC',
      subline: 'Asian session intelligence feeds distribution gates',
      tone: 'pending',
    };
  }
  if (gate === 'DISAGREE') {
    return {
      headline: 'BLOCKED — NO TRADE',
      subline: 'Direction signals conflicted. Distribution engines sitting out.',
      tone: 'blocked',
    };
  }
  if (!auto || auto === 'neutral') {
    return {
      headline: 'NEUTRAL — direction not set',
      subline: 'Auto direction has not committed long or short',
      tone: 'neutral',
    };
  }
  const dirLabel = auto === 'long' ? 'LONG' : 'SHORT';
  const alignLabel =
    alignment.kind === 'unanimous'
      ? 'All core signals aligned'
      : 'Core gate passed with mixed alignment';
  return {
    headline: `ARMED — ${dirLabel}`,
    subline: alignLabel,
    tone: 'armed',
  };
}

export function buildAsianVerdict(
  asianRows: AsianDirectionLogEntry[],
  amdState: AmdState | null,
): AsianSessionVerdict {
  const actionable = findLastActionableAsianRow(asianRows);
  const amdTag = actionable?.amd_tag ?? amdState?.amd_tag ?? null;
  const phase = resolveAsianSessionPhase();

  if (amdTag !== 'AMD_SHIFTED') {
    return {
      headline: 'SKIPPED — not AMD_SHIFTED',
      subline: 'Asian direction set runs only on AMD_SHIFTED days at 21:00 UTC',
      tone: 'skipped',
    };
  }
  const direction = actionable?.direction_set ?? null;
  if (direction === 'long' || direction === 'short') {
    return {
      headline: `Direction: ${direction.toUpperCase()}`,
      subline: actionable?.reason ?? 'Prior D1 + AMD_SHIFTED overnight set',
      tone: phase === 'active' ? 'active' : 'complete',
    };
  }
  return {
    headline: 'AMD_SHIFTED — awaiting direction set',
    subline: 'Scheduled run at 21:00 UTC',
    tone: 'pending',
  };
}

export function buildDirectionDecisionSnapshot(input: {
  amdState: AmdState | null;
  regimeState: RegimeState | null;
  asianRows: AsianDirectionLogEntry[];
  scalperDayState: ScalperDayState | null;
  scalperTrades: ScalperTrade[];
  omegaWindow: OmegaWindowStatus | null;
  omegaDir: 'long' | 'short';
  pausedIds: string[];
  rebuildHourGateEnabled: boolean;
  engineActiveMap: Record<string, boolean>;
}): DirectionDecisionSnapshot {
  const distributionChecklist = buildDistributionChecklist(input.amdState, input.regimeState);
  const asianChecklist = buildAsianChecklist(input.asianRows, input.amdState);
  const alignment = computeAlignment(distributionChecklist);
  const asianCloseGate = resolveAsianCloseGate(input.amdState);

  return {
    tradeDate: todayUtcDate(),
    asianPhase: resolveAsianSessionPhase(),
    distributionPhase: resolveDistributionSessionPhase(),
    asianChecklist,
    distributionChecklist,
    alignment,
    asianVerdict: buildAsianVerdict(input.asianRows, input.amdState),
    distributionVerdict: buildDistributionVerdict(asianCloseGate, input.amdState, alignment),
    asianCloseGate,
    gateExplanation: buildGateExplanation(asianCloseGate, input.amdState),
    engineGates: buildEngineGates({
      amdState: input.amdState,
      scalperDayState: input.scalperDayState,
      omegaWindow: input.omegaWindow,
      omegaDir: input.omegaDir,
      pausedIds: input.pausedIds,
      rebuildHourGateEnabled: input.rebuildHourGateEnabled,
      engineActiveMap: input.engineActiveMap,
      asianCloseGate,
    }),
    scalperSummary: summarizeScalperTrades(input.scalperTrades),
  };
}
