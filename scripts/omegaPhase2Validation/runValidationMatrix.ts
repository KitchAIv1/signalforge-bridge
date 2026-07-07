/**
 * Phase 2 flag validation matrix + slowdown counterfactuals.
 * Run: npx tsx scripts/omegaPhase2Validation/runValidationMatrix.ts
 */

import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import {
  computeDayFlags,
  type AmdAsianSlice,
  type TimelineEntry,
} from './computeFlags.js';
import { SLOWDOWN_RULES, simulateDayPips, type SlowdownId } from './simSlowdown.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(SCRIPT_DIR, 'output');

interface DaySummary {
  tradeDate: string;
  netPips: number;
  winRate: number;
  asiaSl: number;
  label: 'chop' | 'continuation' | 'mixed';
}

function normDir(raw: string): 'long' | 'short' | null {
  const d = raw.toLowerCase();
  if (d === 'long' || d === 'short') return d;
  return null;
}

function isSlLike(pnl: number, reason: string | null): boolean {
  return reason === 'trail_sl_hit' || pnl <= -7;
}

function classifyLabel(net: number, winRate: number, asiaSl: number): DaySummary['label'] {
  if (net <= -15 || (asiaSl >= 2 && net < 0)) return 'chop';
  if (net >= 5 && winRate >= 55 && asiaSl === 0) return 'continuation';
  return 'mixed';
}

function pct(num: number, den: number): string {
  if (den === 0) return 'n/a';
  return `${Math.round((100 * num) / den)}%`;
}

