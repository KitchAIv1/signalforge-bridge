import type { OmegaShadowSignalRow } from '@/lib/types';
import { SHADOW_GATE_R1, MIN_RESOLVED_FOR_GATE } from '@/lib/omegaShadowConstants';

export type SessionAgg = { n: number; resolved: number; tp1r: number; sl: number };

export interface OmegaDerivedStats {
  total: number;
  resolvedList: OmegaShadowSignalRow[];
  pending: OmegaShadowSignalRow[];
  tp1r: number;
  tp2r: number;
  tp3r: number;
  slHit: number;
  r1Rate: number | null;
  r2Rate: number | null;
  avgMfe: number | null;
  avgMae: number | null;
  slRate: number | null;
  simPnl: number;
  sessionMap: Record<string, SessionAgg>;
  regimeMap: Record<string, SessionAgg>;
  spreadTight: number;
  spreadMed: number;
  spreadWide: number;
  outcomeMap: Record<string, number>;
  gateEnoughSignals: boolean;
  gateR1: boolean | null;
  gateSL: boolean | null;
  gateMfe: boolean | null;
  gateSessionOk: boolean;
  gateRegimeOk: boolean;
}

function foldSimPnl(sum: number, s: OmegaShadowSignalRow): number {
  const o = s.final_outcome;
  if (o === 'tp3r') return sum + 30;
  if (o === 'tp2r') return sum + 20;
  if (o === 'tp1r') return sum + 10;
  if (o === 'sl') return sum - 10;
  return sum;
}

function bumpAggMap(
  map: Record<string, SessionAgg>,
  label: string,
  s: OmegaShadowSignalRow
): void {
  if (!map[label]) map[label] = { n: 0, resolved: 0, tp1r: 0, sl: 0 };
  map[label].n += 1;
  if (!s.resolved_at) return;
  map[label].resolved += 1;
  if (s.tp_1r_hit) map[label].tp1r += 1;
  if (s.sl_hit) map[label].sl += 1;
}

function buildPairMaps(signals: OmegaShadowSignalRow[]): {
  sessionMap: Record<string, SessionAgg>;
  regimeMap: Record<string, SessionAgg>;
} {
  const sessionMap: Record<string, SessionAgg> = {};
  const regimeMap: Record<string, SessionAgg> = {};
  signals.forEach((s) => bumpAggMap(sessionMap, s.session || 'unknown', s));
  signals.forEach((s) => bumpAggMap(regimeMap, s.regime || 'unknown', s));
  return { sessionMap, regimeMap };
}

function buildOutcomeMap(resolvedList: OmegaShadowSignalRow[]): Record<string, number> {
  const outcomeMap: Record<string, number> = {};
  resolvedList.forEach((s) => {
    const o = s.final_outcome ?? 'unknown';
    outcomeMap[o] = (outcomeMap[o] ?? 0) + 1;
  });
  return outcomeMap;
}

function segmentGateOk(map: Record<string, SessionAgg>): boolean {
  return Object.values(map).every(
    (d) => d.resolved < 20 || d.tp1r / d.resolved >= 0.45
  );
}

function countSpreadBuckets(signals: OmegaShadowSignalRow[]) {
  return {
    spreadTight: signals.filter((s) => s.spread_r < 0.2).length,
    spreadMed: signals.filter((s) => s.spread_r >= 0.2 && s.spread_r < 0.35).length,
    spreadWide: signals.filter((s) => s.spread_r >= 0.35).length,
  };
}

interface ResolvedRollup {
  nRes: number;
  tp1r: number;
  tp2r: number;
  tp3r: number;
  slHit: number;
  r1Rate: number | null;
  r2Rate: number | null;
  avgMfe: number | null;
  avgMae: number | null;
  slRate: number | null;
}

function rollupResolved(resolvedList: OmegaShadowSignalRow[]): ResolvedRollup {
  const nRes = resolvedList.length;
  const tp1r = resolvedList.filter((s) => s.tp_1r_hit === true).length;
  const tp2r = resolvedList.filter((s) => s.tp_2r_hit === true).length;
  const tp3r = resolvedList.filter((s) => s.tp_3r_hit === true).length;
  const slHit = resolvedList.filter((s) => s.sl_hit === true).length;
  const r1Rate = nRes > 0 ? tp1r / nRes : null;
  const r2Rate = nRes > 0 ? tp2r / nRes : null;
  const avgMfe =
    nRes > 0
      ? resolvedList.reduce((acc, r) => acc + (r.mfe_r ?? 0), 0) / nRes
      : null;
  const avgMae =
    nRes > 0
      ? resolvedList.reduce((acc, r) => acc + (r.mae_r ?? 0), 0) / nRes
      : null;
  const slRate = nRes > 0 ? slHit / nRes : null;
  return { nRes, tp1r, tp2r, tp3r, slHit, r1Rate, r2Rate, avgMfe, avgMae, slRate };
}

export function computeOmegaDerivedStats(signals: OmegaShadowSignalRow[]): OmegaDerivedStats {
  const resolvedList = signals.filter((s) => s.resolved_at !== null);
  const pending = signals.filter((s) => s.resolved_at === null);
  const roll = rollupResolved(resolvedList);
  const { sessionMap, regimeMap } = buildPairMaps(signals);
  const { spreadTight, spreadMed, spreadWide } = countSpreadBuckets(signals);

  return {
    total: signals.length,
    resolvedList,
    pending,
    tp1r: roll.tp1r,
    tp2r: roll.tp2r,
    tp3r: roll.tp3r,
    slHit: roll.slHit,
    r1Rate: roll.r1Rate,
    r2Rate: roll.r2Rate,
    avgMfe: roll.avgMfe,
    avgMae: roll.avgMae,
    slRate: roll.slRate,
    simPnl: resolvedList.reduce(foldSimPnl, 0),
    sessionMap,
    regimeMap,
    spreadTight,
    spreadMed,
    spreadWide,
    outcomeMap: buildOutcomeMap(resolvedList),
    gateEnoughSignals: roll.nRes >= MIN_RESOLVED_FOR_GATE,
    gateR1: roll.r1Rate !== null ? roll.r1Rate >= SHADOW_GATE_R1 : null,
    gateSL: roll.slRate !== null ? roll.slRate < 0.45 : null,
    gateMfe: roll.avgMfe !== null ? roll.avgMfe > 1.0 : null,
    gateSessionOk: segmentGateOk(sessionMap),
    gateRegimeOk: segmentGateOk(regimeMap),
  };
}
