import type { AmdState, RegimeState, ScalperDayState, ScalperTrade } from '@/lib/types';
import type { AsianDirectionLogEntry } from '@/lib/fetchAsianDirectionLog';
import type { AsianSessionDetection } from '@/lib/directionDecisionTypes';
import type { OmegaWindowStatus } from '@/lib/fetchOmegaWindowStatus';
import { resolveEffectiveAutoDirection } from '@/lib/effectiveAutoDirection';
import { REBUILD_BLOCKED_HOURS_UTC } from '@/lib/rebuildHourBlockedHoursUtc';
import type {
  AlignmentSummary,
  AsianCloseGate,
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
  resolveAsianCloseGate,
} from '@/lib/directionDecisionChecklist';
import { buildAsianVerdict } from '@/lib/asianSessionDisplay';
import {
  isForexWeekendClosed,
  resolveAsianSessionPhase,
  resolveDistributionSessionPhase,
  todayUtcDate,
  utcHourNow,
} from '@/lib/directionDecisionPhases';

function isScalperAgree(amdState: AmdState | null): boolean {
  const effectiveDirection = resolveEffectiveAutoDirection(amdState);
  if (!effectiveDirection) return false;
  if (effectiveDirection !== 'long' && effectiveDirection !== 'short') return false;
  const bias = amdState?.asian_close_bias_signal;
  if (bias === 'BULLISH' && effectiveDirection === 'long') return true;
  if (bias === 'BEARISH' && effectiveDirection === 'short') return true;
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
  const autoDir = resolveEffectiveAutoDirection(amdState);

  let scalperState: EngineGateState = 'blocked';
  let scalperDetail = 'Not initialized';
  if (isForexWeekendClosed()) {
    scalperState = 'blocked';
    scalperDetail = 'Weekend — market closed';
  } else if (pausedIds.includes('scalper')) {
    scalperState = 'paused';
    scalperDetail = 'Paused in bridge controls';
  } else if (!scalperDayState) {
    const hour = utcHourNow();
    if (hour < 10 || (hour === 10 && new Date().getUTCMinutes() < 32)) {
      scalperState = 'pending';
      scalperDetail = 'Init at 10:32 UTC';
    } else {
      scalperState = 'pending';
      scalperDetail = 'Init pending — check Railway logs';
    }
  } else if (scalperDayState.day_stopped && scalperDayState.stop_reason === 'no_agree') {
    scalperState = 'blocked';
    scalperDetail = 'BLOCKED (DISAGREE)';
  } else if (scalperDayState.day_stopped) {
    scalperState = 'done';
    scalperDetail = scalperDayState.stop_reason ?? 'Day stopped';
  } else if (scalperDayState.reference_price != null) {
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
  if (isForexWeekendClosed()) {
    amdStateGate = 'blocked';
    amdDetail = 'Weekend — market closed';
  } else if (!engineActiveMap.engine_amd) {
    amdStateGate = 'paused';
    amdDetail = 'engine_amd inactive';
  } else if (!amdState || !amdState.decision_auto_direction) {
    const hour = utcHourNow();
    amdStateGate = 'pending';
    amdDetail =
      hour < 10
        ? 'Detection at 10:31 UTC'
        : hour === 10 && new Date().getUTCMinutes() < 31
          ? 'Detection at 10:31 UTC'
          : 'Detection in progress';
  } else if (asianCloseGate === 'DISAGREE') {
    amdStateGate = 'blocked';
    amdDetail = 'BLOCKED (ASIAN_CLOSE_DISAGREE)';
  } else if (!autoDir || autoDir === 'neutral') {
    amdStateGate = 'blocked';
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
  } else {
    const validUntilMs = omegaWindow?.validUntil ? Date.parse(omegaWindow.validUntil) : null;
    const windowExpired =
      validUntilMs != null && Number.isFinite(validUntilMs) && Date.now() > validUntilMs;
    if (omegaWindow?.isActive && !windowExpired) {
      omegaState = 'active';
      const until = omegaWindow.validUntil
        ? new Date(omegaWindow.validUntil).toISOString().slice(11, 16)
        : '—';
      omegaDetail = `${omegaDir.toUpperCase()} · window until ${until} UTC`;
    } else if (windowExpired) {
      omegaState = 'done';
      omegaDetail = 'EXPIRED — window closed';
    } else {
      omegaDetail = `Set ${omegaDir.toUpperCase()} · no active window`;
    }
  }

  let rebuildState: EngineGateState = rebuildBlocked ? 'blocked' : 'active';
  let rebuildDetail = rebuildBlocked ? `Hour ${hourUtc} blocked` : 'Clean window';
  if (isForexWeekendClosed()) {
    rebuildState = 'blocked';
    rebuildDetail = 'Weekend — market closed';
  } else if (pausedIds.includes('engine_rebuild')) {
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
  if (isForexWeekendClosed()) {
    return {
      headline: 'WEEKEND — markets closed',
      subline: 'Next session Monday 00:00 UTC',
      tone: 'neutral',
    };
  }

  const auto = resolveEffectiveAutoDirection(amdState);
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
    alignment.kind === 'insufficient'
      ? 'Partial signal set — see alignment'
      : alignment.kind === 'unanimous'
        ? 'All core signals aligned'
        : 'Core gate passed with mixed alignment';
  return {
    headline: `ARMED — ${dirLabel}`,
    subline: alignLabel,
    tone: 'armed',
  };
}

export function buildDirectionDecisionSnapshot(input: {
  amdState: AmdState | null;
  regimeState: RegimeState | null;
  asianRows: AsianDirectionLogEntry[];
  asianDetectionRows: AsianSessionDetection[];
  scalperDayState: ScalperDayState | null;
  scalperTrades: ScalperTrade[];
  omegaWindow: OmegaWindowStatus | null;
  omegaDir: 'long' | 'short';
  pausedIds: string[];
  rebuildHourGateEnabled: boolean;
  engineActiveMap: Record<string, boolean>;
}): DirectionDecisionSnapshot {
  const distributionChecklist = buildDistributionChecklist(input.amdState, input.regimeState);
  const asianChecklist = buildAsianChecklist(input.asianDetectionRows, input.amdState);
  const alignment = computeAlignment(distributionChecklist);
  const asianCloseGate = resolveAsianCloseGate(input.amdState);

  return {
    tradeDate: todayUtcDate(),
    asianPhase: resolveAsianSessionPhase(),
    distributionPhase: resolveDistributionSessionPhase(),
    asianChecklist,
    distributionChecklist,
    alignment,
    asianVerdict: buildAsianVerdict(input.asianDetectionRows, input.amdState),
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
