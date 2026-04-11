import type { RebuildShadowSignalRow } from '@/lib/types';
import {
  REBUILD_GATE_BAR1,
  REBUILD_GATE_R1,
  REBUILD_GATE_TP,
  REBUILD_MIN_RESOLVED_GATES,
  REBUILD_SESSION_MIN_N,
  REBUILD_SESSION_ORDER,
  REBUILD_SESSION_TP_FLOOR,
} from '@/lib/rebuildShadowConstants';

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
    if (resolved.length <= REBUILD_SESSION_MIN_N) continue;
    const tp = resolved.filter((s) => rebuildIsTpHit(s)).length;
    const tpR = tp / resolved.length;
    if (tpR < REBUILD_SESSION_TP_FLOOR) return false;
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

export function computeRebuildDerivedStats(signals: RebuildShadowSignalRow[]): RebuildDerivedStats {
  const resolved = signals.filter((s) => s.resolved_at != null);
  const pending = signals.filter((s) => s.resolved_at == null);
  const roll = rollupResolved(resolved);
  const nRes = resolved.length;
  const enough = nRes >= REBUILD_MIN_RESOLVED_GATES;
  const ratesReady = nRes >= 10;

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
    gateR1: !ratesReady ? null : roll.r1Rate !== null && roll.r1Rate >= REBUILD_GATE_R1,
    gateTp: !ratesReady ? null : roll.tpRate !== null && roll.tpRate >= REBUILD_GATE_TP,
    gateBar1: !ratesReady ? null : roll.bar1Rate !== null && roll.bar1Rate >= REBUILD_GATE_BAR1,
    gateSessionTp: !enough ? null : sessionTpGate(signals),
  };
}
