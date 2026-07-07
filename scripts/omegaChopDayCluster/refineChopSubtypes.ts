/**
 * Refine chop clusters into subtypes (Jul6-like vs mass-SL vs flip-storm).
 */

import 'dotenv/config';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(SCRIPT_DIR, 'output');

type Subtype = 'asia_bleed' | 'mass_sl' | 'flip_storm' | 'dist_chop' | 'not_chop';

interface TradeRow {
  signalReceivedAt: string;
  closedAt: string;
  direction: string;
  pnlPips: number;
  pnlR: number | null;
  closeReason: string | null;
  durationMinutes: number;
  brokerId: string;
}

interface DayRow {
  tradeDate: string;
  netPips: number;
  winRate: number;
  slCount: number;
  asiaNet: number;
  asiaSl: number;
  asiaTrades: number;
  distNet: number;
  distTrades: number;
  flips: number;
  noProgress: number;
  blockedSeq: number;
  subtype: Subtype;
  jul6Like: boolean;
}

function hourUtc(iso: string): number {
  return new Date(iso).getUTCHours();
}

function isSlLike(t: TradeRow): boolean {
  return t.closeReason === 'trail_sl_hit' || (t.pnlR != null && t.pnlR <= -1.5);
}

function isAsia(iso: string): boolean {
  const h = hourUtc(iso);
  return h >= 0 && h <= 5;
}

function isDist(iso: string): boolean {
  const h = hourUtc(iso);
  return h >= 10 && h <= 16;
}

function isBefore10Utc(iso: string): boolean {
  return hourUtc(iso) < 10;
}

function countFlips(trades: TradeRow[]): number {
  let n = 0;
  for (let i = 1; i < trades.length; i++) {
    const prev = trades[i - 1]!;
    const cur = trades[i]!;
    const gap = (Date.parse(cur.signalReceivedAt) - Date.parse(prev.closedAt)) / 60000;
    if (prev.direction.toLowerCase() !== cur.direction.toLowerCase() && gap >= 0 && gap <= 120) n++;
  }
  return n;
}

function classifySubtype(
  net: number,
  sl: number,
  asiaNet: number,
  asiaSl: number,
  asiaTrades: number,
  distNet: number,
  distTrades: number,
  flips: number,
  noProgress: number,
  blockedSeq: number,
  earlySl: number,
): { subtype: Subtype; jul6Like: boolean } {
  const jul6Like =
    asiaSl >= 2 &&
    asiaNet <= -15 &&
    earlySl >= 2 &&
    net < 0;

  if (jul6Like) return { subtype: 'asia_bleed', jul6Like: true };
  if (flips >= 8 || blockedSeq >= 5) return { subtype: 'flip_storm', jul6Like: false };
  if (sl >= 6 && net <= -20) return { subtype: 'mass_sl', jul6Like: false };
  if (distTrades >= 3 && distNet <= -20 && net < 0) return { subtype: 'dist_chop', jul6Like: false };
  if (noProgress >= 8 && net < 0) return { subtype: 'mass_sl', jul6Like: false };
  return { subtype: 'not_chop', jul6Like: false };
}

