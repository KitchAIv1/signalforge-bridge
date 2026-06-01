import type { AmdState, RegimeState } from '@/lib/types';
import type { AsianDirectionLogEntry } from '@/lib/fetchAsianDirectionLog';
import { layer4Label } from '@/lib/regimePanelFormatters';
import type {
  AlignmentSummary,
  AsianCloseGate,
  ChecklistRow,
  ChecklistStatus,
  DirectionSide,
} from '@/lib/directionDecisionTypes';
import { asianCloseFilterStatus } from '@/lib/asianCloseBiasHelpers';
import {
  findTodayAsianRows,
  findTodayDirectionSetRow,
  findTodaySkipRow,
  resolveTodayAmdTag,
  resolveTodayAsianContextRow,
} from '@/lib/asianSessionDisplay';

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
  if (!amdState?.auto_direction) return '—';
  const conf = amdState.auto_direction_confidence
    ? ` (${amdState.auto_direction_confidence} confidence)`
    : '';
  return `${amdState.auto_direction.toUpperCase()}${conf}`;
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
  const autoDir = amdState?.auto_direction ?? null;
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

export function buildAsianChecklist(
  asianRows: AsianDirectionLogEntry[],
  amdState: AmdState | null,
): ChecklistRow[] {
  const todayRows = findTodayAsianRows(asianRows);
  const contextRow = resolveTodayAsianContextRow(todayRows, amdState);
  const directionRow = findTodayDirectionSetRow(todayRows);
  const skipRow = findTodaySkipRow(todayRows);
  const amdTag = resolveTodayAmdTag(todayRows, amdState);
  const isShifted = amdTag === 'AMD_SHIFTED';
  const priorD1 = contextRow?.prior_d1_direction ?? '—';
  const priorDir: DirectionSide | null =
    priorD1 === 'BULLISH' ? 'long' : priorD1 === 'BEARISH' ? 'short' : null;

  const omegaValue = directionRow
    ? `Direction set (${directionRow.action})`
    : skipRow
      ? skipRow.action.replace('SKIPPED_', 'Skipped — ')
      : todayRows.some((row) => row.action === 'ASIAN_CLOSE')
        ? 'Asian close logged — pending 21:00 UTC'
        : 'Session window';

  return [
    {
      id: 'prior_d1',
      label: 'Prior D1',
      value: priorD1 === '—' ? '—' : `${priorD1} → ${priorDir === 'long' ? 'LONG' : 'SHORT'}`,
      impliedDirection: priorDir,
      status: priorDir ? 'pass' : 'pending',
    },
    {
      id: 'amd_tag',
      label: 'AMD Tag',
      value: amdTag ?? '—',
      impliedDirection: isShifted ? priorDir : null,
      status: isShifted ? 'pass' : 'fail',
    },
    {
      id: 'asian_scalper',
      label: 'Asian Scalper',
      value: 'NOT DEPLOYED',
      impliedDirection: null,
      status: 'neutral',
    },
    {
      id: 'omega_asian',
      label: 'Omega',
      value: omegaValue,
      impliedDirection: null,
      status: skipRow ? 'fail' : directionRow ? 'pass' : 'pending',
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

  if (longLabels.length > 0 && shortLabels.length > 0) {
    return { kind: 'split', longLabels, shortLabels, neutralLabels };
  }
  if (longLabels.length === 0 && shortLabels.length === 0) {
    return { kind: 'neutral', longLabels, shortLabels, neutralLabels };
  }
  return { kind: 'unanimous', longLabels, shortLabels, neutralLabels };
}

export function resolveAsianCloseGate(amdState: AmdState | null): AsianCloseGate {
  const filter = asianCloseFilterStatus(
    amdState?.asian_close_bias_signal,
    amdState?.auto_direction,
  );
  if (filter?.label === 'AGREE') return 'AGREE';
  if (filter?.label === 'DISAGREE') return 'DISAGREE';
  if (amdState?.asian_close_bias_signal === 'NEUTRAL') return 'NEUTRAL';
  if (!amdState?.asian_close_bias_signal || !amdState.auto_direction) return 'UNKNOWN';
  return 'NEUTRAL';
}

export function buildGateExplanation(gate: AsianCloseGate, amdState: AmdState | null): string {
  const bias = amdState?.asian_close_bias_signal ?? '—';
  const auto = amdState?.auto_direction?.toUpperCase() ?? '—';
  if (gate === 'AGREE') return `Asian Close ${bias} = Auto Direction ${auto} → AGREE`;
  if (gate === 'DISAGREE') return `Asian Close ${bias} ≠ Auto Direction ${auto} → DISAGREE`;
  if (gate === 'NEUTRAL') return `Asian Close NEUTRAL → fall through to Auto Direction ${auto}`;
  return 'Gate pending — AMD evaluation not complete';
}
