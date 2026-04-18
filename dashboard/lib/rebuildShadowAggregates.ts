import type { RebuildShadowSignalRow } from '@/lib/types';
import {
  REBUILD_BLOCKED_HOURS_UTC,
  REBUILD_FILTERED_R_MIN_PIPS,
  REBUILD_FILTERED_R_MAX_PIPS,
  REBUILD_FILTERED_MIN_SIGNALS,
  REBUILD_GATE_FILTERED_TP,
  REBUILD_GATE_FILTERED_PNL_R,
  REBUILD_FILTERED_SESSION_TP_FLOOR,
  REBUILD_FILTERED_SESSION_MIN_N,
  REBUILD_MIN_RESOLVED_GATES,
  REBUILD_SESSION_ORDER,
} from '@/lib/rebuildShadowConstants';

/** Retired Phase 4 thresholds — still used for legacy gate fields on derived stats. */
const LEGACY_GATE_R1 = 0.6;
const LEGACY_GATE_TP = 0.6;
const LEGACY_GATE_BAR1 = 0.55;
const LEGACY_SESSION_TP_FLOOR = 0.45;
const LEGACY_SESSION_MIN_N = 20;

export interface RebuildSessionRow {
  session: string;
  n: number;
  tpRate: number | null;
  r1Rate: number | null;
  bar1Rate: number | null;
  avgPnlR: number | null;
}

export interface RebuildRBucketRow {
  bucket: string;
  n: number;
  tpRate: number | null;
  r1Rate: number | null;
  avgPips: number | null;
  avgPnlR: number | null;
}

export interface RebuildDailyPoint {
  day: string;
  tpRate: number | null;
  r1Rate: number | null;
  n: number;
}

export interface RebuildDerivedStats {
  total: number;
  resolved: RebuildShadowSignalRow[];
  pending: RebuildShadowSignalRow[];
  resolvedCount: number;
  tpRate: number | null;
  r1Rate: number | null;
  bar1Rate: number | null;
  avgPnlR: number | null;
  netPnlR: number;
  sessionRows: RebuildSessionRow[];
  rBucketRows: RebuildRBucketRow[];
  dailySeries: RebuildDailyPoint[];
  gateResolved: boolean;
  gateR1: boolean | null;
  gateTp: boolean | null;
  gateBar1: boolean | null;
  gateSessionTp: boolean | null;
  // Filtered stats (blocked hours + medium R + news removed)
  filteredSignals: RebuildShadowSignalRow[];
  filteredResolved: RebuildShadowSignalRow[];
  filteredResolvedCount: number;
  filteredTpRate: number | null;
  filteredAvgPnlR: number | null;
  filteredNetPnlR: number;
  filteredAvgMfeR: number | null;
  filteredSignalsPerDay: number | null;
  // Filtered gates
  gateFilteredSignals: boolean;
  gateFilteredTp: boolean | null;
  gateFilteredPnlR: boolean | null;
  gateFilteredSessionTp: boolean | null;
}

export function rebuildSignalTime(s: RebuildShadowSignalRow): string {
  return (s.signal_time ?? s.fired_at ?? s.created_at) as string;
}

export function rebuildRPips(s: RebuildShadowSignalRow): number | null {
  if (s.r_size_pips != null && Number.isFinite(s.r_size_pips)) return s.r_size_pips;
  if (s.r_size_raw != null && Number.isFinite(s.r_size_raw)) return s.r_size_raw * 10000;
  return null;
}

export function rebuildIsTpHit(s: RebuildShadowSignalRow): boolean {
  const outcome = (s.final_outcome ?? '').toLowerCase();
  if (['tp', 'tp1r', 'tp2r', 'tp3r'].includes(outcome)) return true;
  return s.tp_hit === true;
}

export function rebuildIsR1Hit(s: RebuildShadowSignalRow): boolean {
  return s.tp_1r_hit === true || s.r1_hit === true;
}

export function rebuildIsBar1(s: RebuildShadowSignalRow): boolean {
  return s.exit_within_bar1 === true;
}

export function isRebuildFilteredOut(s: RebuildShadowSignalRow): boolean {
  // Hour gate
  const t = s.signal_time ?? s.fired_at ?? s.created_at;
  if (t) {
    const hour = new Date(t).getUTCHours();
    if ((REBUILD_BLOCKED_HOURS_UTC as readonly number[]).includes(hour)) return true;
  }
  // R bucket gate — medium (7-10 pips) excluded
  const pips = rebuildRPips(s);
  if (
    pips !== null &&
    pips > REBUILD_FILTERED_R_MIN_PIPS &&
    pips <= REBUILD_FILTERED_R_MAX_PIPS
  ) return true;
  // News gate
  if (s.during_news_event != null && s.during_news_event !== '') return true;
  return false;
}