async function main(): Promise<void> {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: execRows, error: e1 } = await supabase
    .from('bridge_trade_log')
    .select(
      'signal_received_at, closed_at, direction, pnl_pips, pnl_r, close_reason, broker_id, decision, status',
    )
    .eq('engine_id', 'omega')
    .eq('decision', 'EXECUTED')
    .eq('status', 'closed')
    .not('pnl_pips', 'is', null)
    .gte('created_at', '2026-04-14T00:00:00Z')
    .order('signal_received_at');

  if (e1) throw new Error(e1.message);

  const { data: execTimelineRows } = await supabase
    .from('bridge_trade_log')
    .select('signal_received_at, direction, broker_id, decision, status')
    .eq('engine_id', 'omega')
    .eq('decision', 'EXECUTED')
    .gte('created_at', '2026-04-14T00:00:00Z')
    .order('signal_received_at');

  const { data: blockRows, error: e2 } = await supabase
    .from('bridge_trade_log')
    .select('signal_received_at, created_at, direction, block_reason, decision')
    .eq('engine_id', 'omega')
    .eq('decision', 'BLOCKED')
    .gte('created_at', '2026-04-14T00:00:00Z');

  if (e2) throw new Error(e2.message);

  const { data: amdRows, error: e3 } = await supabase
    .from('amd_state')
    .select(
      'trade_date, asian_is_flat, accumulation_quality_score, asian_net_pips, asian_range_pips',
    )
    .gte('trade_date', '2026-04-14');

  if (e3) throw new Error(e3.message);

  const amdByDate = new Map<string, AmdAsianSlice>();
  for (const row of amdRows ?? []) {
    amdByDate.set(String(row.trade_date), {
      asianIsFlat: row.asian_is_flat as boolean | null,
      accumulationQuality:
        row.accumulation_quality_score != null
          ? Number(row.accumulation_quality_score)
          : null,
      asianNetPips: row.asian_net_pips != null ? Number(row.asian_net_pips) : null,
      asianRangePips: row.asian_range_pips != null ? Number(row.asian_range_pips) : null,
    });
  }

  const byDate = new Map<string, { simTrades: ReturnType<typeof mapSim>[] }>();
  const timelineFillsByDate = new Map<string, TimelineEntry[]>();
  const blockByDate = new Map<string, TimelineEntry[]>();

  for (const row of execTimelineRows ?? []) {
    const dir = normDir(String(row.direction));
    if (!dir) continue;
    const signalAt = String(row.signal_received_at);
    if (!signalAt || signalAt === 'null') continue;
    const tradeDate = signalAt.slice(0, 10);
    const entry: TimelineEntry = {
      atMs: Date.parse(signalAt),
      direction: dir,
      kind: 'fill',
      pnlPips: null,
    };
    const bucket = timelineFillsByDate.get(tradeDate) ?? [];
    bucket.push(entry);
    timelineFillsByDate.set(tradeDate, bucket);
  }

  for (const row of execRows ?? []) {
    const dir = normDir(String(row.direction));
    if (!dir) continue;
    const signalAt = String(row.signal_received_at);
    const tradeDate = signalAt.slice(0, 10);
    const bucket = byDate.get(tradeDate) ?? { simTrades: [] };
    if (String(row.broker_id) === 'oanda_practice') {
      bucket.simTrades.push(mapSim(row));
    }
    byDate.set(tradeDate, bucket);
  }

  for (const row of blockRows ?? []) {
    const reason = String(row.block_reason ?? '');
    if (!reason.includes('OMEGA_TRADE_OPEN')) continue;
    const dir = normDir(String(row.direction));
    if (!dir) continue;
    const signalAt = String(row.signal_received_at ?? row.created_at);
    const tradeDate = signalAt.slice(0, 10);
    const entry: TimelineEntry = {
      atMs: Date.parse(signalAt),
      direction: dir,
      kind: 'block',
      pnlPips: null,
    };
    const bucket = blockByDate.get(tradeDate) ?? [];
    bucket.push(entry);
    blockByDate.set(tradeDate, bucket);
  }

  const daySummaries: DaySummary[] = [];
  const flagRows: Array<DaySummary & ReturnType<typeof computeDayFlags>> = [];

  for (const [tradeDate, bucket] of [...byDate.entries()].sort()) {
    if (bucket.simTrades.length < 2) continue;
    const net = bucket.simTrades.reduce((s, t) => s + t.pnlPips, 0);
    const wins = bucket.simTrades.filter((t) => t.pnlPips > 0).length;
    const winRate =
      bucket.simTrades.length > 0
        ? Math.round((100 * wins) / bucket.simTrades.length)
        : 0;
    const asiaSl = bucket.simTrades.filter(
      (t) =>
        new Date(t.signalReceivedAt).getUTCHours() <= 5 &&
        isSlLike(t.pnlPips, t.closeReason),
    ).length;
    const label = classifyLabel(net, winRate, asiaSl);
    const summary: DaySummary = {
      tradeDate,
      netPips: Math.round(net * 10) / 10,
      winRate,
      asiaSl,
      label,
    };
    daySummaries.push(summary);
    const bleedFills = (execRows ?? [])
      .filter((row) => String(row.signal_received_at).slice(0, 10) === tradeDate)
      .map((row) => ({
        atMs: Date.parse(String(row.signal_received_at)),
        direction: normDir(String(row.direction))!,
        kind: 'fill' as const,
        pnlPips: Number(row.pnl_pips),
      }))
      .filter((row) => row.direction != null);
    const flags = computeDayFlags(
      tradeDate,
      bleedFills,
      blockByDate.get(tradeDate) ?? [],
      amdByDate.get(tradeDate) ?? null,
      timelineFillsByDate.get(tradeDate) ?? [],
    );
    flagRows.push({ ...summary, ...flags });
  }

  const chopDays = daySummaries.filter((d) => d.label === 'chop');
  const contDays = daySummaries.filter((d) => d.label === 'continuation');

  const flagNames = [
    ['executionBleed', 'Execution bleed (2+ SL before 10 or <=-15p)'],
    ['flipStormRaw', 'Flip storm raw (2+ dir changes / 90m, fills+blocks)'],
    ['flipStormAfterSl', 'Flip storm after SL-like fill'],
    ['dayCautionAmd', 'Day caution AMD (flat / accum>=0.7 / low dir ratio)'],
    ['dayCautionStrict', 'Day caution strict (flat AND accum>=0.7)'],
    ['twoPlusFlags', '2+ flags agreement'],
  ] as const;

  const lines: string[] = [
    'PHASE 2 VALIDATION MATRIX',
    `Generated: ${new Date().toISOString()}`,
    `Days analyzed: ${daySummaries.length} (>=2 OANDA trades)`,
    `Ground truth chop: ${chopDays.length} days (net<=-15 OR 2+ Asia SL & net<0)`,
    `Ground truth continuation: ${contDays.length} days (net>=5, WR>=55%, 0 Asia SL)`,
    '',
    '=== FLAG ACCURACY vs CHOP DAYS (want HIGH recall) ===',
  ];

  for (const [key, label] of flagNames) {
    const tp = flagRows.filter((r) => r.label === 'chop' && r[key]).length;
    const fn = flagRows.filter((r) => r.label === 'chop' && !r[key]).length;
    lines.push(`${label}: TP ${tp}/${chopDays.length} recall=${pct(tp, chopDays.length)}`);
  }

  lines.push('', '=== FLAG ACCURACY vs CONTINUATION DAYS (want LOW false positive) ===');
  for (const [key, label] of flagNames) {
    const fp = flagRows.filter((r) => r.label === 'continuation' && r[key]).length;
    const tn = flagRows.filter((r) => r.label === 'continuation' && !r[key]).length;
    lines.push(`${label}: FP ${fp}/${contDays.length} specificity=${pct(tn, contDays.length)}`);
  }

  lines.push('', '=== PER-DAY FLAG TABLE (sorted by net pips) ===');
  lines.push(
    'date | label | net | bleed | storm | storm+SL | caution | 2+ | sl10 | bleedPips',
  );
  for (const r of [...flagRows].sort((a, b) => a.netPips - b.netPips)) {
    lines.push(
      [
        r.tradeDate,
        r.label,
        `${r.netPips}p`,
        r.executionBleed ? 'Y' : '.',
        r.flipStormRaw ? 'Y' : '.',
        r.flipStormAfterSl ? 'Y' : '.',
        r.dayCautionAmd ? 'Y' : '.',
        r.twoPlusFlags ? 'Y' : '.',
        r.bleedSlBefore10,
        r.bleedBefore10Pips,
      ].join(' | '),
    );
  }

  lines.push('', '=== SLOWDOWN COUNTERFACTUAL (OANDA deduped, full period) ===');
  const totals = new Map<SlowdownId, number>();
  for (const rule of SLOWDOWN_RULES) totals.set(rule.id, 0);

  for (const row of flagRows) {
    const bucket = byDate.get(row.tradeDate);
    if (!bucket) continue;
    for (const rule of SLOWDOWN_RULES) {
      const pnl = simulateDayPips(bucket.simTrades, row, rule.id);
      totals.set(rule.id, (totals.get(rule.id) ?? 0) + pnl);
    }
  }

  const actualTotal = totals.get('actual') ?? 0;
  for (const rule of SLOWDOWN_RULES) {
    const t = totals.get(rule.id) ?? 0;
    const delta = Math.round((t - actualTotal) * 10) / 10;
    lines.push(`${rule.label}: ${t}p (${delta >= 0 ? '+' : ''}${delta}p vs actual)`);
  }

  lines.push('', '=== SLOWDOWN ON CHOP DAYS ONLY ===');
  for (const rule of SLOWDOWN_RULES) {
    let sum = 0;
    let actual = 0;
    for (const row of flagRows.filter((r) => r.label === 'chop')) {
      const bucket = byDate.get(row.tradeDate)!;
      sum += simulateDayPips(bucket.simTrades, row, rule.id);
      actual += row.netPips;
    }
    lines.push(`${rule.label}: chop-only ${sum}p (actual ${actual}p, delta ${Math.round((sum - actual) * 10) / 10}p)`);
  }

  lines.push('', '=== SLOWDOWN ON CONTINUATION DAYS ONLY ===');
  for (const rule of SLOWDOWN_RULES) {
    let sum = 0;
    let actual = 0;
    for (const row of flagRows.filter((r) => r.label === 'continuation')) {
      const bucket = byDate.get(row.tradeDate)!;
      sum += simulateDayPips(bucket.simTrades, row, rule.id);
      actual += row.netPips;
    }
    lines.push(`${rule.label}: cont-only ${sum}p (actual ${actual}p, delta ${Math.round((sum - actual) * 10) / 10}p)`);
  }

  lines.push('', '=== RECOMMENDED SLOW-DOWN DEFINITIONS ===', recommendText(flagRows, totals, actualTotal));

  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, 'phase2_validation_matrix.txt');
  writeFileSync(outPath, lines.join('\n'));
  console.log(lines.join('\n'));
  console.log(`\nSaved: ${outPath}`);
}