async function main(): Promise<void> {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data, error } = await supabase
    .from('bridge_trade_log')
    .select(
      'signal_received_at, closed_at, direction, pnl_pips, pnl_r, close_reason, duration_minutes, broker_id, decision, status',
    )
    .eq('engine_id', 'omega')
    .eq('decision', 'EXECUTED')
    .eq('status', 'closed')
    .not('pnl_pips', 'is', null)
    .gte('created_at', '2026-04-14T00:00:00Z')
    .order('signal_received_at');

  if (error) throw new Error(error.message);

  const { data: blockedRaw } = await supabase
    .from('bridge_trade_log')
    .select('signal_received_at, created_at, block_reason, decision')
    .eq('engine_id', 'omega')
    .eq('decision', 'BLOCKED')
    .gte('created_at', '2026-04-14T00:00:00Z');

  const trades: TradeRow[] = (data ?? []).map((r) => ({
    signalReceivedAt: String(r.signal_received_at),
    closedAt: String(r.closed_at),
    direction: String(r.direction),
    pnlPips: Number(r.pnl_pips),
    pnlR: r.pnl_r != null ? Number(r.pnl_r) : null,
    closeReason: r.close_reason != null ? String(r.close_reason) : null,
    durationMinutes: Number(r.duration_minutes ?? 0),
    brokerId: String(r.broker_id),
  }));

  const blockedSeqByDate = new Map<string, number>();
  for (const r of blockedRaw ?? []) {
    const reason = String(r.block_reason ?? '');
    if (!reason.includes('OMEGA_TRADE_OPEN')) continue;
    const d = String(r.signal_received_at ?? r.created_at).slice(0, 10);
    blockedSeqByDate.set(d, (blockedSeqByDate.get(d) ?? 0) + 1);
  }

  const byDate = new Map<string, TradeRow[]>();
  for (const t of trades) {
    const d = t.signalReceivedAt.slice(0, 10);
    const bucket = byDate.get(d) ?? [];
    bucket.push(t);
    byDate.set(d, bucket);
  }

  const rows: DayRow[] = [];
  for (const [tradeDate, dayTrades] of [...byDate.entries()].sort()) {
    if (dayTrades.length < 2) continue;
    const wins = dayTrades.filter((t) => t.pnlPips > 0).length;
    const slTrades = dayTrades.filter(isSlLike);
    const asia = dayTrades.filter((t) => isAsia(t.signalReceivedAt));
    const dist = dayTrades.filter((t) => isDist(t.signalReceivedAt));
    const early = dayTrades.filter((t) => isBefore10Utc(t.signalReceivedAt));
    const earlySl = early.filter(isSlLike).length;
    const net = dayTrades.reduce((s, t) => s + t.pnlPips, 0);
    const asiaNet = asia.reduce((s, t) => s + t.pnlPips, 0);
    const asiaSl = asia.filter(isSlLike).length;
    const distNet = dist.reduce((s, t) => s + t.pnlPips, 0);
    const flips = countFlips(dayTrades);
    const noProgress = dayTrades.filter(
      (t) => isSlLike(t) || (t.pnlR != null && t.pnlR < 0.5 && t.durationMinutes >= 45),
    ).length;
    const blockedSeq = blockedSeqByDate.get(tradeDate) ?? 0;
    const { subtype, jul6Like } = classifySubtype(
      net,
      slTrades.length,
      asiaNet,
      asiaSl,
      asia.length,
      distNet,
      dist.length,
      flips,
      noProgress,
      blockedSeq,
      earlySl,
    );

    rows.push({
      tradeDate,
      netPips: Math.round(net * 10) / 10,
      winRate: Math.round((100 * wins) / dayTrades.length),
      slCount: slTrades.length,
      asiaNet: Math.round(asiaNet * 10) / 10,
      asiaSl,
      asiaTrades: asia.length,
      distNet: Math.round(distNet * 10) / 10,
      distTrades: dist.length,
      flips,
      noProgress,
      blockedSeq,
      subtype,
      jul6Like,
    });
  }

  const jul6LikeDays = rows.filter((r) => r.jul6Like);
  const bySubtype = (s: Subtype) => rows.filter((r) => r.subtype === s && r.netPips < 0);

  const regimePath = join(process.cwd(), 'scripts/output/regime_vs_amd_direction_backtest.csv');
  let regimeMap = new Map<string, string>();
  try {
    const csv = readFileSync(regimePath, 'utf8').split('\n').slice(1);
    for (const line of csv) {
      const [date, , , , , , , , , , , regimeChoppy] = line.split(',');
      if (date) regimeMap.set(date, regimeChoppy ?? '');
    }
  } catch {
    /* optional */
  }

  const lines = [
    'OMEGA CHOP SUBTYPE REFINEMENT (dual-broker combined)',
    `Generated: ${new Date().toISOString()}`,
    '',
    '=== JUL6-LIKE (asia SL>=2, asia net<=-15, early SL>=2, net<0) ===',
    ...jul6LikeDays.map(fmtRow),
    '',
    '=== ASIA BLEED subtype (all negative net) ===',
    ...bySubtype('asia_bleed').map(fmtRow),
    '',
    '=== FLIP STORM (flips>=8 or blockedSeq>=5, net<0) ===',
    ...bySubtype('flip_storm').map(fmtRow),
    '',
    '=== MASS SL (sl>=6 & net<=-20 OR noProg>=8 & net<0) ===',
    ...bySubtype('mass_sl').map(fmtRow),
    '',
    '=== DIST CHOP (dist net<=-20, net<0) ===',
    ...bySubtype('dist_chop').map(fmtRow),
    '',
    '=== CONTINUATION CONTRAST (Jul3 pattern: asia net>10, asia sl=0) ===',
    ...rows
      .filter((r) => r.asiaNet >= 10 && r.asiaSl === 0 && r.netPips > 0)
      .map(fmtRow),
    '',
    '=== PROPOSED CHOP DAY RULE (backtest-derived) ===',
    proposeRule(jul6LikeDays, rows),
  ];

  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, 'chop_subtype_refinement.txt');
  writeFileSync(outPath, lines.join('\n'));
  console.log(lines.join('\n'));
}