export function normalizeRebuildSession(raw: string | null): string {
  const x = (raw ?? '').toLowerCase().trim();
  if (x.includes('asian')) return 'Asian';
  if (x.includes('london')) return 'London';
  if (x.includes('overlap')) return 'overlap';
  if (x === 'ny' || x.includes('new york') || x === 'new_york') return 'NY';
  return '(other)';
}

function rate(num: number, den: number): number | null {
  return den > 0 ? num / den : null;
}

function rollupResolved(resolved: RebuildShadowSignalRow[]): {
  tpRate: number | null;
  r1Rate: number | null;
  bar1Rate: number | null;
  avgPnlR: number | null;
  netPnlR: number;
} {
  const n = resolved.length;
  if (n < 1) {
    return { tpRate: null, r1Rate: null, bar1Rate: null, avgPnlR: null, netPnlR: 0 };
  }
  let tp = 0;
  let r1 = 0;
  let bar1 = 0;
  let pnlSum = 0;
  let pnlN = 0;
  for (const s of resolved) {
    if (rebuildIsTpHit(s)) tp += 1;
    if (rebuildIsR1Hit(s)) r1 += 1;
    if (rebuildIsBar1(s)) bar1 += 1;
    if (s.pnl_r != null && Number.isFinite(s.pnl_r)) {
      pnlSum += s.pnl_r;
      pnlN += 1;
    }
  }
  return {
    tpRate: rate(tp, n),
    r1Rate: rate(r1, n),
    bar1Rate: rate(bar1, n),
    avgPnlR: pnlN > 0 ? pnlSum / pnlN : null,
    netPnlR: resolved.reduce((acc, s) => acc + (s.pnl_r != null && Number.isFinite(s.pnl_r) ? s.pnl_r : 0), 0),
  };
}

function buildSessionRows(signals: RebuildShadowSignalRow[]): RebuildSessionRow[] {
  return REBUILD_SESSION_ORDER.map((sessionLabel) => {
    const inSession = signals.filter((s) => normalizeRebuildSession(s.session) === sessionLabel);
    const resolved = inSession.filter((s) => s.resolved_at != null);
    const roll = rollupResolved(resolved);
    return {
      session: sessionLabel,
      n: inSession.length,
      tpRate: roll.tpRate,
      r1Rate: roll.r1Rate,
      bar1Rate: roll.bar1Rate,
      avgPnlR: roll.avgPnlR,
    };
  });
}

function rBucketLabel(pips: number): 'small' | 'medium' | 'large' | null {
  if (pips >= 4 && pips <= 7) return 'small';
  if (pips > 7 && pips <= 10) return 'medium';
  if (pips > 10) return 'large';
  return null;
}

function buildRBucketRows(signals: RebuildShadowSignalRow[]): RebuildRBucketRow[] {
  const labels: Array<{ key: string; label: string }> = [
    { key: 'small', label: 'small (4–7)' },
    { key: 'medium', label: 'medium (7–10)' },
    { key: 'large', label: 'large (>10)' },
  ];
  return labels.map(({ key, label }) => {
    const inBucket = signals.filter((s) => {
      const p = rebuildRPips(s);
      if (p == null) return false;
      return rBucketLabel(p) === key;
    });
    const resolved = inBucket.filter((s) => s.resolved_at != null);
    const roll = rollupResolved(resolved);
    const avgPips =
      inBucket.length > 0
        ? inBucket.reduce((acc, s) => acc + (rebuildRPips(s) ?? 0), 0) / inBucket.length
        : null;
    return {
      bucket: label,
      n: inBucket.length,
      tpRate: roll.tpRate,
      r1Rate: roll.r1Rate,
      avgPips,
      avgPnlR: roll.avgPnlR,
    };
  });
}

function sessionTpGate(signals: RebuildShadowSignalRow[]): boolean | null {
  const resolvedAll = signals.filter((s) => s.resolved_at != null);
  if (resolvedAll.length < 1) return null;
  for (const sessionLabel of REBUILD_SESSION_ORDER) {
    const resolved = resolvedAll.filter(
      (s) => normalizeRebuildSession(s.session) === sessionLabel
    );
    if (resolved.length <= LEGACY_SESSION_MIN_N) continue;
    const tp = resolved.filter((s) => rebuildIsTpHit(s)).length;
    const tpR = tp / resolved.length;
    if (tpR < LEGACY_SESSION_TP_FLOOR) return false;
  }
  return true;
}

function buildDailySeries(resolved: RebuildShadowSignalRow[]): RebuildDailyPoint[] {
  const byDay = new Map<string, RebuildShadowSignalRow[]>();
  for (const s of resolved) {
    if (!s.resolved_at) continue;
    const day = s.resolved_at.slice(0, 10);
    const list = byDay.get(day) ?? [];
    list.push(s);
    byDay.set(day, list);
  }
  const days = [...byDay.keys()].sort();
  return days.map((day) => {
    const list = byDay.get(day) ?? [];
    const roll = rollupResolved(list);
    return {
      day,
      tpRate: roll.tpRate,
      r1Rate: roll.r1Rate,
      n: list.length,
    };
  });
}

