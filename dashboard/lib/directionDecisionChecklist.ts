import type { AmdState, RegimeState } from '@/lib/types';
import { resolveEffectiveAutoDirection } from '@/lib/effectiveAutoDirection';
import { layer4Label } from '@/lib/regimePanelFormatters';
import type {
  AlignmentSummary,
  AsianCloseGate,
  AsianSessionDetection,
  ChecklistRow,
  ChecklistStatus,
  DirectionSide,
} from '@/lib/directionDecisionTypes';
import { asianCloseFilterStatus } from '@/lib/asianCloseBiasHelpers';
import {
  allCronsFiredToday,
  directionFromDetection,
  findTodayActiveDetection,
  findTodayChecks,
  latestTodayCheck,
  nextPendingCron,
} from '@/lib/asianDetectionDisplayHelpers';
import { getPriorAmdContext, getPriorAmdSizeMultiplier } from '@/lib/priorAmdConfidence';
import {
  formatD1Direction,
  formatD1MomentumSignal,
} from '@/lib/d1ContextHelpers';
import type { D1ContextConfig } from '@/lib/directionDecisionTypes';

function judasImpliedDirection(judas: string | null | undefined): DirectionSide | null {
  if (judas === 'UP') return 'short';
  if (judas === 'DOWN') return 'long';
  if (judas === 'FLAT') return 'neutral';
  return null;
}

function asianCloseImpliedDirection(signal: string | null | undefined): DirectionSide | null {
  if (signal === 'BULLISH') return 'long';
  if (signal === 'BEARISH') return 'short';
  if (signal === 'NEUTRAL') return 'neutral';
  return null;
}

function d1ImpliedDirection(amdState: AmdState | null, regime: RegimeState | null): DirectionSide | null {
  const layer4 = amdState?.layer4_d1_bias ?? regime?.layer4_result ?? null;
  if (layer4 === 'TRENDING_UP') return 'long';
  if (layer4 === 'TRENDING_DOWN') return 'short';
  return 'neutral';
}

function formatD1Value(amdState: AmdState | null, regime: RegimeState | null): string {
  const result = amdState?.layer4_d1_bias ?? regime?.layer4_result ?? null;
  const bullish = amdState?.layer4_bullish_count ?? regime?.layer4_bullish_count ?? 0;
  const bearish = amdState?.layer4_bearish_count ?? regime?.layer4_bearish_count ?? 0;
  if (!result) return '—';
  const l4 = layer4Label(result, bullish, bearish);
  const arrow = result === 'TRENDING_UP' ? '→ LONG' : result === 'TRENDING_DOWN' ? '→ SHORT' : '→ NEUTRAL';
  return `${l4.label.toUpperCase()} (${l4.detail}) ${arrow}`;
}

function formatJudasValue(amdState: AmdState | null): string {
  if (!amdState?.judas_direction) return '—';
  const pips = amdState.judas_pips != null ? ` (${amdState.judas_pips} pips)` : '';
  const implied =
    amdState.judas_direction === 'UP'
      ? '→ implied SHORT'
      : amdState.judas_direction === 'DOWN'
        ? '→ implied LONG'
        : '→ FLAT';
  return `${amdState.judas_direction}${pips} ${implied}`;
}

function formatAsianCloseValue(amdState: AmdState | null): string {
  if (!amdState?.asian_close_bias_signal) return '—';
  const pct =
    amdState.asian_close_position_pct != null
      ? ` (${amdState.asian_close_position_pct.toFixed(1)}%)`
      : '';
  const implied =
    amdState.asian_close_bias_signal === 'BULLISH'
      ? '→ LONG'
      : amdState.asian_close_bias_signal === 'BEARISH'
        ? '→ SHORT'
        : '→ NEUTRAL';
  return `${amdState.asian_close_bias_signal}${pct} ${implied}`;
}