function mapSim(row: Record<string, unknown>) {
  return {
    signalReceivedAt: String(row.signal_received_at),
    closedAt: String(row.closed_at),
    direction: String(row.direction).toLowerCase() as 'long' | 'short',
    pnlPips: Number(row.pnl_pips),
    closeReason: row.close_reason != null ? String(row.close_reason) : null,
  };
}

function recommendText(
  flagRows: Array<DaySummary & ReturnType<typeof computeDayFlags>>,
  totals: Map<SlowdownId, number>,
  actualTotal: number,
): string {
  const jul = flagRows.find((r) => r.tradeDate === '2026-07-06');
  const jul3 = flagRows.find((r) => r.tradeDate === '2026-07-03');
  const r1 = totals.get('r1_only') ?? 0;
  const combo = totals.get('r1_sd_opp_two_plus') ?? 0;
  return [
    `Jul6 flags: ${jul ? JSON.stringify({
      bleed: jul.executionBleed,
      storm: jul.flipStormRaw,
      caution: jul.dayCautionAmd,
      twoPlus: jul.twoPlusFlags,
    }) : 'n/a'}`,
    `Jul3 flags: ${jul3 ? JSON.stringify({
      bleed: jul3.executionBleed,
      storm: jul3.flipStormRaw,
      caution: jul3.dayCautionAmd,
      twoPlus: jul3.twoPlusFlags,
    }) : 'n/a'}`,
    `Best full-period combo check: R1=${r1}p vs R1+2+=${combo}p (actual ${actualTotal}p)`,
    '',
    'DEPLOY TIER 1 (high confidence): R1 — already validated separately',
    'DEPLOY TIER 2 (shadow log first): two_plus + skip opposite after 10:31',
    'DEPLOY TIER 3 (shadow only): day_caution alone — test FP on continuation days',
    'REJECT for now: skip ALL dist on caution — too blunt unless FP proven low',
  ].join('\n');
}

main().catch(console.error);