function avgMfeR(signals: RebuildShadowSignalRow[]): number | null {
  const withMfe = signals.filter((s) => {
    const v = (s as unknown as Record<string, unknown>).mfe_r;
    return typeof v === 'number' && Number.isFinite(v);
  });
  if (withMfe.length === 0) return null;
  return (
    withMfe.reduce(
      (acc, s) => acc + ((s as unknown as Record<string, unknown>).mfe_r as number),
      0
    ) / withMfe.length
  );
}

function filteredSessionTpGate(filtered: RebuildShadowSignalRow[]): boolean | null {
  const resolved = filtered.filter((s) => s.resolved_at != null);
  if (resolved.length < 1) return null;
  let hasEnoughSession = false;
  for (const sessionLabel of REBUILD_SESSION_ORDER) {
    const inSession = resolved.filter(
      (s) => normalizeRebuildSession(s.session) === sessionLabel
    );
    if (inSession.length <= REBUILD_FILTERED_SESSION_MIN_N) continue;
    hasEnoughSession = true;
    const tp = inSession.filter((s) => rebuildIsTpHit(s)).length;
    if (tp / inSession.length < REBUILD_FILTERED_SESSION_TP_FLOOR) return false;
  }
  return hasEnoughSession ? true : null;
}

function signalsPerDay(signals: RebuildShadowSignalRow[]): number | null {
  if (signals.length === 0) return null;
  const times = signals
    .map((s) => s.signal_time ?? s.fired_at ?? s.created_at)
    .filter(Boolean)
    .map((t) => new Date(t as string).toISOString().slice(0, 10));
  const uniqueDays = new Set(times).size;
  return uniqueDays > 0 ? signals.length / uniqueDays : null;
}

export function computeRebuildDerivedStats(signals: RebuildShadowSignalRow[]): RebuildDerivedStats {
  const resolved = signals.filter((s) => s.resolved_at != null);
  const pending = signals.filter((s) => s.resolved_at == null);
  const roll = rollupResolved(resolved);
  const nRes = resolved.length;
  const enough = nRes >= REBUILD_MIN_RESOLVED_GATES;
  const ratesReady = nRes >= 10;

  const filteredAll = signals.filter((s) => !isRebuildFilteredOut(s));
  const filteredRes = filteredAll.filter((s) => s.resolved_at != null);
  const filtRoll = rollupResolved(filteredRes);
  const filtN = filteredRes.length;
  const filtMfe = avgMfeR(filteredRes);
  const filtPerDay = signalsPerDay(filteredAll);

  return {
    total: signals.length,
    resolved,
    pending,
    resolvedCount: nRes,
    tpRate: roll.tpRate,
    r1Rate: roll.r1Rate,
    bar1Rate: roll.bar1Rate,
    avgPnlR: roll.avgPnlR,
    netPnlR: roll.netPnlR,
    sessionRows: buildSessionRows(signals),
    rBucketRows: buildRBucketRows(signals),
    dailySeries: buildDailySeries(resolved),
    gateResolved: nRes >= REBUILD_MIN_RESOLVED_GATES,
    gateR1: !ratesReady ? null : roll.r1Rate !== null && roll.r1Rate >= LEGACY_GATE_R1,
    gateTp: !ratesReady ? null : roll.tpRate !== null && roll.tpRate >= LEGACY_GATE_TP,
    gateBar1: !ratesReady ? null : roll.bar1Rate !== null && roll.bar1Rate >= LEGACY_GATE_BAR1,
    gateSessionTp: !enough ? null : sessionTpGate(signals),
    filteredSignals: filteredAll,
    filteredResolved: filteredRes,
    filteredResolvedCount: filtN,
    filteredTpRate: filtRoll.tpRate,
    filteredAvgPnlR: filtRoll.avgPnlR,
    filteredNetPnlR: filtRoll.netPnlR,
    filteredAvgMfeR: filtMfe,
    filteredSignalsPerDay: filtPerDay,
    gateFilteredSignals: filtN >= REBUILD_FILTERED_MIN_SIGNALS,
    gateFilteredTp:
      filtN < 10 ? null : filtRoll.tpRate !== null && filtRoll.tpRate >= REBUILD_GATE_FILTERED_TP,
    gateFilteredPnlR:
      filtN < 10
        ? null
        : filtRoll.avgPnlR !== null && filtRoll.avgPnlR >= REBUILD_GATE_FILTERED_PNL_R,
    gateFilteredSessionTp:
      filtN < REBUILD_FILTERED_SESSION_MIN_N ? null : filteredSessionTpGate(filteredAll),
  };
}
