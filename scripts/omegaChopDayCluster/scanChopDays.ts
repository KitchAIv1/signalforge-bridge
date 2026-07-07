/**
 * Cluster live OMEGA days by chop-like metrics vs Jul 6 / Jul 3 templates.
 * Run: npx tsx scripts/omegaChopDayCluster/scanChopDays.ts
 */

import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(SCRIPT_DIR, 'output');

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

interface BlockRow {
  signalReceivedAt: string;
  direction: string;
  blockReason: string | null;
}

interface DayMetrics {
  tradeDate: string;
  executedCount: number;
  netPips: number;
  winRate: number;
  slHitCount: number;
  slHitPips: number;
  maxHoldCount: number;
  asiaNetPips: number;
  asiaTradeCount: number;
  asiaSlCount: number;
  distNetPips: number;
  distTradeCount: number;
  oppositeFlipCount: number;
  avgDurationMin: number;
  noProgressCount: number;
  blockedTotal: number;
  blockedOppositeWhileOpenProxy: number;
  chopScore: number;
  profile: string;
}

function hourUtc(iso: string): number {
  return new Date(iso).getUTCHours();
}

function isSlLike(row: TradeRow): boolean {
  return row.closeReason === 'trail_sl_hit' || (row.pnlR != null && row.pnlR <= -1.5);
}

function isAsiaHour(iso: string): boolean {
  const h = hourUtc(iso);
  return h >= 0 && h <= 5;
}

function isDistHour(iso: string): boolean {
  const h = hourUtc(iso);
  return h >= 10 && h <= 16;
}

