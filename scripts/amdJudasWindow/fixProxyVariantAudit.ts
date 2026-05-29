/**
 * One-off audit: London Fix proxy variant counts (read-only).
 * Run: npx tsx scripts/amdJudasWindow/fixProxyVariantAudit.ts
 */

import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { isPotentialLondonFixDay } from './londonFixFlag.js';
import type { M5Bar } from '../regimeVsAmd/regimeVsAmdM5Walk.js';

dotenv.config();

const PAIR = 'AUD_USD';
const MIN_M5_BARS = 36;
const FIX_RANGE_PIPS_B = 20;
const SPIKE_BODY_PIPS = 8;
const SPIKE_BODY_MIN_FRAC = 0.6;

function buildSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or service key');
  return createClient(url, key);
}

function fixWindowBars(m5Candles: M5Bar[]): M5Bar[] {
  return m5Candles.filter((bar) => {
    const hourUtc = new Date(bar.time).getUTCHours();
    return hourUtc === 10 || hourUtc === 11;
  });
}

function sessionRangePips(fixBars: M5Bar[]): number | null {
  if (fixBars.length === 0) return null;
  let sessionHigh = -Infinity;
  let sessionLow = Infinity;
  for (const bar of fixBars) {
    const high = parseFloat(bar.h);
    const low = parseFloat(bar.l);
    if (Number.isFinite(high)) sessionHigh = Math.max(sessionHigh, high);
    if (Number.isFinite(low)) sessionLow = Math.min(sessionLow, low);
  }
  if (!Number.isFinite(sessionHigh) || !Number.isFinite(sessionLow)) return null;
  return Math.round((sessionHigh - sessionLow) * 10000);
}

function isFixRange(fixBars: M5Bar[], minPips: number): boolean {
  const rangePips = sessionRangePips(fixBars);
  return rangePips != null && rangePips >= minPips;
}

function candleBodyPips(bar: M5Bar): number {
  const open = parseFloat(bar.o);
  const close = parseFloat(bar.c);
  if (!Number.isFinite(open) || !Number.isFinite(close)) return 0;
  return Math.abs(close - open) * 10000;
}

function candleRangePips(bar: M5Bar): number {
  const high = parseFloat(bar.h);
  const low = parseFloat(bar.l);
  if (!Number.isFinite(high) || !Number.isFinite(low)) return 0;
  return (high - low) * 10000;
}

function isFixSpikeCandle(fixBars: M5Bar[]): boolean {
  return fixBars.some((bar) => candleBodyPips(bar) >= SPIKE_BODY_PIPS);
}

function isFixDirectionalSpike(fixBars: M5Bar[]): boolean {
  return fixBars.some((bar) => {
    const bodyPips = candleBodyPips(bar);
    const rangePips = candleRangePips(bar);
    if (rangePips <= 0) return false;
    return bodyPips >= SPIKE_BODY_PIPS && bodyPips / rangePips >= SPIKE_BODY_MIN_FRAC;
  });
}

function pct(n: number, total: number): string {
  return `${Math.round((1000 * n) / total) / 10}%`;
}

async function main(): Promise<void> {
  const supabase = buildSupabase();
  const { data: amdRows, error: amdErr } = await supabase
    .from('amd_state')
    .select('trade_date, chart_data')
    .eq('pair', PAIR)
    .order('trade_date', { ascending: true });
  if (amdErr) throw new Error(amdErr.message);

  const { data: m5Rows, error: m5Err } = await supabase
    .from('amd_m5_distribution_candles')
    .select('trade_date, candles, candle_count, fetch_status')
    .eq('pair', PAIR)
    .eq('fetch_status', 'success')
    .gte('candle_count', MIN_M5_BARS);
  if (m5Err) throw new Error(m5Err.message);

  const m5Map = new Map<string, M5Bar[]>();
  for (const row of m5Rows ?? []) {
    m5Map.set(row.trade_date as string, (row.candles ?? []) as M5Bar[]);
  }

  let cohort = 0;
  let fixA = 0;
  let fixB = 0;
  let fixC = 0;
  let fixD = 0;
  let aOnly = 0;
  let bOnly = 0;
  let bothAb = 0;
  let neitherAb = 0;

  for (const amdRow of amdRows ?? []) {
    if (!amdRow.chart_data) continue;
    const m5 = m5Map.get(amdRow.trade_date as string);
    if (!m5?.length) continue;
    cohort += 1;

    const fixBars = fixWindowBars(m5);
    const flagA = isPotentialLondonFixDay(m5);
    const flagB = isFixRange(fixBars, FIX_RANGE_PIPS_B);
    const flagC = isFixSpikeCandle(fixBars);
    const flagD = isFixDirectionalSpike(fixBars);

    if (flagA) fixA += 1;
    if (flagB) fixB += 1;
    if (flagC) fixC += 1;
    if (flagD) fixD += 1;

    if (flagA && flagB) bothAb += 1;
    else if (flagA && !flagB) aOnly += 1;
    else if (!flagA && flagB) bOnly += 1;
    else neitherAb += 1;
  }

  const flipAb = aOnly + bOnly;

  console.log('\n=== London Fix proxy variant audit ===');
  console.log(`Cohort (amd_state chart + M5 success ≥${MIN_M5_BARS}): n=${cohort}\n`);

  const variants = [
    { id: 'FIX_A', label: 'range 10:00-11:00 UTC ≥ 10 pips (current)', n: fixA },
    { id: 'FIX_B', label: 'range 10:00-11:00 UTC ≥ 20 pips', n: fixB },
    { id: 'FIX_C', label: 'any M5 body ≥ 8 pips in 10:00-11:00', n: fixC },
    {
      id: 'FIX_D',
      label: 'body ≥ 8 pips AND body ≥ 60% of candle range',
      n: fixD,
    },
  ];

  for (const v of variants) {
    console.log(`${v.id} (${v.label})`);
    console.log(`  n flagged: ${v.n}`);
    console.log(`  % of cohort: ${pct(v.n, cohort)}\n`);
  }

  console.log('Cross-tab FIX_A (current) vs FIX_B (range ≥20p):');
  console.log(`  both true:     ${bothAb}`);
  console.log(`  A only (flip): ${aOnly}`);
  console.log(`  B only (flip): ${bOnly}`);
  console.log(`  neither:       ${neitherAb}`);
  console.log(`  total flip (A≠B): ${flipAb}`);
}

main().catch((err) => {
  console.error('[FixProxyAudit] Fatal:', err);
  process.exitCode = 1;
});