function formatAutoDirectionValue(amdState: AmdState | null): string {
  const effectiveDirection = resolveEffectiveAutoDirection(amdState);
  if (!effectiveDirection) return '—';
  const conf = amdState?.auto_direction_confidence
    ? ` (${amdState.auto_direction_confidence} confidence)`
    : '';
  return `${effectiveDirection.toUpperCase()}${conf}`;
}

function formatRegimeValue(regime: RegimeState | null): string {
  if (!regime) return '—';
  if (regime.regime_direction === 'PAUSE') {
    return `PAUSE (${regime.regime_confidence})`;
  }
  return `${regime.regime_confidence} ${regime.regime_direction}`;
}

function checklistStatusForDirection(
  implied: DirectionSide | null,
  autoDirection: string | null | undefined,
): ChecklistStatus {
  if (!implied || implied === 'neutral') return 'neutral';
  if (!autoDirection || autoDirection === 'neutral') return 'warn';
  return implied === autoDirection ? 'pass' : 'warn';
}

export function buildDistributionChecklist(
  amdState: AmdState | null,
  regime: RegimeState | null,
): ChecklistRow[] {
  const autoDir = resolveEffectiveAutoDirection(amdState);
  const d1Dir = d1ImpliedDirection(amdState, regime);
  const judasDir = judasImpliedDirection(amdState?.judas_direction);
  const asianDir = asianCloseImpliedDirection(amdState?.asian_close_bias_signal);
  const autoSide: DirectionSide | null =
    autoDir === 'long' || autoDir === 'short' ? autoDir : autoDir === 'neutral' ? 'neutral' : null;
  const regimeDir: DirectionSide | null =
    regime?.regime_direction === 'LONG'
      ? 'long'
      : regime?.regime_direction === 'SHORT'
        ? 'short'
        : regime?.regime_direction === 'PAUSE'
          ? 'neutral'
          : null;

  return [
    {
      id: 'd1',
      label: 'D1 Bias',
      value: formatD1Value(amdState, regime),
      impliedDirection: d1Dir,
      status: checklistStatusForDirection(d1Dir, autoDir),
    },
    {
      id: 'judas',
      label: 'Judas Swing',
      value: formatJudasValue(amdState),
      impliedDirection: judasDir,
      status: checklistStatusForDirection(judasDir, autoDir),
    },
    {
      id: 'asian_close',
      label: 'Asian Close',
      value: formatAsianCloseValue(amdState),
      impliedDirection: asianDir,
      status: checklistStatusForDirection(asianDir, autoDir),
    },
    {
      id: 'auto',
      label: 'Auto Direction',
      value: formatAutoDirectionValue(amdState),
      impliedDirection: autoSide,
      status: autoSide ? 'pass' : 'pending',
    },
    {
      id: 'regime',
      label: 'Regime',
      value: formatRegimeValue(regime),
      impliedDirection: regimeDir,
      status: regimeDir === 'neutral' ? 'neutral' : 'pass',
    },
  ];
}

function formatPriorBiasValue(contextRow: AsianSessionDetection | null): string {
  if (!contextRow) return '—';
  const priorContext = getPriorAmdContext(contextRow.prior_amd_tag ?? null);
  if (priorContext.bias === 'NEUTRAL' || priorContext.sampleSize < 3) {
    return 'Neutral (no prior edge)';
  }
  return `${priorContext.bias} ${priorContext.pct}% (n=${priorContext.sampleSize})`;
}

function priorBiasImpliedDirection(contextRow: AsianSessionDetection | null): DirectionSide | null {
  if (!contextRow) return null;
  const priorContext = getPriorAmdContext(contextRow.prior_amd_tag ?? null);
  if (priorContext.bias === 'LONG') return 'long';
  if (priorContext.bias === 'SHORT') return 'short';
  return null;
}

function priorBiasChecklistStatus(contextRow: AsianSessionDetection | null): ChecklistStatus {
  if (!contextRow) return 'neutral';
  const priorContext = getPriorAmdContext(contextRow.prior_amd_tag ?? null);
  if (priorContext.bias === 'NEUTRAL' || priorContext.sampleSize < 3) return 'neutral';
  const detectionDirection = directionFromDetection(contextRow);
  if (priorContext.bias === 'LONG' && detectionDirection === 'short') return 'warn';
  if (priorContext.bias === 'SHORT' && detectionDirection === 'long') return 'warn';
  return 'pass';
}