function fmtRow(r: DayRow): string {
  return [
    r.tradeDate,
    r.subtype,
    r.jul6Like ? 'JUL6-LIKE' : '',
    `net=${r.netPips}p`,
    `WR=${r.winRate}%`,
    `SL=${r.slCount}`,
    `asia=${r.asiaNet}p/${r.asiaTrades}t sl=${r.asiaSl}`,
    `dist=${r.distNet}p/${r.distTrades}t`,
    `flips=${r.flips}`,
    `noProg=${r.noProgress}`,
    `blkSeq=${r.blockedSeq}`,
  ]
    .filter(Boolean)
    .join(' | ');
}

function proposeRule(jul6Like: DayRow[], all: DayRow[]): string {
  const chopDays = all.filter(
    (r) =>
      r.jul6Like ||
      r.subtype === 'flip_storm' ||
      r.subtype === 'mass_sl' ||
      r.subtype === 'dist_chop' ||
      (r.subtype === 'asia_bleed' && r.netPips < 0),
  );
  const negativeChop = chopDays.filter((r) => r.netPips < 0);
  const avg = (arr: DayRow[], fn: (r: DayRow) => number) =>
    arr.length ? (arr.reduce((s, r) => s + fn(r), 0) / arr.length).toFixed(1) : 'n/a';

  return [
    `Chop-day union (subtypes): n=${chopDays.length}, negative net: n=${negativeChop.length}, avg net=${avg(negativeChop, (r) => r.netPips)}p`,
    `Jul6-like only: n=${jul6Like.length} dates=${jul6Like.map((r) => r.tradeDate).join(', ')}`,
    '',
    'SESSION CHOP (live-detectable, no M5):',
    '  A) asia_bleed: 00-05 UTC, >=2 executed, >=2 SL-like OR asia session net <= -15p before 10:00',
    '  B) flip_storm: >=3 opposite-direction entries within 90m of prior close, same session',
    '  C) no_progress: last 2 executed both exit SL-like OR <+0.5R after 45m',
    '  D) blocked_pressure: >=2 BLOCKED opposite (OMEGA_TRADE_OPEN) while open trade MFE < 3p',
    '',
    'CHOP DAY = any 2 session-chop flags OR (asia_bleed before 10:00 + net day still negative at 16:00)',
    '',
    'ANTI-PATTERN (NOT chop despite high SL): high WR + positive net (Apr24, May13) — SL here = trail rotation not regime failure',
    'Jul3 contrast: asia net>10, asia sl=0, stacked same-direction — continuation not chop',
  ].join('\n');
}

main().catch(console.error);