function dedupeBySignalTime(trades: TradeRow[]): TradeRow[] {
  const seen = new Set<string>();
  const out: TradeRow[] = [];
  for (const t of trades.sort((a, b) => a.signalReceivedAt.localeCompare(b.signalReceivedAt))) {
    const key = `${t.signalReceivedAt.slice(0, 16)}|${t.direction.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function countOppositeFlips(trades: TradeRow[]): number {
  let flips = 0;
  for (let i = 1; i < trades.length; i++) {
    const prev = trades[i - 1]!;
    const cur = trades[i]!;
    const gapMin = (Date.parse(cur.signalReceivedAt) - Date.parse(prev.closedAt)) / 60000;
    if (prev.direction.toLowerCase() !== cur.direction.toLowerCase() && gapMin >= 0 && gapMin <= 120) {
      flips += 1;
    }
  }
  return flips;
}

function countNoProgress(trades: TradeRow[]): number {
  return trades.filter((t) => isSlLike(t) || (t.pnlR != null && t.pnlR < 0.5 && t.durationMinutes >= 45)).length;
}

function buildDayMetrics(
  tradeDate: string,
  trades: TradeRow[],
  blocked: BlockRow[],
): DayMetrics {
  const wins = trades.filter((t) => t.pnlPips > 0).length;
  const slTrades = trades.filter(isSlLike);
  const asia = trades.filter((t) => isAsiaHour(t.signalReceivedAt));
  const dist = trades.filter((t) => isDistHour(t.signalReceivedAt));
  const asiaSl = asia.filter(isSlLike);

  let chopScore = 0;
  if (slTrades.length >= 2) chopScore += 2;
  if (slTrades.length >= 1 && trades.reduce((s, t) => s + t.pnlPips, 0) < -10) chopScore += 2;
  if (asia.length >= 2 && asiaSl.length >= 1 && asia.reduce((s, t) => s + t.pnlPips, 0) < -5) chopScore += 2;
  if (countOppositeFlips(trades) >= 2) chopScore += 1;
  if (countNoProgress(trades) >= 2) chopScore += 1;
  if (blocked.length >= 3) chopScore += 1;

  const net = trades.reduce((s, t) => s + t.pnlPips, 0);
  let profile = 'mixed';
  if (chopScore >= 6) profile = 'severe_chop';
  else if (chopScore >= 4) profile = 'chop';
  else if (wins / (trades.length || 1) >= 0.6 && net > 5) profile = 'continuation';
  else if (net > 0 && wins / (trades.length || 1) >= 0.5) profile = 'mild_positive';

  return {
    tradeDate,
    executedCount: trades.length,
    netPips: Math.round(net * 10) / 10,
    winRate: trades.length ? Math.round((100 * wins) / trades.length) : 0,
    slHitCount: slTrades.length,
    slHitPips: Math.round(slTrades.reduce((s, t) => s + t.pnlPips, 0) * 10) / 10,
    maxHoldCount: trades.filter((t) => t.closeReason === 'max_hold').length,
    asiaNetPips: Math.round(asia.reduce((s, t) => s + t.pnlPips, 0) * 10) / 10,
    asiaTradeCount: asia.length,
    asiaSlCount: asiaSl.length,
    distNetPips: Math.round(dist.reduce((s, t) => s + t.pnlPips, 0) * 10) / 10,
    distTradeCount: dist.length,
    oppositeFlipCount: countOppositeFlips(trades),
    avgDurationMin: trades.length
      ? Math.round(trades.reduce((s, t) => s + t.durationMinutes, 0) / trades.length)
      : 0,
    noProgressCount: countNoProgress(trades),
    blockedTotal: blocked.length,
    blockedOppositeWhileOpenProxy: blocked.filter((b) =>
      String(b.blockReason ?? '').includes('OMEGA_TRADE_OPEN'),
    ).length,
    chopScore,
    profile,
  };
}

async function main(): Promise<void> {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: execRaw, error: e1 } = await supabase
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

  if (e1) throw new Error(e1.message);

  const { data: blockRaw, error: e2 } = await supabase
    .from('bridge_trade_log')
    .select('signal_received_at, created_at, direction, block_reason, decision')
    .eq('engine_id', 'omega')
    .eq('decision', 'BLOCKED')
    .gte('created_at', '2026-04-14T00:00:00Z');

  if (e2) throw new Error(e2.message);

  const allTrades: TradeRow[] = (execRaw ?? []).map((r) => ({
    signalReceivedAt: String(r.signal_received_at ?? r.created_at),
    closedAt: String(r.closed_at),
    direction: String(r.direction),
    pnlPips: Number(r.pnl_pips),
    pnlR: r.pnl_r != null ? Number(r.pnl_r) : null,
    closeReason: r.close_reason != null ? String(r.close_reason) : null,
    durationMinutes: Number(r.duration_minutes ?? 0),
    brokerId: String(r.broker_id),
  }));

  const oanda = dedupeBySignalTime(allTrades.filter((t) => t.brokerId === 'oanda_practice'));

  const blocked: BlockRow[] = (blockRaw ?? []).map((r) => ({
    signalReceivedAt: String(r.signal_received_at ?? r.created_at),
    direction: String(r.direction),
    blockReason: r.block_reason != null ? String(r.block_reason) : null,
  }));

  const byDate = new Map<string, TradeRow[]>();
  for (const t of oanda) {
    const d = t.signalReceivedAt.slice(0, 10);
    const bucket = byDate.get(d) ?? [];
    bucket.push(t);
    byDate.set(d, bucket);
  }

  const blockedByDate = new Map<string, BlockRow[]>();
  for (const b of blocked) {
    const d = b.signalReceivedAt.slice(0, 10);
    const bucket = blockedByDate.get(d) ?? [];
    bucket.push(b);
    blockedByDate.set(d, bucket);
  }

  const days: DayMetrics[] = [];
  for (const [tradeDate, trades] of [...byDate.entries()].sort()) {
    if (trades.length < 2) continue;
    days.push(buildDayMetrics(tradeDate, trades, blockedByDate.get(tradeDate) ?? []));
  }

  const jul6 = days.find((d) => d.tradeDate === '2026-07-06');
  const jul3 = days.find((d) => d.tradeDate === '2026-07-03');
  const jul2 = days.find((d) => d.tradeDate === '2026-07-02');

  const severe = days.filter((d) => d.profile === 'severe_chop').sort((a, b) => a.netPips - b.netPips);
  const chop = days.filter((d) => d.profile === 'chop').sort((a, b) => a.netPips - b.netPips);
  const cont = days.filter((d) => d.profile === 'continuation').sort((a, b) => b.netPips - a.netPips);

  const similarJul6 = days
    .filter((d) => d.tradeDate !== '2026-07-06' && d.chopScore >= (jul6?.chopScore ?? 6) - 1)
    .sort((a, b) => b.chopScore - a.chopScore || a.netPips - b.netPips);

  const lines: string[] = [
    'OMEGA CHOP DAY CLUSTER SCAN (OANDA deduped, Apr 14+)',
    `Generated: ${new Date().toISOString()}`,
    `Days with >=2 trades: ${days.length}`,
    '',
    '=== TEMPLATE DAYS ===',
    formatDay(jul2, 'Jul 2'),
    formatDay(jul3, 'Jul 3'),
    formatDay(jul6, 'Jul 6'),
    '',
    '=== SEVERE CHOP (score>=6) ===',
    ...severe.map((d) => formatDay(d)),
    '',
    '=== CHOP (score 4-5) ===',
    ...chop.slice(0, 20).map((d) => formatDay(d)),
    '',
    '=== CONTINUATION (WR>=60%, net>5) ===',
    ...cont.slice(0, 15).map((d) => formatDay(d)),
    '',
    '=== SIMILAR TO JUL 6 (chopScore >= Jul6-1, excl Jul6) ===',
    ...similarJul6.slice(0, 15).map((d) => formatDay(d)),
    '',
    '=== CHOP DEFINITION DRAFT (from cluster) ===',
    describeDefinition(severe, chop, cont, jul6, jul3),
  ];

  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, 'chop_day_cluster_scan.txt');
  writeFileSync(outPath, lines.join('\n'));
  console.log(lines.join('\n'));
  console.log(`\nSaved: ${outPath}`);
}

function formatDay(d: DayMetrics | undefined, label?: string): string {
  if (!d) return `${label ?? '?'}: no data`;
  return [
    d.tradeDate,
    d.profile,
    `score=${d.chopScore}`,
    `n=${d.executedCount}`,
    `WR=${d.winRate}%`,
    `net=${d.netPips}p`,
    `SL=${d.slHitCount}(${d.slHitPips}p)`,
    `asia=${d.asiaNetPips}p/${d.asiaTradeCount}t sl=${d.asiaSlCount}`,
    `dist=${d.distNetPips}p/${d.distTradeCount}t`,
    `flips=${d.oppositeFlipCount}`,
    `noProg=${d.noProgressCount}`,
    `blk=${d.blockedTotal}(seq=${d.blockedOppositeWhileOpenProxy})`,
  ].join(' | ');
}

function describeDefinition(
  severe: DayMetrics[],
  chop: DayMetrics[],
  cont: DayMetrics[],
  jul6: DayMetrics | undefined,
  jul3: DayMetrics | undefined,
): string {
  const avg = (arr: DayMetrics[], pick: (d: DayMetrics) => number) =>
    arr.length ? (arr.reduce((s, d) => s + pick(d), 0) / arr.length).toFixed(1) : 'n/a';

  return [
    `Severe chop days (n=${severe.length}): avg net=${avg(severe, (d) => d.netPips)}p SL=${avg(severe, (d) => d.slHitCount)} asiaSL=${avg(severe, (d) => d.asiaSlCount)} flips=${avg(severe, (d) => d.oppositeFlipCount)}`,
    `Chop days (n=${chop.length}): avg net=${avg(chop, (d) => d.netPips)}p SL=${avg(chop, (d) => d.slHitCount)}`,
    `Continuation days (n=${cont.length}): avg net=${avg(cont, (d) => d.netPips)}p WR=${avg(cont, (d) => d.winRate)}% SL=${avg(severe, (d) => d.slHitCount)}`,
    jul6 ? `Jul6: score=${jul6.chopScore} profile=${jul6.profile}` : '',
    jul3 ? `Jul3: score=${jul3.chopScore} profile=${jul3.profile} (contrast)` : '',
  ].join('\n');
}

main().catch(console.error);