function buildDetectionStatusRow(
  todayRows: AsianSessionDetection[],
  active: AsianSessionDetection | null,
): ChecklistRow {
  const impliedDirection = directionFromDetection(active);

  if (active) {
    const condLabel = active.condition_fired ?? '?';
    return {
      id: 'asian-detection',
      label: 'Pattern Detection',
      value: `${condLabel} @ ${active.condition_check_time}`,
      impliedDirection,
      status: 'pass',
    };
  }

  if (todayRows.some((row) => row.action === 'SKIPPED_MANUAL_MODE')) {
    return {
      id: 'asian-detection',
      label: 'Pattern Detection',
      value: 'Manual mode — skipped',
      impliedDirection: null,
      status: 'neutral',
    };
  }

  if (allCronsFiredToday(todayRows)) {
    return {
      id: 'asian-detection',
      label: 'Pattern Detection',
      value: 'No pattern detected',
      impliedDirection: null,
      status: 'fail',
    };
  }

  if (todayRows.length > 0) {
    const firedTimes = todayRows.map((row) => row.condition_check_time);
    const nextCron = nextPendingCron(firedTimes);
    return {
      id: 'asian-detection',
      label: 'Pattern Detection',
      value: nextCron ? `Pending (next: ${nextCron})` : 'Awaiting final checks',
      impliedDirection: null,
      status: 'neutral',
    };
  }

  return {
    id: 'asian-detection',
    label: 'Pattern Detection',
    value: 'Awaiting first check (01:00 UTC)',
    impliedDirection: null,
    status: 'neutral',
  };
}

export function buildAsianChecklist(
  detectionRows: AsianSessionDetection[],
  _amdState: AmdState | null,
  d1Config: D1ContextConfig = {
    d1_prior_direction: null,
    d1_prior_net_pips: null,
    d1_prior_body_pct: null,
    d1_prior_close_pos_pct: null,
    d1_momentum_signal: null,
  },
): ChecklistRow[] {
  const todayRows = findTodayChecks(detectionRows);
  const active = findTodayActiveDetection(detectionRows);
  const contextRow = active ?? latestTodayCheck(todayRows);
  const impliedDirection = directionFromDetection(active);

  return [
    buildDetectionStatusRow(todayRows, active),
    {
      id: 'asian-direction',
      label: 'Direction Set',
      value: impliedDirection ? impliedDirection.toUpperCase() : '—',
      impliedDirection,
      status: impliedDirection ? 'pass' : 'neutral',
    },
    {
      id: 'asian-prior-tag',
      label: 'Prior AMD Tag',
      value: contextRow ? (contextRow.prior_amd_tag ?? 'Unknown') : '—',
      impliedDirection: null,
      status: 'neutral',
    },
    {
      id: 'asian-prior-confidence',
      label: 'Prior Bias',
      value: formatPriorBiasValue(contextRow),
      impliedDirection: priorBiasImpliedDirection(contextRow),
      status: priorBiasChecklistStatus(contextRow),
    },
    {
      id: 'asian-size-multiplier',
      label: 'Size Multiplier',
      value: contextRow
        ? getPriorAmdSizeMultiplier(contextRow.prior_amd_shifted, contextRow.size_multiplier)
        : '—',
      impliedDirection: null,
      status: 'neutral',
    },
    {
      id: 'asian-confidence',
      label: 'Signal Confidence',
      value: (() => {
        if (!contextRow?.confidence_tier) return '—';
        switch (contextRow.confidence_tier) {
          case 'HIGH':
            return 'HIGH — all layers agree';
          case 'MEDIUM':
            return 'MEDIUM — pattern only';
          case 'LOW':
            return 'LOW — prior conflicts';
          default:
            return '—';
        }
      })(),
      impliedDirection: null,
      status: (() => {
        if (!contextRow?.confidence_tier) return 'neutral' as ChecklistStatus;
        switch (contextRow.confidence_tier) {
          case 'HIGH':
            return 'pass';
          case 'MEDIUM':
            return 'neutral';
          case 'LOW':
            return 'warn';
          default:
            return 'neutral';
        }
      })(),
    },
    {
      id: 'd1-prior-direction',
      label: 'D1 Prior Day',
      value: d1Config.d1_prior_direction
        ? formatD1Direction(d1Config.d1_prior_direction, d1Config.d1_prior_net_pips)
        : '—',
      impliedDirection: (() => {
        const direction = d1Config.d1_prior_direction;
        if (direction === 'long') return 'long';
        if (direction === 'short') return 'short';
        return null;
      })(),
      status: 'neutral',
    },
    {
      id: 'd1-momentum',
      label: 'D1 Momentum',
      value: formatD1MomentumSignal(d1Config.d1_momentum_signal).label,
      impliedDirection: null,
      status: formatD1MomentumSignal(d1Config.d1_momentum_signal).status,
    },
    {
      id: 'd1-body',
      label: 'D1 Body',
      value: (() => {
        const bodyPct = d1Config.d1_prior_body_pct;
        const closePos = d1Config.d1_prior_close_pos_pct;
        if (!bodyPct) return '—';
        return `${bodyPct}% body · ${closePos ?? '—'}% close pos`;
      })(),
      impliedDirection: null,
      status: 'neutral',
    },
  ];
}

export function computeAlignment(checklist: ChecklistRow[]): AlignmentSummary {
  const longLabels: string[] = [];
  const shortLabels: string[] = [];
  const neutralLabels: string[] = [];

  for (const row of checklist) {
    if (row.impliedDirection === 'long') longLabels.push(row.label);
    else if (row.impliedDirection === 'short') shortLabels.push(row.label);
    else if (row.impliedDirection === 'neutral') neutralLabels.push(row.label);
  }

  const directionalCount = longLabels.length + shortLabels.length;
  if (directionalCount < 3) {
    return {
      kind: 'insufficient',
      longLabels,
      shortLabels,
      neutralLabels,
    };
  }

  if (longLabels.length > 0 && shortLabels.length > 0) {
    return { kind: 'split', longLabels, shortLabels, neutralLabels };
  }
  if (longLabels.length === 0 && shortLabels.length === 0) {
    return { kind: 'neutral', longLabels, shortLabels, neutralLabels };
  }
  return { kind: 'unanimous', longLabels, shortLabels, neutralLabels };
}

export function resolveAsianCloseGate(amdState: AmdState | null): AsianCloseGate {
  const effectiveDirection = resolveEffectiveAutoDirection(amdState);
  const filter = asianCloseFilterStatus(amdState?.asian_close_bias_signal, effectiveDirection);
  if (filter?.label === 'AGREE') return 'AGREE';
  if (filter?.label === 'DISAGREE') return 'DISAGREE';
  if (amdState?.asian_close_bias_signal === 'NEUTRAL') return 'NEUTRAL';
  if (!amdState?.asian_close_bias_signal || !effectiveDirection) return 'UNKNOWN';
  return 'NEUTRAL';
}

export function buildGateExplanation(gate: AsianCloseGate, amdState: AmdState | null): string {
  const bias = amdState?.asian_close_bias_signal ?? '—';
  const auto = resolveEffectiveAutoDirection(amdState)?.toUpperCase() ?? '—';
  if (gate === 'AGREE') return `Asian Close ${bias} = Auto Direction ${auto} → AGREE`;
  if (gate === 'DISAGREE') return `Asian Close ${bias} ≠ Auto Direction ${auto} → DISAGREE`;
  if (gate === 'NEUTRAL') return `Asian Close NEUTRAL → fall through to Auto Direction ${auto}`;
  return 'Gate pending — AMD evaluation not complete';
}
